use serde::Serialize;
use std::env;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const AGENT_PORT: u16 = 47851;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct ManagedAgentProcess {
    child: Child,
    pid: u32,
    started_at_ms: u128,
}

#[derive(Clone, Default)]
struct RuntimeCleanupSnapshot {
    pids: Vec<u32>,
    at_ms: u128,
}

#[derive(Default)]
struct AgentProcessState {
    child: Mutex<Option<ManagedAgentProcess>>,
    last_cleanup: Mutex<Option<RuntimeCleanupSnapshot>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentPaths {
    agent_dir: Option<String>,
    agent_entry: Option<String>,
    agent_entry_exists: bool,
    config_path: String,
    session_path: String,
    log_path: String,
    node_command: String,
    node_exists: bool,
    node_version: Option<String>,
    runtime_origin: String,
    resource_dir: Option<String>,
}

#[derive(Clone)]
struct ResolvedAgentRuntime {
    agent_dir: Option<PathBuf>,
    agent_entry: Option<PathBuf>,
    node_command: String,
    node_exists: bool,
    node_version: Option<String>,
    runtime_origin: String,
    resource_dir: Option<PathBuf>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentProcessStatus {
    managed_running: bool,
    managed_pid: Option<u32>,
    managed_started_at_ms: Option<u128>,
    managed_process_tree_pids: Vec<u32>,
    runtime_process_pids: Vec<u32>,
    browser_session_pids: Vec<u32>,
    port_owner_pid: Option<u32>,
    runtime_locked: bool,
    last_cleanup_pids: Vec<u32>,
    last_cleanup_at_ms: Option<u128>,
    port_open: bool,
    external_running: bool,
    can_start: bool,
    port: u16,
    message: Option<String>,
    paths: AgentPaths,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentLogResponse {
    exists: bool,
    log_path: String,
    lines: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentMaintenanceResponse {
    ok: bool,
    message: String,
    log_path: Option<String>,
    archived_log_path: Option<String>,
    session_path: Option<String>,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn ps_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

#[cfg(target_os = "windows")]
fn run_hidden_output(program: &str, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .stdout(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .map_err(|error| format!("Falha ao executar {program}: {error}"))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(target_os = "windows")]
fn run_powershell_lines(script: &str) -> Vec<String> {
    run_hidden_output(
        "powershell.exe",
        &[
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ],
    )
    .map(|stdout| {
        stdout
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(str::to_string)
            .collect()
    })
    .unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn parse_pid_lines(lines: Vec<String>) -> Vec<u32> {
    let mut pids = lines
        .into_iter()
        .filter_map(|line| line.parse::<u32>().ok())
        .collect::<Vec<_>>();
    pids.sort_unstable();
    pids.dedup();
    pids
}

fn app_data_dir() -> PathBuf {
    if let Some(appdata) = env::var_os("APPDATA") {
        return PathBuf::from(appdata);
    }

    if let Some(user_profile) = env::var_os("USERPROFILE") {
        return PathBuf::from(user_profile).join("AppData").join("Roaming");
    }

    if let Some(home) = env::var_os("HOME") {
        return PathBuf::from(home);
    }

    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn agent_config_dir() -> PathBuf {
    app_data_dir().join("RiverLub").join("whatsapp-agent")
}

fn env_path_var(name: &str) -> Option<PathBuf> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn resolve_resource_dir(app: Option<&tauri::AppHandle>) -> Option<PathBuf> {
    app.and_then(|handle| handle.path().resource_dir().ok())
}

fn resolve_dev_agent_dir() -> Option<PathBuf> {
    let mut cursor = env::current_dir().ok();

    while let Some(root) = cursor {
        let candidate = root.join("backend").join("whatsapp-agent");
        let entry = candidate.join("src").join("index.js");

        if entry.exists() {
            return fs::canonicalize(&candidate).ok().or(Some(candidate));
        }

        cursor = root.parent().map(Path::to_path_buf);
    }

    None
}

fn resolve_agent_runtime(app: Option<&tauri::AppHandle>) -> ResolvedAgentRuntime {
    let resource_dir = resolve_resource_dir(app);
    let env_agent_dir = env_path_var("RIVERLUB_CONNECT_AGENT_DIR").and_then(|candidate| {
        let entry = candidate.join("src").join("index.js");
        if entry.exists() {
            fs::canonicalize(candidate).ok()
        } else {
            None
        }
    });
    let bundled_agent_dir = resource_dir.as_ref().and_then(|dir| {
        let candidate = dir.join("runtime").join("whatsapp-agent");
        let entry = candidate.join("src").join("index.js");
        if entry.exists() {
            Some(candidate)
        } else {
            None
        }
    });
    let dev_agent_dir = resolve_dev_agent_dir();

    let (agent_dir, runtime_origin) = if env_agent_dir.is_some() {
        (env_agent_dir, "custom-env".to_string())
    } else if bundled_agent_dir.is_some() {
        (bundled_agent_dir, "bundled".to_string())
    } else if dev_agent_dir.is_some() {
        (dev_agent_dir, "development".to_string())
    } else {
        (None, "missing".to_string())
    };

    let bundled_node = resource_dir
        .as_ref()
        .map(|dir| dir.join("runtime").join("node").join("node.exe"))
        .filter(|candidate| candidate.exists());
    let node_command = env::var("RIVERLUB_CONNECT_NODE_PATH")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| bundled_node.as_ref().map(|path| display_path(path)))
        .unwrap_or_else(|| "node".to_string());
    let node_version = resolve_node_version(&node_command);
    let node_exists = node_version.is_some() || PathBuf::from(&node_command).exists();
    let agent_entry = agent_dir
        .as_ref()
        .map(|dir| dir.join("src").join("index.js"));

    ResolvedAgentRuntime {
        agent_dir,
        agent_entry,
        node_command,
        node_exists,
        node_version,
        runtime_origin,
        resource_dir,
    }
}

fn resolve_node_version(node_command: &str) -> Option<String> {
    let mut command = Command::new(node_command);
    command
        .arg("--version")
        .stdin(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn resolve_agent_paths(app: Option<&tauri::AppHandle>) -> AgentPaths {
    let config_dir = agent_config_dir();
    let config_path = config_dir.join("config.json");
    let session_path = config_dir.join("session");
    let log_path = config_dir.join("logs").join("agent.log");
    let runtime = resolve_agent_runtime(app);
    let agent_entry_exists = runtime
        .agent_entry
        .as_ref()
        .is_some_and(|entry| entry.exists());

    AgentPaths {
        agent_dir: runtime.agent_dir.as_ref().map(|path| display_path(path)),
        agent_entry: runtime.agent_entry.as_ref().map(|path| display_path(path)),
        agent_entry_exists,
        config_path: display_path(&config_path),
        session_path: display_path(&session_path),
        log_path: display_path(&log_path),
        node_command: runtime.node_command,
        node_exists: runtime.node_exists,
        node_version: runtime.node_version,
        runtime_origin: runtime.runtime_origin,
        resource_dir: runtime.resource_dir.as_ref().map(|path| display_path(path)),
    }
}

fn is_agent_port_open() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], AGENT_PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(350)).is_ok()
}

fn wait_for_agent_port_closed(timeout: Duration) -> bool {
    let started = now_ms();
    while now_ms().saturating_sub(started) < timeout.as_millis() {
        if !is_agent_port_open() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(120));
    }

    !is_agent_port_open()
}

fn is_runtime_locked(path: Option<&PathBuf>) -> bool {
    let Some(path) = path else {
        return false;
    };

    if !path.exists() {
        return false;
    }

    OpenOptions::new().write(true).open(path).is_err()
}

fn runtime_node_path(runtime: &ResolvedAgentRuntime) -> Option<PathBuf> {
    let path = PathBuf::from(&runtime.node_command);

    if path.exists() && path.is_absolute() {
        Some(path)
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn process_ids_by_executable_path(path: &Path) -> Vec<u32> {
    let path = ps_single_quoted(&display_path(path));
    let script = format!(
        "$p = '{path}'; Get-Process -ErrorAction SilentlyContinue | ForEach-Object {{ try {{ if ($_.Path -eq $p) {{ $_.Id }} }} catch {{}} }}"
    );

    parse_pid_lines(run_powershell_lines(&script))
}

#[cfg(not(target_os = "windows"))]
fn process_ids_by_executable_path(_path: &Path) -> Vec<u32> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn browser_session_process_pids() -> Vec<u32> {
    let session_dir = agent_config_dir()
        .join("session")
        .join("session-riverlub-local-agent");
    let needle = ps_single_quoted(&display_path(&session_dir).to_ascii_lowercase());
    let script = format!(
        "$needle = '{needle}'; Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {{ ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'msedge.exe') -and $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle) }} | ForEach-Object {{ $_.ProcessId }}"
    );

    parse_pid_lines(run_powershell_lines(&script))
}

#[cfg(not(target_os = "windows"))]
fn browser_session_process_pids() -> Vec<u32> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn process_tree_pids(pid: u32) -> Vec<u32> {
    let script = format!(
        "$root = {pid}; $all = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Select-Object ProcessId,ParentProcessId; $queue = New-Object 'System.Collections.Generic.Queue[int]'; $seen = @{{}}; $queue.Enqueue([int]$root); while ($queue.Count -gt 0) {{ $pid = $queue.Dequeue(); if ($seen.ContainsKey([string]$pid)) {{ continue }}; $seen[[string]$pid] = $true; $all | Where-Object {{ $_.ParentProcessId -eq $pid }} | ForEach-Object {{ $queue.Enqueue([int]$_.ProcessId) }} }}; $seen.Keys | Sort-Object {{ [int]$_ }}"
    );

    parse_pid_lines(run_powershell_lines(&script))
}

#[cfg(not(target_os = "windows"))]
fn process_tree_pids(pid: u32) -> Vec<u32> {
    vec![pid]
}

#[cfg(target_os = "windows")]
fn port_owner_pid() -> Option<u32> {
    let output = run_hidden_output("netstat.exe", &["-ano", "-p", "TCP"]).ok()?;

    output.lines().find_map(|line| {
        let value = line.trim();
        if !value.contains("127.0.0.1:47851") || !value.contains("LISTENING") {
            return None;
        }

        value
            .split_whitespace()
            .last()
            .and_then(|pid| pid.parse::<u32>().ok())
    })
}

#[cfg(not(target_os = "windows"))]
fn port_owner_pid() -> Option<u32> {
    None
}

#[cfg(target_os = "windows")]
fn kill_process_tree(pid: u32) -> Result<(), String> {
    let pid_text = pid.to_string();
    let mut command = Command::new("taskkill.exe");
    command
        .args(["/PID", &pid_text, "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW);

    let _ = command
        .status()
        .map_err(|error| format!("Falha ao encerrar arvore do processo {pid}: {error}"))?;

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn kill_process_tree(_pid: u32) -> Result<(), String> {
    Ok(())
}

fn wait_for_runtime_unlock(path: Option<&PathBuf>, timeout: Duration) -> bool {
    let started = now_ms();
    while now_ms().saturating_sub(started) < timeout.as_millis() {
        if !is_runtime_locked(path) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(120));
    }

    !is_runtime_locked(path)
}

fn runtime_process_pids(runtime: &ResolvedAgentRuntime) -> Vec<u32> {
    runtime_node_path(runtime)
        .as_ref()
        .map(|path| process_ids_by_executable_path(path))
        .unwrap_or_default()
}

fn request_local_agent(method: &str, path: &str) -> Result<serde_json::Value, String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], AGENT_PORT));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(1300))
        .map_err(|_| "Agente local nao respondeu em 127.0.0.1:47851".to_string())?;

    stream
        .set_read_timeout(Some(Duration::from_millis(1800)))
        .map_err(|error| format!("Falha ao configurar leitura local: {error}"))?;
    stream
        .set_write_timeout(Some(Duration::from_millis(800)))
        .map_err(|error| format!("Falha ao configurar escrita local: {error}"))?;

    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{AGENT_PORT}\r\nContent-Type: application/json\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );

    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("Falha ao chamar agente local: {error}"))?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| format!("Falha ao ler resposta do agente local: {error}"))?;

