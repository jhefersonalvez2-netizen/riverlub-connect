from pathlib import Path
import json
import textwrap

ROOT = Path('.')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Patch anchor not found: {label}')
    return text.replace(old, new, 1)


def block(value: str) -> str:
    return textwrap.dedent(value).lstrip('\n').rstrip() + '\n'


lifecycle = block(r'''
use std::env;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use win32job::Job;

const UI_CONTROL_PORT: u16 = 47850;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct ProcessTreeGuard {
    #[cfg(target_os = "windows")]
    job: Option<Job>,
}

impl ProcessTreeGuard {
    pub fn install() -> Self {
        #[cfg(target_os = "windows")]
        {
            match Job::create() {
                Ok(job) => match job.query_extended_limit_info() {
                    Ok(mut limits) => {
                        limits.limit_kill_on_job_close();
                        if let Err(error) = job.set_extended_limit_info(&limits) {
                            log_event("JOB_OBJECT_FAILED", &format!("set limits: {error}"));
                            return Self { job: None };
                        }
                        if let Err(error) = job.assign_current_process() {
                            log_event("JOB_OBJECT_FAILED", &format!("assign current process: {error}"));
                            return Self { job: None };
                        }
                        log_event(
                            "JOB_OBJECT_ACTIVE",
                            "process tree protected by Windows Job Object",
                        );
                        Self { job: Some(job) }
                    }
                    Err(error) => {
                        log_event("JOB_OBJECT_FAILED", &format!("query limits: {error}"));
                        Self { job: None }
                    }
                },
                Err(error) => {
                    log_event("JOB_OBJECT_FAILED", &format!("create: {error}"));
                    Self { job: None }
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            Self {}
        }
    }

    pub fn active(&self) -> bool {
        #[cfg(target_os = "windows")]
        {
            self.job.is_some()
        }

        #[cfg(not(target_os = "windows"))]
        {
            false
        }
    }
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn local_app_data_dir() -> PathBuf {
    if let Some(value) = env::var_os("LOCALAPPDATA") {
        return PathBuf::from(value);
    }

    if let Some(value) = env::var_os("APPDATA") {
        return PathBuf::from(value);
    }

    if let Some(value) = env::var_os("USERPROFILE") {
        return PathBuf::from(value).join("AppData").join("Local");
    }

    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn app_state_dir() -> PathBuf {
    local_app_data_dir().join("RiverLub Connect").join("state")
}

fn log_dir() -> PathBuf {
    local_app_data_dir().join("RiverLub Connect").join("logs")
}

pub fn log_event(event: &str, message: &str) {
    let dir = log_dir();
    if fs::create_dir_all(&dir).is_err() {
        return;
    }

    let path = dir.join("desktop.log");
    if fs::metadata(&path)
        .map(|metadata| metadata.len() > 5 * 1024 * 1024)
        .unwrap_or(false)
    {
        let previous = dir.join("desktop.previous.log");
        let _ = fs::remove_file(&previous);
        let _ = fs::rename(&path, &previous);
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let clean = message.replace(['\r', '\n'], " ");
        let _ = writeln!(file, "{} {} {}", unix_ms(), event, clean);
    }
}

pub fn versioned_runtime_dir() -> PathBuf {
    local_app_data_dir()
        .join("RiverLub Connect")
        .join("runtime")
        .join(env!("CARGO_PKG_VERSION"))
}

fn files_equal(left: &Path, right: &Path) -> bool {
    let Ok(left_meta) = fs::metadata(left) else {
        return false;
    };
    let Ok(right_meta) = fs::metadata(right) else {
        return false;
    };

    if left_meta.len() != right_meta.len() {
        return false;
    }

    let Ok(mut left_file) = fs::File::open(left) else {
        return false;
    };
    let Ok(mut right_file) = fs::File::open(right) else {
        return false;
    };

    let mut left_buf = [0u8; 64 * 1024];
    let mut right_buf = [0u8; 64 * 1024];

    loop {
        let Ok(left_read) = left_file.read(&mut left_buf) else {
            return false;
        };
        let Ok(right_read) = right_file.read(&mut right_buf) else {
            return false;
        };

        if left_read != right_read || left_buf[..left_read] != right_buf[..right_read] {
            return false;
        }

        if left_read == 0 {
            return true;
        }
    }
}

fn runtime_is_valid(source: &Path, destination: &Path) -> bool {
    let marker = destination.join(".ready");
    if fs::read_to_string(marker).ok().as_deref() != Some(env!("CARGO_PKG_VERSION")) {
        return false;
    }

    [
        "node/node.exe",
        "whatsapp-agent/package.json",
        "whatsapp-agent/src/index.js",
    ]
    .iter()
    .all(|relative| files_equal(&source.join(relative), &destination.join(relative)))
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|error| format!("Nao foi possivel criar runtime versionado: {error}"))?;

    for entry in fs::read_dir(source)
        .map_err(|error| format!("Nao foi possivel ler runtime empacotado: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Falha ao ler item do runtime: {error}"))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let kind = entry
            .file_type()
            .map_err(|error| format!("Falha ao identificar item do runtime: {error}"))?;

        if kind.is_dir() {
            copy_directory(&source_path, &destination_path)?;
        } else if kind.is_file() {
            fs::copy(&source_path, &destination_path)
                .map_err(|error| format!("Falha ao copiar runtime: {error}"))?;
        }
    }

    Ok(())
}

pub fn ensure_versioned_runtime(app: &tauri::AppHandle) -> Result<(), String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Nao foi possivel localizar recursos do Connect: {error}"))?;
    let source = resource_dir.join("runtime");
    let destination = versioned_runtime_dir();

    if runtime_is_valid(&source, &destination) {
        log_event("RUNTIME_READY", &format!("{} reused", destination.display()));
        return Ok(());
    }

    if !source.join("node").join("node.exe").exists()
        || !source
            .join("whatsapp-agent")
            .join("src")
            .join("index.js")
            .exists()
    {
        return Err("Runtime empacotado incompleto. Reinstale o RiverLub Connect.".to_string());
    }

    let root = destination
        .parent()
        .ok_or_else(|| "Diretorio de runtime invalido".to_string())?;
    fs::create_dir_all(root)
        .map_err(|error| format!("Nao foi possivel preparar runtime local: {error}"))?;

    let staging = root.join(format!(
        ".{}.staging-{}",
        env!("CARGO_PKG_VERSION"),
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&staging);
    copy_directory(&source, &staging)?;
    fs::write(staging.join(".ready"), env!("CARGO_PKG_VERSION"))
        .map_err(|error| format!("Nao foi possivel finalizar runtime local: {error}"))?;

    if !runtime_is_valid(&source, &staging) {
        let _ = fs::remove_dir_all(&staging);
        return Err("Validacao do runtime local falhou; instalacao nao foi ativada.".to_string());
    }

    if destination.exists() {
        fs::remove_dir_all(&destination)
            .map_err(|error| format!("Runtime local anterior esta bloqueado: {error}"))?;
    }

    fs::rename(&staging, &destination)
        .map_err(|error| format!("Nao foi possivel ativar runtime versionado: {error}"))?;
    log_event("RUNTIME_INSTALLED", &destination.display().to_string());
    Ok(())
}

fn route_from_args(args: &[String]) -> &'static str {
    if args.iter().any(|arg| {
        let value = arg.trim_matches('"');
        value.eq_ignore_ascii_case("riverlub-connect://open/whatsapp")
            || value.eq_ignore_ascii_case("riverlub-connect://open/whatsapp/")
    }) {
        "whatsapp"
    } else {
        "home"
    }
}

fn control_addr() -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], UI_CONTROL_PORT))
}

fn write_primary_pid() -> Result<(), String> {
    let dir = app_state_dir();
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Nao foi possivel criar estado local: {error}"))?;
    fs::write(dir.join("ui.pid"), std::process::id().to_string())
        .map_err(|error| format!("Nao foi possivel registrar PID local: {error}"))
}

fn activate_existing(args: &[String]) -> Result<(), String> {
    let mut stream = TcpStream::connect_timeout(&control_addr(), Duration::from_millis(700))
        .map_err(|error| format!("instancia existente nao respondeu: {error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_millis(1600)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_millis(800)))
        .map_err(|error| error.to_string())?;

    let payload = format!("ACTIVATE {}\n", route_from_args(args));
    stream
        .write_all(payload.as_bytes())
        .map_err(|error| format!("falha ao ativar instancia existente: {error}"))?;

    let mut response = [0u8; 16];
    let read = stream
        .read(&mut response)
        .map_err(|error| format!("instancia existente nao confirmou ativacao: {error}"))?;

    if std::str::from_utf8(&response[..read])
        .unwrap_or_default()
        .starts_with("OK")
    {
        Ok(())
    } else {
        Err("instancia existente respondeu de forma invalida".to_string())
    }
}

#[cfg(target_os = "windows")]
fn hidden_command(program: &str) -> Command {
    let mut command = Command::new(program);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(target_os = "windows")]
fn process_executable(pid: u32) -> Option<PathBuf> {
    let script = format!(
        "$p = Get-Process -Id {pid} -ErrorAction SilentlyContinue; if ($p) {{ try {{ $p.Path }} catch {{}} }}"
    );
    let output = hidden_command("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!value.is_empty()).then(|| PathBuf::from(value))
}

#[cfg(target_os = "windows")]
fn recover_stale_primary() -> bool {
    let pid = fs::read_to_string(app_state_dir().join("ui.pid"))
        .ok()
        .and_then(|value| value.trim().parse::<u32>().ok());
    let Some(pid) = pid else {
        return false;
    };

    if pid == std::process::id() {
        return false;
    }

    let Some(process_path) = process_executable(pid) else {
        return false;
    };
    let Ok(current_path) = env::current_exe() else {
        return false;
    };

    let process_value = fs::canonicalize(process_path)
        .ok()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase();
    let current_value = fs::canonicalize(current_path)
        .ok()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase();

    if process_value.is_empty() || process_value != current_value {
        log_event("STALE_RECOVERY_REFUSED", &format!("pid={pid} path mismatch"));
        return false;
    }

    let status = hidden_command("taskkill.exe")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    if status.map(|value| value.success()).unwrap_or(false) {
        log_event("STALE_UI_TERMINATED", &format!("pid={pid}"));
        for _ in 0..30 {
            match TcpListener::bind(control_addr()) {
                Ok(probe) => {
                    drop(probe);
                    return true;
                }
                Err(_) => thread::sleep(Duration::from_millis(100)),
            }
        }
    }

    false
}

#[cfg(not(target_os = "windows"))]
fn recover_stale_primary() -> bool {
    false
}

pub fn acquire_primary_instance(args: &[String]) -> Result<Option<TcpListener>, String> {
    match TcpListener::bind(control_addr()) {
        Ok(listener) => {
            write_primary_pid()?;
            log_event("PRIMARY_INSTANCE", &format!("pid={}", std::process::id()));
            Ok(Some(listener))
        }
        Err(bind_error) => {
            if activate_existing(args).is_ok() {
                log_event("SECOND_INSTANCE_ACTIVATED", route_from_args(args));
                return Ok(None);
            }

            if recover_stale_primary() {
                for _ in 0..30 {
                    match TcpListener::bind(control_addr()) {
                        Ok(listener) => {
                            write_primary_pid()?;
                            log_event(
                                "STALE_UI_RECOVERED",
                                &format!("pid={}", std::process::id()),
                            );
                            return Ok(Some(listener));
                        }
                        Err(_) => thread::sleep(Duration::from_millis(100)),
                    }
                }
            }

            Err(format!(
                "Ja existe uma instancia do RiverLub Connect sem resposta e ela nao pode ser recuperada com seguranca ({bind_error})."
            ))
        }
    }
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn start_control_server(listener: TcpListener, app: tauri::AppHandle) {
    thread::spawn(move || {
        for incoming in listener.incoming() {
            let Ok(mut stream) = incoming else {
                continue;
            };
            let _ = stream.set_read_timeout(Some(Duration::from_millis(1200)));
            let mut buffer = [0u8; 256];
            let Ok(read) = stream.read(&mut buffer) else {
                continue;
            };
            let command = String::from_utf8_lossy(&buffer[..read]);

            if command.starts_with("ACTIVATE") {
                focus_main_window(&app);
                let route = if command.contains("whatsapp") {
                    "whatsapp"
                } else {
                    "home"
                };
                let _ = app.emit("riverlub-deep-link", route);
                let _ = stream.write_all(b"OK\n");
                log_event("UI_ACTIVATE_ACK", route);
            }
        }
    });
}

pub fn install_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Abrir RiverLub Connect", true, None::<&str>)?;
    let restart_item = MenuItem::with_id(
        app,
        "restart-agent",
        "Reiniciar WhatsApp",
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(
        app,
        "quit",
        "Sair completamente",
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(app, &[&open_item, &restart_item, &quit_item])?;

    let mut builder = TrayIconBuilder::with_id("riverlub-connect-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("RiverLub Connect")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                focus_main_window(app);
                log_event("TRAY_OPEN", "window restored");
            }
            "restart-agent" => {
                let state = app.state::<super::AgentProcessState>();
                let _ = super::stop_managed_agent(&state);
                thread::sleep(Duration::from_millis(450));
                match super::spawn_managed_agent(&state, app) {
                    Ok(_) => log_event("TRAY_AGENT_RESTART", "success"),
                    Err(error) => log_event("TRAY_AGENT_RESTART_FAILED", &error),
                }
            }
            "quit" => {
                let state = app.state::<super::AgentProcessState>();
                let _ = super::stop_managed_agent(&state);
                log_event("APP_EXIT", "explicit tray exit");
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                focus_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    let _ = builder.build(app)?;
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn versioned_runtime_process_pids() -> Vec<u32> {
    let root = local_app_data_dir()
        .join("RiverLub Connect")
        .join("runtime")
        .to_string_lossy()
        .replace('\'', "''")
        .to_ascii_lowercase();
    let script = format!(
        "$root = '{root}'; Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object {{ try {{ $path = $_.Path.ToLowerInvariant(); if ($path.StartsWith($root) -and $path.EndsWith('\\node\\node.exe')) {{ $_.Id }} }} catch {{}} }}"
    );

    hidden_command("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()
        .map(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter_map(|line| line.trim().parse::<u32>().ok())
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(not(target_os = "windows"))]
pub fn versioned_runtime_process_pids() -> Vec<u32> {
    Vec::new()
}

pub fn show_startup_error(message: &str) {
    log_event("STARTUP_ERROR", message);

    #[cfg(target_os = "windows")]
    {
        let safe = message.replace('\'', "''");
        let script = format!(
            "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('{safe}', 'RiverLub Connect') | Out-Null"
        );
        let _ = hidden_command("powershell.exe")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &script,
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    #[cfg(not(target_os = "windows"))]
    eprintln!("RiverLub Connect: {message}");
}
''')

