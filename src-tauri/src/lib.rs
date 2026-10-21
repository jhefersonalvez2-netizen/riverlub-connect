use serde::Serialize;
use serde_json::{json, Value};
use std::env;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::io::AsRawHandle;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

const AGENT_PORT: u16 = 47851;
const SUPERVISOR_PORT: u16 = 47850;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone, Default)]
struct RuntimeCleanupSnapshot {
    pids: Vec<u32>,
    at_ms: u128,
}

#[derive(Default)]
struct AppState {
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
    last_exit_code: Option<i32>,
    last_exit_at_ms: Option<u128>,
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

struct ManagedAgent {
    child: Child,
    pid: u32,
    started_at_ms: u128,
    job_handle: isize,
}

struct SupervisorState {
    child: Option<ManagedAgent>,
    desired_running: bool,
    node_command: String,
    agent_dir: PathBuf,
    runtime_origin: String,
    restart_failures: u32,
    last_exit_code: Option<i32>,
    last_exit_at_ms: Option<u128>,
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

fn app_data_dir() -> PathBuf {
    if let Some(appdata) = env::var_os("APPDATA") {
        return PathBuf::from(appdata);
    }
    if let Some(user_profile) = env::var_os("USERPROFILE") {
        return PathBuf::from(user_profile).join("AppData").join("Roaming");
    }
    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn agent_config_dir() -> PathBuf {
    app_data_dir().join("RiverLub").join("whatsapp-agent")
}

fn resolve_resource_dir(app: Option<&tauri::AppHandle>) -> Option<PathBuf> {
    app.and_then(|handle| handle.path().resource_dir().ok())
}

fn resolve_dev_agent_dir() -> Option<PathBuf> {
    let mut cursor = env::current_dir().ok();
    while let Some(root) = cursor {
        let candidate = root.join("backend").join("whatsapp-agent");
        if candidate.join("src").join("index.js").exists() {
            return fs::canonicalize(&candidate).ok().or(Some(candidate));
        }
        cursor = root.parent().map(Path::to_path_buf);
    }
    None
}

fn resolve_node_version(node_command: &str) -> Option<String> {
    let mut command = Command::new(node_command);
    command.arg("--version").stdin(Stdio::null()).stderr(Stdio::null());
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

fn resolve_agent_runtime(app: Option<&tauri::AppHandle>) -> ResolvedAgentRuntime {
    let resource_dir = resolve_resource_dir(app);
    let bundled_agent_dir = resource_dir.as_ref().and_then(|dir| {
        let candidate = dir.join("runtime").join(env!("CARGO_PKG_VERSION")).join("whatsapp-agent");
        candidate
            .join("src")
            .join("index.js")
            .exists()
            .then_some(candidate)
    });
    let dev_agent_dir = resolve_dev_agent_dir();
    let (agent_dir, runtime_origin) = if let Some(path) = bundled_agent_dir {
        (Some(path), "bundled".to_string())
    } else if let Some(path) = dev_agent_dir {
        (Some(path), "development".to_string())
    } else {
        (None, "missing".to_string())
    };
    let bundled_node = resource_dir
        .as_ref()
        .map(|dir| dir.join("runtime").join(env!("CARGO_PKG_VERSION")).join("node").join("node.exe"))
        .filter(|candidate| candidate.exists());
    let node_command = bundled_node
        .as_ref()
        .map(|path| display_path(path))
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

fn resolve_agent_paths(app: Option<&tauri::AppHandle>) -> AgentPaths {
    let config_dir = agent_config_dir();
    let runtime = resolve_agent_runtime(app);
    let agent_entry_exists = runtime
        .agent_entry
        .as_ref()
        .is_some_and(|entry| entry.exists());
    AgentPaths {
        agent_dir: runtime.agent_dir.as_ref().map(|path| display_path(path)),
        agent_entry: runtime.agent_entry.as_ref().map(|path| display_path(path)),
        agent_entry_exists,
        config_path: display_path(&config_dir.join("config.json")),
        session_path: display_path(&config_dir.join("session")),
        log_path: display_path(&config_dir.join("logs").join("agent.log")),
        node_command: runtime.node_command,
        node_exists: runtime.node_exists,
        node_version: runtime.node_version,
        runtime_origin: runtime.runtime_origin,
        resource_dir: runtime.resource_dir.as_ref().map(|path| display_path(path)),
    }
}

fn port_open(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
}

fn wait_port(port: u16, open: bool, timeout: Duration) -> bool {
    let start = now_ms();
    while now_ms().saturating_sub(start) < timeout.as_millis() {
        if port_open(port) == open {
            return true;
        }
        thread::sleep(Duration::from_millis(120));
    }
    port_open(port) == open
}

fn is_runtime_locked(path: Option<&PathBuf>) -> bool {
    let Some(path) = path else { return false; };
    if !path.exists() {
        return false;
    }
    OpenOptions::new().write(true).open(path).is_err()
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
    let output = command.output().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(target_os = "windows")]
fn process_ids_by_executable_path(path: &Path) -> Vec<u32> {
    let escaped = display_path(path).replace('\'', "''");
    let script = format!(
        "$p='{escaped}'; Get-Process -ErrorAction SilentlyContinue | ForEach-Object {{ try {{ if ($_.Path -eq $p) {{ $_.Id }} }} catch {{}} }}"
    );
    run_hidden_output(
        "powershell.exe",
        &["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script],
    )
    .unwrap_or_default()
    .lines()
    .filter_map(|line| line.trim().parse::<u32>().ok())
    .collect()
}

#[cfg(not(target_os = "windows"))]
fn process_ids_by_executable_path(_path: &Path) -> Vec<u32> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn browser_session_process_pids() -> Vec<u32> {
    let needle = display_path(
        &agent_config_dir()
            .join("session")
            .join("session-riverlub-local-agent"),
    )
    .to_ascii_lowercase()
    .replace('\'', "''");
    let script = format!(
        "$n='{needle}'; Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {{ ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'msedge.exe') -and $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($n) }} | ForEach-Object {{ $_.ProcessId }}"
    );
    run_hidden_output(
        "powershell.exe",
        &["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script],
    )
    .unwrap_or_default()
    .lines()
    .filter_map(|line| line.trim().parse::<u32>().ok())
    .collect()
}

#[cfg(not(target_os = "windows"))]
fn browser_session_process_pids() -> Vec<u32> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn kill_pid(pid: u32) {
    let _ = Command::new("taskkill.exe")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

#[cfg(not(target_os = "windows"))]
fn kill_pid(_pid: u32) {}

#[cfg(target_os = "windows")]
fn port_owner_pid(port: u16) -> Option<u32> {
    let output = run_hidden_output("netstat.exe", &["-ano", "-p", "TCP"]).ok()?;
    let needle = format!("127.0.0.1:{port}");
    output.lines().find_map(|line| {
        let line = line.trim();
        if line.contains(&needle) && line.contains("LISTENING") {
            line.split_whitespace().last()?.parse().ok()
        } else {
            None
        }
    })
}

#[cfg(not(target_os = "windows"))]
fn port_owner_pid(_port: u16) -> Option<u32> {
    None
}

#[cfg(target_os = "windows")]
fn create_kill_on_close_job(child: &Child) -> Result<isize, String> {
    unsafe {
        let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if handle.is_null() {
            return Err("Nao foi possivel criar Job Object do Windows".to_string());
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = SetInformationJobObject(
            handle,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if configured == 0 {
            CloseHandle(handle);
            return Err("Nao foi possivel configurar Job Object do Windows".to_string());
        }
        let process_handle = child.as_raw_handle() as HANDLE;
        if AssignProcessToJobObject(handle, process_handle) == 0 {
            CloseHandle(handle);
            return Err("Nao foi possivel vincular o agente ao Job Object".to_string());
        }
        Ok(handle as isize)
    }
}

#[cfg(not(target_os = "windows"))]
fn create_kill_on_close_job(_child: &Child) -> Result<isize, String> {
    Ok(0)
}

#[cfg(target_os = "windows")]
fn close_job_handle(handle: isize) {
    if handle != 0 {
        unsafe { CloseHandle(handle as HANDLE) };
    }
}

#[cfg(not(target_os = "windows"))]
fn close_job_handle(_handle: isize) {}

fn write_supervisor_trace(kind: &str, detail: &str) {
    let dir = agent_config_dir().join("logs");
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join("supervisor.log");
    if fs::metadata(&path).map(|m| m.len() > 256 * 1024).unwrap_or(false) {
        let _ = fs::rename(&path, dir.join("supervisor.log.old"));
    }
    let record = json!({
        "timestamp_ms": now_ms(),
        "event": kind,
        "detail": detail.chars().take(900).collect::<String>()
    });
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{record}");
    }
}

// The agent can fail before index.js or bootstrap.cjs installs its logger.
// Capture diagnostic error lines from Node stderr, never stdout (which may
// contain the WhatsApp pairing QR). Redact potential credentials.
#[cfg(target_os = "windows")]
fn capture_node_startup_errors(stderr: std::process::ChildStderr) {
    thread::spawn(move || {
        let mut captured = 0usize;
        for line in BufReader::new(stderr).lines() {
            let Ok(line) = line else { break };
            let value = line.trim();
            if value.is_empty() {
                continue;
            }
            let lower = value.to_ascii_lowercase();
            let reportable = lower.contains("error:")
                || lower.contains("error [")
                || lower.contains("module_not_found")
                || lower.contains("cannot find module")
                || lower.contains("node.js v");
            let sensitive = lower.contains("bearer ")
                || lower.contains("agenttoken")
                || lower.contains("agent_token")
                || lower.contains("qr_text")
                || lower.contains("qr_data")
                || lower.contains("data:image")
                || lower.contains("secret")
                || lower.contains("password");
            if !reportable || sensitive || captured >= 20 {
                continue;
            }
            let message = value.chars().take(500).collect::<String>();
            let dir = agent_config_dir().join("logs");
            if fs::create_dir_all(&dir).is_ok() {
                let record = json!({
                    "timestamp_ms": now_ms(),
                    "level": "error",
                    "message": "Node startup stderr",
                    "detail": message
                });
                if let Ok(mut file) = OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(dir.join("supervisor.log"))
                {
                    let _ = writeln!(file, "{record}");
                }
            }
            captured += 1;
        }
    });
}

fn spawn_agent(state: &mut SupervisorState) -> Result<(), String> {
    if let Some(child) = state.child.as_mut() {
        match child.child.try_wait() {
            Ok(None) => return Ok(()),
            Ok(Some(status)) => {
                state.last_exit_code = status.code();
                state.last_exit_at_ms = Some(now_ms());
                write_supervisor_trace("exit", &format!("Node exited with code {:?}", status.code()));
                let handle = child.job_handle;
                close_job_handle(handle);
                state.child = None;
            }
            Err(_) => {
                state.child = None;
            }
        }
    }
    let entry = state.agent_dir.join("src").join("bootstrap.cjs");
    if !entry.exists() {
        return Err(format!("Agente nao encontrado em {}", display_path(&entry)));
    }
    write_supervisor_trace("spawn", &format!(
        "Node runtime={}, entry={}, cwd={}",
        state.node_command,
        display_path(&entry),
        display_path(&state.agent_dir)
    ));
    let mut command = Command::new(&state.node_command);
    command
        .arg(&entry)
        .current_dir(&state.agent_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .env("RIVERLUB_CONNECT_MANAGED", "1")
        .env("RIVERLUB_AGENT_RUNTIME_ORIGIN", &state.runtime_origin)
        .env("RIVERLUB_AGENT_RUNTIME_DIR", display_path(&state.agent_dir));
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    let mut child = command
        .spawn()
        .map_err(|e| {
            write_supervisor_trace("spawn_error", &e.to_string());
            format!("Falha ao iniciar agente WhatsApp: {e}")
        })?;
    let pid = child.id();
    #[cfg(target_os = "windows")]
    if let Some(stderr) = child.stderr.take() {
        capture_node_startup_errors(stderr);
    }
    let job_handle = match create_kill_on_close_job(&child) {
        Ok(handle) => handle,
        Err(error) => {
            write_supervisor_trace("job_error", &error);
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    state.child = Some(ManagedAgent {
        child,
        pid,
        started_at_ms: now_ms(),
        job_handle,
    });
    Ok(())
}

fn decode_http_body(head: &str, body: &str) -> Result<Vec<u8>, String> {
    let is_chunked = head.lines().any(|line| {
        line.split_once(':').is_some_and(|(name, value)| {
            name.trim().eq_ignore_ascii_case("transfer-encoding")
                && value.split(',').any(|encoding| encoding.trim().eq_ignore_ascii_case("chunked"))
        })
    });
    if !is_chunked {
        return Ok(body.as_bytes().to_vec());
    }

    let mut remaining = body.as_bytes();
    let mut decoded = Vec::new();
    loop {
        let line_end = remaining.windows(2).position(|bytes| bytes == b"\r\n")
            .ok_or_else(|| "Resposta HTTP chunked sem tamanho de bloco".to_string())?;
        let size_line = std::str::from_utf8(&remaining[..line_end])
            .map_err(|_| "Tamanho de bloco HTTP invalido".to_string())?;
        let size = usize::from_str_radix(size_line.split(';').next().unwrap_or("").trim(), 16)
            .map_err(|_| "Tamanho de bloco HTTP invalido".to_string())?;
        remaining = &remaining[line_end + 2..];
        if size == 0 {
            break;
        }
        if size > remaining.len().saturating_sub(2)
            || remaining.get(size..size + 2) != Some(&b"\r\n"[..])
        {
            return Err("Bloco HTTP chunked incompleto".to_string());
        }
        decoded.extend_from_slice(&remaining[..size]);
        remaining = &remaining[size + 2..];
    }
    Ok(decoded)
}

fn request_json(port: u16, method: &str, path: &str) -> Result<Value, String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(700))
        .map_err(|e| format!("Servico local indisponivel: {e}"))?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(2200)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(1200)));
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).map_err(|e| e.to_string())?;
    let mut raw = String::new();
    stream.read_to_string(&mut raw).map_err(|e| e.to_string())?;
    let mut parts = raw.splitn(2, "\r\n\r\n");
    let head = parts.next().unwrap_or_default();
    let body = parts.next().unwrap_or_default();
    let ok = head.lines().next().is_some_and(|line| {
        line.contains(" 200 ") || line.contains(" 201 ") || line.contains(" 204 ")
    });
    if !ok {
        return Err(format!("Servico local retornou erro: {}", head.lines().next().unwrap_or("sem status")));
    }
    let decoded = decode_http_body(head, body)?;
    if decoded.iter().all(|byte| byte.is_ascii_whitespace()) {
        return Ok(json!({"ok": true}));
    }
    serde_json::from_slice(&decoded).map_err(|e| format!("Resposta local invalida: {e}"))
}

fn stop_agent(state: &mut SupervisorState) {
    if let Some(mut managed) = state.child.take() {
        if port_open(AGENT_PORT) {
            let _ = request_json(AGENT_PORT, "POST", "/shutdown");
            let _ = wait_port(AGENT_PORT, false, Duration::from_millis(1800));
        }
        close_job_handle(managed.job_handle);
        let _ = managed.child.kill();
        let _ = managed.child.wait();
    }
}

fn supervisor_status(state: &mut SupervisorState) -> Value {
    let mut running = false;
    let mut pid = None;
    let mut started_at = None;
    if let Some(managed) = state.child.as_mut() {
        match managed.child.try_wait() {
            Ok(None) => {
                running = true;
                pid = Some(managed.pid);
                started_at = Some(managed.started_at_ms);
                if port_open(AGENT_PORT) {
                    state.restart_failures = 0;
                }
            }
            Ok(Some(exit_status)) => {
                state.last_exit_code = exit_status.code();
                state.last_exit_at_ms = Some(now_ms());
                write_supervisor_trace("exit", &format!("Node exited with code {:?}", exit_status.code()));
                close_job_handle(managed.job_handle);
                state.child = None;
            }
            Err(_) => {
                close_job_handle(managed.job_handle);
                state.child = None;
            }
        }
    }
    json!({
        "managedRunning": running,
        "managedPid": pid,
        "managedStartedAtMs": started_at,
        "desiredRunning": state.desired_running,
        "lastExitCode": state.last_exit_code,
        "lastExitAtMs": state.last_exit_at_ms,
        "restartFailures": state.restart_failures
    })
}

fn write_http_json(mut stream: TcpStream, status: &str, payload: Value) {
    let body = payload.to_string();
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(), body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn handle_supervisor_connection(mut stream: TcpStream, state: Arc<Mutex<SupervisorState>>) -> bool {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(1200)));
    let mut buffer = [0u8; 4096];
    let read = stream.read(&mut buffer).unwrap_or(0);
    if read == 0 {
        return false;
    }
    let request = String::from_utf8_lossy(&buffer[..read]);
    let first = request.lines().next().unwrap_or_default();
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or_default();
    let mut guard = match state.lock() {
        Ok(value) => value,
        Err(_) => {
            write_http_json(stream, "500 Internal Server Error", json!({"error":"lock poisoned"}));
            return false;
        }
    };
    match (method, path) {
        ("GET", "/status") => {
            let payload = supervisor_status(&mut guard);
            write_http_json(stream, "200 OK", payload);
            false
        }
        ("POST", "/start") => {
            guard.desired_running = true;
            let result = spawn_agent(&mut guard);
            let payload = match result {
                Ok(_) => supervisor_status(&mut guard),
                Err(error) => json!({"error": error}),
            };
            write_http_json(stream, "200 OK", payload);
            false
        }
        ("POST", "/stop") => {
            guard.desired_running = false;
            stop_agent(&mut guard);
            let payload = supervisor_status(&mut guard);
            write_http_json(stream, "200 OK", payload);
            false
        }
        ("POST", "/restart") => {
            guard.desired_running = false;
            stop_agent(&mut guard);
            guard.desired_running = true;
            let result = spawn_agent(&mut guard);
            let payload = match result {
                Ok(_) => supervisor_status(&mut guard),
                Err(error) => json!({"error": error}),
            };
            write_http_json(stream, "200 OK", payload);
            false
        }
        ("POST", "/shutdown") => {
            guard.desired_running = false;
            stop_agent(&mut guard);
            write_http_json(stream, "200 OK", json!({"ok":true}));
            true
        }
        _ => {
            write_http_json(stream, "404 Not Found", json!({"error":"not found"}));
            false
        }
    }
}

pub fn run_supervisor() {
    let node_command = match env::var("RIVERLUB_SUPERVISOR_NODE") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return,
    };
    let agent_dir = match env::var("RIVERLUB_SUPERVISOR_AGENT_DIR") {
        Ok(value) if !value.trim().is_empty() => PathBuf::from(value),
        _ => return,
    };
    let runtime_origin = env::var("RIVERLUB_SUPERVISOR_RUNTIME_ORIGIN")
        .unwrap_or_else(|_| "bundled".to_string());
    let listener = match TcpListener::bind(("127.0.0.1", SUPERVISOR_PORT)) {
        Ok(listener) => listener,
        Err(_) => return,
    };
    let state = Arc::new(Mutex::new(SupervisorState {
        child: None,
        desired_running: true,
        node_command,
        agent_dir,
        runtime_origin,
        restart_failures: 0,
        last_exit_code: None,
        last_exit_at_ms: None,
    }));
    if let Ok(mut guard) = state.lock() {
        let _ = spawn_agent(&mut guard);
    }
    let watchdog_state = Arc::clone(&state);
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(1));
        let mut should_restart = false;
        let mut delay = 0u64;
        if let Ok(mut guard) = watchdog_state.lock() {
            let exit = guard.child.as_mut().and_then(|managed| {
                managed.child.try_wait().ok().flatten().map(|status| {
                    (status.code(), managed.job_handle)
                })
            });
            if let Some((exit_code, job_handle)) = exit {
                guard.last_exit_code = exit_code;
                guard.last_exit_at_ms = Some(now_ms());
                write_supervisor_trace("exit", &format!("Node exited with code {exit_code:?}"));
                close_job_handle(job_handle);
                guard.child = None;
                if guard.desired_running {
                    guard.restart_failures = guard.restart_failures.saturating_add(1);
                    should_restart = true;
                    delay = match guard.restart_failures {
                        0 | 1 => 2,
                        2 => 5,
                        3 => 10,
                        _ => 30,
                    };
                }
            } else if guard.child.is_none() && guard.desired_running {
                should_restart = true;
                delay = 2;
            }
        }
        if should_restart {
            thread::sleep(Duration::from_secs(delay));
            if let Ok(mut guard) = watchdog_state.lock() {
                if guard.desired_running && guard.child.is_none() {
                    let _ = spawn_agent(&mut guard);
                }
            }
        }
    });
    for incoming in listener.incoming() {
        match incoming {
            Ok(stream) => {
                if handle_supervisor_connection(stream, Arc::clone(&state)) {
                    break;
                }
            }
            Err(_) => thread::sleep(Duration::from_millis(100)),
        }
    }
    if let Ok(mut guard) = state.lock() {
        guard.desired_running = false;
        stop_agent(&mut guard);
    };
}

fn cleanup_orphaned_runtime(runtime: &ResolvedAgentRuntime) -> Vec<u32> {
    let mut killed = Vec::new();
    let node_path = PathBuf::from(&runtime.node_command);
    if node_path.exists() && node_path.is_absolute() {
        for pid in process_ids_by_executable_path(&node_path) {
            kill_pid(pid);
            killed.push(pid);
        }
    }
    for pid in browser_session_process_pids() {
        kill_pid(pid);
        killed.push(pid);
    }
    killed.sort_unstable();
    killed.dedup();
    let _ = wait_port(AGENT_PORT, false, Duration::from_millis(2500));
    killed
}

fn cleanup_legacy_bundled_runtimes(app: &tauri::AppHandle) {
    let Some(resource_dir) = resolve_resource_dir(Some(app)) else {
        return;
    };
    let runtime_root = resource_dir.join("runtime");
    if !runtime_root.exists() {
        return;
    }

    let current_version = env!("CARGO_PKG_VERSION");
    let legacy_node = runtime_root.join("node").join("node.exe");
    if legacy_node.exists() {
        for pid in process_ids_by_executable_path(&legacy_node) {
            kill_pid(pid);
        }
    }

    let mut cleanup_targets = vec![runtime_root.join("node"), runtime_root.join("whatsapp-agent")];
    if let Ok(entries) = fs::read_dir(&runtime_root) {
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else { continue; };
            if !file_type.is_dir() { continue; }
            let name = entry.file_name().to_string_lossy().to_string();
            if name == current_version || name == "node" || name == "whatsapp-agent" { continue; }
            if !name.chars().all(|c| c.is_ascii_digit() || c == '.') { continue; }

            let old_runtime = entry.path();
            let old_node = old_runtime.join("node").join("node.exe");
            if old_node.exists() {
                for pid in process_ids_by_executable_path(&old_node) {
                    kill_pid(pid);
                }
            }
            cleanup_targets.push(old_runtime);
        }
    }