    let (headers, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "Resposta local invalida do agente WhatsApp".to_string())?;
    let status_line = headers.lines().next().unwrap_or_default();
    let payload = serde_json::from_str::<serde_json::Value>(body.trim()).unwrap_or_else(|_| {
        serde_json::json!({
            "sucesso": false,
            "erro": "Resposta local sem JSON valido"
        })
    });

    if !status_line.contains(" 200 ") {
        let message = payload
            .get("erro")
            .and_then(|value| value.as_str())
            .unwrap_or("Agente local retornou erro");
        return Err(message.to_string());
    }

    Ok(payload)
}

fn is_allowed_external_url(url: &str) -> bool {
    let value = url.trim().to_ascii_lowercase();

    value.starts_with("https://app.riverlub.com.br/")
        || value == "https://app.riverlub.com.br"
        || value.starts_with("https://riverlub-frontend-vercel.vercel.app/")
        || value == "https://riverlub-frontend-vercel.vercel.app"
        || value.starts_with("https://github.com/jhefersonalvez2-netizen/riverlub-connect/")
}

fn deep_link_route(arg: &str) -> Option<&'static str> {
    let value = arg.trim().trim_matches('"').to_ascii_lowercase();

    match value.as_str() {
        "riverlub-connect://open" | "riverlub-connect://open/" => Some("home"),
        "riverlub-connect://open/whatsapp" | "riverlub-connect://open/whatsapp/" => {
            Some("whatsapp")
        }
        _ => None,
    }
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn handle_deep_link_args(app: &tauri::AppHandle, args: Vec<String>) {
    let route = args.iter().find_map(|arg| deep_link_route(arg));

    if let Some(route) = route {
        focus_main_window(app);
        let _ = app.emit("riverlub-deep-link", route);
    }
}

fn current_managed_process(
    state: &AgentProcessState,
) -> Result<(bool, Option<u32>, Option<u128>), String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|_| "Nao foi possivel ler o processo gerenciado".to_string())?;

    if let Some(managed) = guard.as_mut() {
        match managed.child.try_wait() {
            Ok(Some(_status)) => {
                *guard = None;
                Ok((false, None, None))
            }
            Ok(None) => Ok((true, Some(managed.pid), Some(managed.started_at_ms))),
            Err(error) => Err(format!("Nao foi possivel verificar o processo: {error}")),
        }
    } else {
        Ok((false, None, None))
    }
}