(ROOT / 'src-tauri/src/desktop_lifecycle.rs').write_text(lifecycle, encoding='utf-8')

lib_path = ROOT / 'src-tauri/src/lib.rs'
lib = lib_path.read_text(encoding='utf-8')
lib = replace_once(
    lib,
    'use tauri::{Emitter, Manager};\n',
    'use tauri::{Emitter, Manager};\n\nmod desktop_lifecycle;\n',
    'desktop lifecycle module import',
)
lib = replace_once(
    lib,
    '    let resource_dir = resolve_resource_dir(app);\n',
    '    let resource_dir = resolve_resource_dir(app);\n    let versioned_runtime_dir = desktop_lifecycle::versioned_runtime_dir();\n',
    'versioned runtime root',
)
lib = replace_once(
    lib,
    '    let bundled_agent_dir = resource_dir.as_ref().and_then(|dir| {\n',
    '    let versioned_agent_dir = {\n        let candidate = versioned_runtime_dir.join("whatsapp-agent");\n        let entry = candidate.join("src").join("index.js");\n        entry.exists().then_some(candidate)\n    };\n    let bundled_agent_dir = resource_dir.as_ref().and_then(|dir| {\n',
    'versioned agent directory',
)
lib = replace_once(
    lib,
    '    } else if bundled_agent_dir.is_some() {\n        (bundled_agent_dir, "bundled".to_string())\n',
    '    } else if versioned_agent_dir.is_some() {\n        (versioned_agent_dir, "versioned".to_string())\n    } else if bundled_agent_dir.is_some() {\n        (bundled_agent_dir, "bundled".to_string())\n',
    'prefer versioned agent',
)
lib = replace_once(
    lib,
    '    let bundled_node = resource_dir\n',
    '    let versioned_node = {\n        let candidate = versioned_runtime_dir.join("node").join("node.exe");\n        candidate.exists().then_some(candidate)\n    };\n    let bundled_node = resource_dir\n',
    'versioned node',
)
lib = replace_once(
    lib,
    '        .or_else(|| bundled_node.as_ref().map(|path| display_path(path)))\n',
    '        .or_else(|| versioned_node.as_ref().map(|path| display_path(path)))\n        .or_else(|| bundled_node.as_ref().map(|path| display_path(path)))\n',
    'prefer versioned node',
)
lib = replace_once(
    lib,
    '    let mut candidates = runtime_process_pids(&runtime);\n\n    candidates.extend(browser_session_process_pids());\n',
    '    let mut candidates = runtime_process_pids(&runtime);\n\n    candidates.extend(desktop_lifecycle::versioned_runtime_process_pids());\n    candidates.extend(browser_session_process_pids());\n',
    'cleanup versioned runtimes',
)