    thread::sleep(Duration::from_millis(350));
    for target in cleanup_targets {
        let _ = fs::remove_dir_all(target);
    }
}

fn ensure_supervisor(app: &tauri::AppHandle) -> Result<(), String> {
    if port_open(SUPERVISOR_PORT) {
        return Ok(());
    }
    let runtime = resolve_agent_runtime(Some(app));
    let agent_dir = runtime
        .agent_dir
        .clone()
        .ok_or_else(|| "Runtime do agente WhatsApp nao encontrado".to_string())?;
    if !runtime.node_exists {
        return Err("Runtime Node do RiverLub Connect nao encontrado".to_string());
    }
    let _ = cleanup_orphaned_runtime(&runtime);
    let exe = env::current_exe().map_err(|e| format!("Executavel atual indisponivel: {e}"))?;
    let mut command = Command::new(exe);
    command
        .arg("--riverlub-supervisor")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .env("RIVERLUB_SUPERVISOR_NODE", &runtime.node_command)
        .env("RIVERLUB_SUPERVISOR_AGENT_DIR", display_path(&agent_dir))
        .env("RIVERLUB_SUPERVISOR_RUNTIME_ORIGIN", &runtime.runtime_origin);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command
        .spawn()
        .map_err(|e| format!("Nao foi possivel iniciar Supervisor RiverLub: {e}"))?;
    if wait_port(SUPERVISOR_PORT, true, Duration::from_secs(5)) {
        Ok(())
    } else {
        Err("Supervisor RiverLub nao respondeu a tempo".to_string())
    }
}

fn snapshot_cleanup(state: &AppState, pids: Vec<u32>) {
    if let Ok(mut guard) = state.last_cleanup.lock() {
        *guard = Some(RuntimeCleanupSnapshot { pids, at_ms: now_ms() });
    }
}

fn build_process_status(app: &tauri::AppHandle, state: &AppState, message: Option<String>) -> AgentProcessStatus {
    let paths = resolve_agent_paths(Some(app));
    let runtime = resolve_agent_runtime(Some(app));
    let supervisor = request_json(SUPERVISOR_PORT, "GET", "/status").unwrap_or_else(|_| json!({}));
    let managed_running = supervisor
        .get("managedRunning")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let managed_pid = supervisor
        .get("managedPid")
        .and_then(Value::as_u64)
        .map(|v| v as u32);
    let managed_started_at_ms = supervisor
        .get("managedStartedAtMs")
        .and_then(Value::as_u64)
        .map(|v| v as u128);
    let runtime_process_pids = {
        let path = PathBuf::from(&runtime.node_command);
        if path.exists() && path.is_absolute() {
            process_ids_by_executable_path(&path)
        } else {
            Vec::new()
        }
    };
    let browser_session_pids = browser_session_process_pids();
    let agent_port_open = port_open(AGENT_PORT);
    let external_running = agent_port_open && !managed_running;
    let cleanup = state.last_cleanup.lock().ok().and_then(|guard| guard.clone());
    AgentProcessStatus {
        managed_running,
        managed_pid,
        managed_started_at_ms,
        managed_process_tree_pids: managed_pid.into_iter().collect(),
        runtime_process_pids,
        browser_session_pids,
        port_owner_pid: port_owner_pid(AGENT_PORT),
        runtime_locked: is_runtime_locked(Some(&PathBuf::from(&runtime.node_command))),
        last_cleanup_pids: cleanup.as_ref().map(|v| v.pids.clone()).unwrap_or_default(),
        last_cleanup_at_ms: cleanup.map(|v| v.at_ms),
        port_open: agent_port_open,
        last_exit_code: supervisor.get("lastExitCode").and_then(Value::as_i64).map(|code| code as i32),
        last_exit_at_ms: supervisor.get("lastExitAtMs").and_then(Value::as_u64).map(|ms| ms as u128),
        external_running,
        can_start: !external_running,
        port: AGENT_PORT,
        message,
        paths,
    }
}

fn wait_agent_ready(timeout: Duration) -> bool {
    let start = now_ms();
    while now_ms().saturating_sub(start) < timeout.as_millis() {
        if request_json(AGENT_PORT, "GET", "/health")
            .ok()
            .and_then(|payload| payload.get("instalado").and_then(Value::as_bool))
            == Some(true)
        {
            return true;
        }
        thread::sleep(Duration::from_millis(250));
    }
    false
}

fn verify_agent_started(app: &tauri::AppHandle, state: &AppState) -> Result<AgentProcessStatus, String> {
    if !wait_agent_ready(Duration::from_secs(8)) {
        let supervisor = request_json(SUPERVISOR_PORT, "GET", "/status").unwrap_or_default();
        let exit_detail = supervisor.get("lastExitCode")
            .and_then(Value::as_i64)
            .map(|code| format!(" (codigo de saida: {code})"))
            .unwrap_or_default();
        return Err(format!(
            "O Supervisor recebeu o comando, mas o agente WhatsApp nao abriu a porta 47851{exit_detail}. Verifique Eventos e logs > Atualizar logs. Nenhuma sessao foi apagada."
        ));
    }
    Ok(build_process_status(
        app,
        state,
        Some("Agente local confirmado: porta 47851 e /health respondendo.".to_string()),
    ))
}

#[tauri::command]
fn agent_process_status(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> AgentProcessStatus {
    build_process_status(&app, &state, None)
}

#[tauri::command]
fn start_agent_process(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<AgentProcessStatus, String> {
    ensure_supervisor(&app)?;
    let payload = request_json(SUPERVISOR_PORT, "POST", "/start")?;
    if let Some(error) = payload.get("error").and_then(Value::as_str) {
        return Err(error.to_string());
    }
    verify_agent_started(&app, &state)
}

#[tauri::command]
fn stop_agent_process(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<AgentProcessStatus, String> {
    ensure_supervisor(&app)?;
    request_json(SUPERVISOR_PORT, "POST", "/stop")?;
    Ok(build_process_status(&app, &state, Some("Agente WhatsApp parado.".to_string())))
}

#[tauri::command]
fn restart_agent_process(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<AgentProcessStatus, String> {
    ensure_supervisor(&app)?;
    let payload = request_json(SUPERVISOR_PORT, "POST", "/restart")?;
    if let Some(error) = payload.get("error").and_then(Value::as_str) {
        return Err(error.to_string());
    }
    verify_agent_started(&app, &state)
}

#[tauri::command]
fn cleanup_runtime_orphans(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<AgentProcessStatus, String> {
    ensure_supervisor(&app)?;
    let _ = request_json(SUPERVISOR_PORT, "POST", "/stop");
    let runtime = resolve_agent_runtime(Some(&app));
    let killed = cleanup_orphaned_runtime(&runtime);
    snapshot_cleanup(&state, killed.clone());
    let _ = request_json(SUPERVISOR_PORT, "POST", "/start");
    Ok(build_process_status(
        &app,
        &state,
        Some(if killed.is_empty() {
            "Runtime verificado e reiniciado sem processos orfaos.".to_string()
        } else {
            format!("Runtime liberado. Processos encerrados: {:?}", killed)
        }),
    ))
}

#[tauri::command]
fn local_agent_health() -> Result<Value, String> {
    request_json(AGENT_PORT, "GET", "/health")
}

#[tauri::command]
fn local_agent_qr() -> Result<Value, String> {
    request_json(AGENT_PORT, "GET", "/qr")
}

#[tauri::command]
fn disconnect_agent_session() -> Result<Value, String> {
    request_json(AGENT_PORT, "POST", "/desconectar")
}

fn read_last_lines(path: &Path, limit: usize) -> Result<Vec<String>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut lines = text.lines().rev().take(limit).map(str::to_string).collect::<Vec<_>>();
    lines.reverse();
    Ok(lines)
}

#[tauri::command]
fn read_agent_logs(limit: Option<usize>) -> Result<AgentLogResponse, String> {
    let path = agent_config_dir().join("logs").join("agent.log");
    let exists = path.exists();
    Ok(AgentLogResponse {
        exists,
        log_path: display_path(&path),
        lines: read_last_lines(&path, limit.unwrap_or(80).clamp(1, 500))?,
    })
}

#[tauri::command]
fn clear_agent_logs() -> Result<AgentMaintenanceResponse, String> {
    let log_dir = agent_config_dir().join("logs");
    fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let path = log_dir.join("agent.log");
    let archived = if path.exists() && fs::metadata(&path).map(|m| m.len()).unwrap_or(0) > 0 {
        let archived = log_dir.join(format!("agent-{}.log", now_ms()));
        fs::rename(&path, &archived).map_err(|e| e.to_string())?;
        Some(display_path(&archived))
    } else {
        None
    };
    fs::write(&path, "").map_err(|e| e.to_string())?;
    Ok(AgentMaintenanceResponse {
        ok: true,
        message: "Logs limpos com seguranca.".to_string(),
        log_path: Some(display_path(&path)),
        archived_log_path: archived,
        session_path: None,
    })
}

#[tauri::command]
fn reset_agent_test_session(app: tauri::AppHandle) -> Result<AgentMaintenanceResponse, String> {
    ensure_supervisor(&app)?;
    let _ = request_json(SUPERVISOR_PORT, "POST", "/stop");
    let session = agent_config_dir().join("session");
    let archived = if session.exists() {
        let target = agent_config_dir().join(format!("session-reset-{}", now_ms()));
        fs::rename(&session, &target).map_err(|e| format!("Nao foi possivel arquivar sessao: {e}"))?;
        Some(display_path(&target))
    } else {
        None
    };
    fs::create_dir_all(&session).map_err(|e| e.to_string())?;
    let _ = request_json(SUPERVISOR_PORT, "POST", "/start");
    Ok(AgentMaintenanceResponse {
        ok: true,
        message: "Sessao local resetada. Um novo QR sera solicitado.".to_string(),
        log_path: None,
        archived_log_path: archived,
        session_path: Some(display_path(&session)),
    })
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let value = url.trim();
    if !(value.starts_with("https://") || value.starts_with("http://")) {
        return Err("URL externa invalida".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", value])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(value).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(value).spawn().map_err(|e| e.to_string())?;
        return Ok(());
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
    if args.iter().any(|arg| {
        let value = arg.to_ascii_lowercase();
        value == "riverlub-connect://open" || value == "riverlub-connect://open/whatsapp"
    }) {
        focus_main_window(app);
        let _ = app.emit("riverlub-deep-link", json!({"target":"whatsapp"}));
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            focus_main_window(app);
            handle_deep_link_args(app, args);
        }))
        .setup(|app| {
            cleanup_legacy_bundled_runtimes(app.handle());
            let _ = ensure_supervisor(app.handle());
            handle_deep_link_args(app.handle(), env::args().collect());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agent_process_status,
            start_agent_process,
            stop_agent_process,
            restart_agent_process,
            cleanup_runtime_orphans,
            local_agent_health,
            local_agent_qr,
            disconnect_agent_session,
            read_agent_logs,
            clear_agent_logs,
            reset_agent_test_session,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar RiverLub Connect");
}

#[cfg(test)]
mod http_response_tests {
    use super::decode_http_body;

    #[test]
    fn reads_chunked_local_agent_status() {
        let head = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n";
        let payload = "{\"sucesso\":true,\"instalado\":true}";
        let body = format!("{:x}\r\n{}\r\n0\r\n\r\n", payload.len(), payload);
        assert_eq!(decode_http_body(head, &body).unwrap(), payload.as_bytes().to_vec());
    }

    #[test]
    fn reads_content_length_local_agent_status() {
        let head = "HTTP/1.1 200 OK\r\nContent-Length: 16\r\n";
        assert_eq!(decode_http_body(head, "{\"sucesso\":true}").unwrap(), b"{\"sucesso\":true}".to_vec());
    }

    #[test]
    fn rejects_incomplete_chunked_payload() {
        let head = "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n";
        assert!(decode_http_body(head, "a\r\n{}\r\n0\r\n\r\n").is_err());
    }
}