fn last_cleanup_snapshot(state: &AgentProcessState) -> Result<(Vec<u32>, Option<u128>), String> {
    let guard = state
        .last_cleanup
        .lock()
        .map_err(|_| "Nao foi possivel ler limpeza recente do runtime".to_string())?;

    if let Some(snapshot) = guard.as_ref() {
        Ok((snapshot.pids.clone(), Some(snapshot.at_ms)))
    } else {
        Ok((Vec::new(), None))
    }
}

fn record_cleanup_snapshot(state: &AgentProcessState, pids: Vec<u32>) -> Result<(), String> {
    if pids.is_empty() {
        return Ok(());
    }

    let mut guard = state
        .last_cleanup
        .lock()
        .map_err(|_| "Nao foi possivel registrar limpeza do runtime".to_string())?;
    *guard = Some(RuntimeCleanupSnapshot {
        pids,
        at_ms: now_ms(),
    });

    Ok(())
}

fn cleanup_orphaned_runtime_processes(
    state: &AgentProcessState,
    app: &tauri::AppHandle,
) -> Result<Vec<u32>, String> {
    let runtime = resolve_agent_runtime(Some(app));
    let node_path = runtime_node_path(&runtime);
    let (_, managed_pid, _) = current_managed_process(state)?;
    let mut candidates = runtime_process_pids(&runtime);

    candidates.extend(browser_session_process_pids());
    candidates.sort_unstable();
    candidates.dedup();

    let mut killed = Vec::new();
    for pid in candidates {
        if Some(pid) == managed_pid {
            continue;
        }

        kill_process_tree(pid)?;
        killed.push(pid);
    }

    if !killed.is_empty() {
        wait_for_agent_port_closed(Duration::from_millis(2500));
        wait_for_runtime_unlock(node_path.as_ref(), Duration::from_millis(2500));
        record_cleanup_snapshot(state, killed.clone())?;
    }

    Ok(killed)
}