run_start = lib.index('pub fn run() {')
builder_start = lib.index('    tauri::Builder::default()', run_start)
setup_anchor = '        .setup(|app| {'
setup_pos = lib.index(setup_anchor, builder_start)
setup_tail = setup_pos + len(setup_anchor)
new_run_prefix = block('''
pub fn run() {
    let args = env::args().collect::<Vec<_>>();
    let control_listener = match desktop_lifecycle::acquire_primary_instance(&args) {
        Ok(Some(listener)) => listener,
        Ok(None) => return,
        Err(error) => {
            desktop_lifecycle::show_startup_error(&error);
            return;
        }
    };

    let _process_tree_guard = desktop_lifecycle::ProcessTreeGuard::install();
    desktop_lifecycle::log_event(
        "UI_START",
        &format!(
            "version={} pid={} job_object={}",
            env!("CARGO_PKG_VERSION"),
            std::process::id(),
            _process_tree_guard.active()
        ),
    );

    tauri::Builder::default()
        .manage(AgentProcessState::default())
        .setup(move |app| {
''').rstrip('\n')
lib = lib[:run_start] + new_run_prefix + lib[setup_tail:]

lib = replace_once(
    lib,
    '            let state = app.state::<AgentProcessState>();\n            let _ = cleanup_orphaned_runtime_processes(&state, app.handle());\n',
    '            desktop_lifecycle::start_control_server(control_listener, app.handle().clone());\n            desktop_lifecycle::install_tray(app)?;\n            desktop_lifecycle::ensure_versioned_runtime(app.handle()).map_err(|error| {\n                std::io::Error::new(std::io::ErrorKind::Other, error)\n            })?;\n            let state = app.state::<AgentProcessState>();\n            let _ = cleanup_orphaned_runtime_processes(&state, app.handle());\n',
    'setup lifecycle services',
)
lib = replace_once(
    lib,
    '                api.prevent_close();\n                let _ = window.hide();\n',
    '                api.prevent_close();\n                desktop_lifecycle::log_event("UI_HIDE_TO_TRAY", "close button requested");\n                let _ = window.hide();\n',
    'close to tray logging',
)
lib_path.write_text(lib, encoding='utf-8')

