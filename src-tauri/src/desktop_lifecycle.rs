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
                            log_event(
                                "JOB_OBJECT_FAILED",
                                &format!("assign current process: {error}"),
                            );
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
        log_event(
            "RUNTIME_READY",
            &format!("{} reused", destination.display()),
        );
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
        log_event(
            "STALE_RECOVERY_REFUSED",
            &format!("pid={pid} path mismatch"),
        );
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
                            log_event("STALE_UI_RECOVERED", &format!("pid={}", std::process::id()));
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
    let quit_item = MenuItem::with_id(app, "quit", "Sair completamente", true, None::<&str>)?;
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