fn build_process_status(
    state: &AgentProcessState,
    app: Option<&tauri::AppHandle>,
    message: Option<String>,
) -> Result<AgentProcessStatus, String> {
    let (managed_running, managed_pid, managed_started_at_ms) = current_managed_process(state)?;
    let runtime = resolve_agent_runtime(app);
    let node_path = runtime_node_path(&runtime);
    let runtime_process_pids = runtime_process_pids(&runtime);
    let browser_session_pids = browser_session_process_pids();
    let managed_process_tree_pids = managed_pid.map(process_tree_pids).unwrap_or_default();
    let port_owner_pid = port_owner_pid();
    let runtime_locked = is_runtime_locked(node_path.as_ref());
    let (last_cleanup_pids, last_cleanup_at_ms) = last_cleanup_snapshot(state)?;
    let port_open = is_agent_port_open();
    let paths = resolve_agent_paths(app);
    let external_running = port_open && !managed_running;
    let can_start = paths.agent_entry_exists && !port_open && !managed_running;

    Ok(AgentProcessStatus {
        managed_running,
        managed_pid,
        managed_started_at_ms,
        managed_process_tree_pids,
        runtime_process_pids,
        browser_session_pids,
        port_owner_pid,
        runtime_locked,
        last_cleanup_pids,
        last_cleanup_at_ms,
        port_open,
        external_running,
        can_start,
        port: AGENT_PORT,
        message,
        paths,
    })
}