cargo_path = ROOT / 'src-tauri/Cargo.toml'
cargo = cargo_path.read_text(encoding='utf-8')
cargo = cargo.replace('version = "0.3.8"', 'version = "0.4.0"', 1)
cargo = cargo.replace(
    'tauri = { version = "2", features = [] }',
    'tauri = { version = "2", features = ["tray-icon"] }',
)
cargo = cargo.replace('tauri-plugin-single-instance = "2"\n', '')
if 'win32job' not in cargo:
    cargo += '\n[target.\'cfg(windows)\'.dependencies]\nwin32job = "2.0.3"\n'
cargo_path.write_text(cargo, encoding='utf-8')

package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = '0.4.0'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

tauri_path = ROOT / 'src-tauri/tauri.conf.json'
tauri = json.loads(tauri_path.read_text(encoding='utf-8'))
tauri['version'] = '0.4.0'
tauri_path.write_text(json.dumps(tauri, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

nsis = block(r'''
!macro RIVERLUB_KILL_RUNTIME
  DetailPrint "Encerrando RiverLub Connect e runtime legado..."
  nsExec::ExecToLog `taskkill.exe /F /T /IM "${MAINBINARYNAME}.exe"`
  nsExec::ExecToStack `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$$nodePath = '$INSTDIR\runtime\node\node.exe'; $$deadline = (Get-Date).AddSeconds(12); do { Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object { try { if ($$_.Path -eq $$nodePath) { & taskkill.exe /PID $$_.Id /T /F | Out-Null } } catch {} }; Start-Sleep -Milliseconds 300; $$remaining = @(Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { try { $$_.Path -eq $$nodePath } catch { $$false } }); } while ($$remaining.Count -gt 0 -and (Get-Date) -lt $$deadline); if ($$remaining.Count -gt 0) { exit 42 }; exit 0"`
  Pop $0
  Pop $1
  StrCmp $0 "0" +3
  MessageBox MB_ICONSTOP|MB_OK "O RiverLub Connect ainda possui um runtime legado em uso. A instalacao foi interrompida para evitar arquivos misturados entre versoes. Feche o aplicativo e tente novamente."
  Abort
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro RIVERLUB_KILL_RUNTIME
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\riverlub-connect" "" "URL:RiverLub Connect"
  WriteRegStr HKCU "Software\Classes\riverlub-connect" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\riverlub-connect\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\riverlub-connect\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro RIVERLUB_KILL_RUNTIME
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\riverlub-connect"
!macroend
''')
(ROOT / 'src-tauri/nsis-hooks.nsh').write_text(nsis, encoding='utf-8')

ci_path = ROOT / '.github/workflows/ci.yml'
ci = ci_path.read_text(encoding='utf-8')
if 'windows-lifecycle:' not in ci:
    ci += block('''

  windows-lifecycle:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
      - name: Validate Windows desktop lifecycle
        shell: powershell
        run: |
          npm ci
          npm run build:ui
          New-Item -ItemType Directory -Force vendor/node | Out-Null
          Copy-Item (Get-Command node.exe).Source vendor/node/node.exe -Force
          npm ci --omit=dev --ignore-scripts --prefix vendor/whatsapp-agent
          node vendor/whatsapp-agent/patches/apply-media-id-fix.cjs
          cargo check --manifest-path src-tauri/Cargo.toml
''')
ci_path.write_text(ci, encoding='utf-8')

release_path = ROOT / '.github/workflows/release-windows.yml'
release = release_path.read_text(encoding='utf-8')
old_note = '--notes "RiverLub Connect $env:VERSION com agente WhatsApp 1.3.9, progresso persistente da fila, retomada segura apos reinicio e patch de midia preservado. Requer API de checkpoints e migration 2026-09-19-whatsapp-job-progresso.sql no backend."'
new_note = '--notes "RiverLub Connect $env:VERSION com lifecycle Windows endurecido: runtime versionado fora da pasta executada pelo instalador, Job Object para eliminar processos orfaos, recuperacao segura de instancia travada, tray explicito e instalacao fail-safe. Mantem agente WhatsApp 1.3.9 e persistencia da fila."'
release = replace_once(release, old_note, new_note, 'release notes')
release_path.write_text(release, encoding='utf-8')

readme_path = ROOT / 'README.md'
readme = readme_path.read_text(encoding='utf-8')
if '## Arquitetura de lifecycle v0.4' not in readme:
    readme += block('''

## Arquitetura de lifecycle v0.4

- O runtime executavel e copiado de forma validada para `%LOCALAPPDATA%/RiverLub Connect/runtime/<versao>` e nunca e executado diretamente da pasta que o instalador sobrescreve.
- A ativacao da pasta de runtime usa staging + rename, evitando runtime parcialmente copiado.
- No Windows, o processo principal usa Job Object com `KILL_ON_JOB_CLOSE`; Node e Chrome/Edge descendentes sao encerrados pelo sistema operacional se o Connect morrer.
- A instancia unica usa IPC local em `127.0.0.1:47850`; uma segunda abertura restaura a janela e, se a instancia anterior estiver travada, so a encerra apos validar o PID e o caminho exato do executavel.
- O X envia o Connect para a bandeja. A bandeja oferece Abrir, Reiniciar WhatsApp e Sair completamente.
- O instalador aborta se o runtime legado continuar bloqueado; nao e permitido seguir com instalacao parcial.
- Eventos do desktop ficam em `%LOCALAPPDATA%/RiverLub Connect/logs/desktop.log` com rotacao simples e sem QR/token.
''')
readme_path.write_text(readme, encoding='utf-8')

print('v0.4 source migration applied')