fn spawn_managed_agent(
    state: &AgentProcessState,
    app: &tauri::AppHandle,
) -> Result<AgentProcessStatus, String> {
    if current_managed_process(state)?.0 {
        return build_process_status(
            state,
            Some(app),
            Some("Agente ja esta sendo gerenciado pelo RiverLub Connect.".to_string()),
        );
    }

    if is_agent_port_open() {
        return build_process_status(
            state,
            Some(app),
            Some(
                "Porta 47851 ja esta em uso. O Connect vai monitorar o agente existente sem encerrar processo externo."
                    .to_string(),
            ),
        );
    }

    let runtime = resolve_agent_runtime(Some(app));
    let agent_dir = runtime.agent_dir.ok_or_else(|| {
        "Nao encontrei o agente WhatsApp empacotado. Reinstale o RiverLub Connect pela release mais recente."
            .to_string()
    })?;
    let agent_entry = runtime
        .agent_entry
        .unwrap_or_else(|| agent_dir.join("src").join("index.js"));

    if !agent_entry.exists() {
        return Err(format!(
            "Arquivo do agente WhatsApp nao encontrado em {}",
            display_path(&agent_entry)
        ));
    }

    if !runtime.node_exists || runtime.node_version.is_none() {
        return Err(format!(
            "Runtime Node nao encontrado para iniciar o agente. Caminho tentado: {}",
            runtime.node_command
        ));
    }

    let mut command = Command::new(&runtime.node_command);
    command
        .arg("src/index.js")
        .current_dir(&agent_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .env("RIVERLUB_CONNECT_MANAGED", "1")
        .env("RIVERLUB_AGENT_RUNTIME_ORIGIN", &runtime.runtime_origin)
        .env("RIVERLUB_AGENT_RUNTIME_DIR", display_path(&agent_dir));

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = command.spawn().map_err(|error| {
        format!(
            "Nao foi possivel iniciar o agente WhatsApp com '{}': {}",
            runtime.node_command, error
        )
    })?;

    let pid = child.id();
    let managed = ManagedAgentProcess {
        child,
        pid,
        started_at_ms: now_ms(),
    };

    {
        let mut guard = state
            .child
            .lock()
            .map_err(|_| "Nao foi possivel salvar o processo gerenciado".to_string())?;
        *guard = Some(managed);
    }

    std::thread::sleep(Duration::from_millis(500));

    build_process_status(
        state,
        Some(app),
        Some("Agente WhatsApp iniciado pelo RiverLub Connect.".to_string()),
    )
}

fn stop_managed_agent(state: &AgentProcessState) -> Result<bool, String> {
    let mut child_to_stop = {
        let mut guard = state
            .child
            .lock()
            .map_err(|_| "Nao foi possivel acessar o processo gerenciado".to_string())?;
        guard.take()
    };

    if let Some(mut managed) = child_to_stop.take() {
        if is_agent_port_open() {
            let _ = request_local_agent("POST", "/shutdown");
            wait_for_agent_port_closed(Duration::from_millis(1800));
        }

        let _ = kill_process_tree(managed.pid);
        let _ = managed.child.kill();
        let _ = managed.child.wait();
        for pid in browser_session_process_pids() {
            let _ = kill_process_tree(pid);
        }
        wait_for_agent_port_closed(Duration::from_millis(2500));
        return Ok(true);
    }

    Ok(false)
}

#[tauri::command]
fn agent_process_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentProcessState>,
) -> Result<AgentProcessStatus, String> {
    build_process_status(&state, Some(&app), None)
}

#[tauri::command]
fn local_agent_health() -> Result<serde_json::Value, String> {
    request_local_agent("GET", "/health")
}

#[tauri::command]
fn local_agent_qr() -> Result<serde_json::Value, String> {
    request_local_agent("GET", "/qr")
}

#[tauri::command]
fn disconnect_agent_session() -> Result<serde_json::Value, String> {
    request_local_agent("POST", "/desconectar")
}

#[tauri::command]
fn start_agent_process(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentProcessState>,
) -> Result<AgentProcessStatus, String> {
    spawn_managed_agent(&state, &app)
}

#[tauri::command]
fn stop_agent_process(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentProcessState>,
) -> Result<AgentProcessStatus, String> {
    let stopped = stop_managed_agent(&state)?;
    std::thread::sleep(Duration::from_millis(350));

    let message = if stopped {
        "Processo iniciado pelo RiverLub Connect foi encerrado.".to_string()
    } else if is_agent_port_open() {
        "Agente externo detectado na porta 47851. Por seguranca, o Connect nao encerrou processo do .cmd."
            .to_string()
    } else {
        "Nenhum processo gerenciado pelo RiverLub Connect estava em execucao.".to_string()
    };

    build_process_status(&state, Some(&app), Some(message))
}

#[tauri::command]
fn restart_agent_process(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentProcessState>,
) -> Result<AgentProcessStatus, String> {
    let stopped = stop_managed_agent(&state)?;
    std::thread::sleep(Duration::from_millis(450));

    if is_agent_port_open() && !stopped {
        return build_process_status(
            &state,
            Some(&app),
            Some(
                "Agente externo ja esta ocupando a porta 47851. Reinicio completo exige fechar o .cmd atual."
                    .to_string(),
            ),
        );
    }

    spawn_managed_agent(&state, &app)
}

#[tauri::command]
fn cleanup_runtime_orphans(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentProcessState>,
) -> Result<AgentProcessStatus, String> {
    let killed = cleanup_orphaned_runtime_processes(&state, &app)?;
    let message = if killed.is_empty() {
        "Nenhum runtime antigo do RiverLub Connect estava preso.".to_string()
    } else {
        format!(
            "Runtime antigo encerrado com seguranca (PID{} {}).",
            if killed.len() > 1 { "s" } else { "" },
            killed
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        )
    };

    build_process_status(&state, Some(&app), Some(message))
}

#[tauri::command]
fn read_agent_logs(
    app: tauri::AppHandle,
    limit: Option<usize>,
) -> Result<AgentLogResponse, String> {
    let paths = resolve_agent_paths(Some(&app));
    let limit = limit.unwrap_or(80).clamp(1, 300);
    let log_path = PathBuf::from(&paths.log_path);

    if !log_path.exists() {
        return Ok(AgentLogResponse {
            exists: false,
            log_path: paths.log_path,
            lines: Vec::new(),
        });
    }

    let content = fs::read_to_string(&log_path)
        .map_err(|error| format!("Nao foi possivel ler logs do agente: {error}"))?;
    let lines = content
        .lines()
        .rev()
        .take(limit)
        .map(str::to_string)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();

    Ok(AgentLogResponse {
        exists: true,
        log_path: paths.log_path,
        lines,
    })
}

#[tauri::command]
fn clear_agent_logs(app: tauri::AppHandle) -> Result<AgentMaintenanceResponse, String> {
    let paths = resolve_agent_paths(Some(&app));
    let log_path = PathBuf::from(&paths.log_path);

    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Nao foi possivel preparar a pasta de logs: {error}"))?;
    }

    let archived_log_path = if log_path.exists() {
        let archive_path = log_path.with_file_name(format!("agent-{}.log", now_ms()));
        fs::rename(&log_path, &archive_path)
            .map_err(|error| format!("Nao foi possivel arquivar logs antigos: {error}"))?;
        Some(display_path(&archive_path))
    } else {
        None
    };

    fs::write(&log_path, "")
        .map_err(|error| format!("Nao foi possivel limpar o log do agente: {error}"))?;

    Ok(AgentMaintenanceResponse {
        ok: true,
        message: "Logs antigos arquivados e leitura local limpa.".to_string(),
        log_path: Some(display_path(&log_path)),
        archived_log_path,
        session_path: None,
    })
}

#[tauri::command]
fn reset_agent_test_session(
    state: tauri::State<'_, AgentProcessState>,
) -> Result<AgentMaintenanceResponse, String> {
    let managed_was_running = current_managed_process(&state)?.0;

    if managed_was_running {
        let _ = stop_managed_agent(&state)?;
        std::thread::sleep(Duration::from_millis(650));
    }

    if is_agent_port_open() {
        return Err(
            "A porta 47851 ainda esta ocupada por um agente externo. Feche o .cmd ou processo antigo antes de resetar a sessao."
                .to_string(),
        );
    }

    let session_path = agent_config_dir().join("session");

    if session_path.exists() {
        fs::remove_dir_all(&session_path)
            .map_err(|error| format!("Nao foi possivel remover a sessao LocalAuth: {error}"))?;
    }

    Ok(AgentMaintenanceResponse {
        ok: true,
        message: "Sessao de teste removida. Clique em Conectar WhatsApp para gerar um novo QR."
            .to_string(),
        log_path: None,
        archived_log_path: None,
        session_path: Some(display_path(&session_path)),
    })
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let url = url.trim().to_string();

    if !is_allowed_external_url(&url) {
        return Err("URL externa nao permitida pelo RiverLub Connect.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", &url])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|error| format!("Nao foi possivel abrir o navegador: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|error| format!("Nao foi possivel abrir o navegador: {error}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|error| format!("Nao foi possivel abrir o navegador: {error}"))?;
        return Ok(());
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            handle_deep_link_args(app, args);
        }))
        .manage(AgentProcessState::default())
        .setup(|app| {
            let state = app.state::<AgentProcessState>();
            let _ = cleanup_orphaned_runtime_processes(&state, app.handle());
            handle_deep_link_args(app.handle(), env::args().collect());
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let state = window.state::<AgentProcessState>();
                let _ = stop_managed_agent(&state);
            }
        })
        .invoke_handler(tauri::generate_handler![
            agent_process_status,
            local_agent_health,
            local_agent_qr,
            disconnect_agent_session,
            start_agent_process,
            stop_agent_process,
            restart_agent_process,
            cleanup_runtime_orphans,
            read_agent_logs,
            clear_agent_logs,
            reset_agent_test_session,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar RiverLub Connect");
}
