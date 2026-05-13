use serde::Serialize;
use std::env;
use std::fs;
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

#[derive(Default)]
struct AgentProcessState {
    child: Mutex<Option<ManagedAgentProcess>>,
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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentProcessStatus {
    managed_running: bool,
    managed_pid: Option<u32>,
    managed_started_at_ms: Option<u128>,
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

    if let Some(home) = env::var_os("HOME") {
        return PathBuf::from(home);
    }

    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn agent_config_dir() -> PathBuf {
    app_data_dir().join("RiverLub").join("whatsapp-agent")
}

fn resolve_node_command() -> String {
    env::var("RIVERLUB_CONNECT_NODE_PATH")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "node".to_string())
}

fn resolve_agent_dir() -> Option<PathBuf> {
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

fn resolve_agent_paths() -> AgentPaths {
    let config_dir = agent_config_dir();
    let config_path = config_dir.join("config.json");
    let session_path = config_dir.join("session");
    let log_path = config_dir.join("logs").join("agent.log");
    let agent_dir = resolve_agent_dir();
    let agent_entry = agent_dir
        .as_ref()
        .map(|dir| dir.join("src").join("index.js"));
    let agent_entry_exists = agent_entry.as_ref().is_some_and(|entry| entry.exists());

    AgentPaths {
        agent_dir: agent_dir.as_ref().map(|path| display_path(path)),
        agent_entry: agent_entry.as_ref().map(|path| display_path(path)),
        agent_entry_exists,
        config_path: display_path(&config_path),
        session_path: display_path(&session_path),
        log_path: display_path(&log_path),
        node_command: resolve_node_command(),
    }
}

fn is_agent_port_open() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], AGENT_PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(350)).is_ok()
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

fn build_process_status(
    state: &AgentProcessState,
    message: Option<String>,
) -> Result<AgentProcessStatus, String> {
    let (managed_running, managed_pid, managed_started_at_ms) = current_managed_process(state)?;
    let port_open = is_agent_port_open();
    let paths = resolve_agent_paths();
    let external_running = port_open && !managed_running;
    let can_start = paths.agent_entry_exists && !port_open && !managed_running;

    Ok(AgentProcessStatus {
        managed_running,
        managed_pid,
        managed_started_at_ms,
        port_open,
        external_running,
        can_start,
        port: AGENT_PORT,
        message,
        paths,
    })
}

fn spawn_managed_agent(state: &AgentProcessState) -> Result<AgentProcessStatus, String> {
    if current_managed_process(state)?.0 {
        return build_process_status(
            state,
            Some("Agente ja esta sendo gerenciado pelo RiverLub Connect.".to_string()),
        );
    }

    if is_agent_port_open() {
        return build_process_status(
            state,
            Some(
                "Porta 47851 ja esta em uso. O Connect vai monitorar o agente existente sem encerrar processo externo."
                    .to_string(),
            ),
        );
    }

    let agent_dir = resolve_agent_dir().ok_or_else(|| {
        "Nao encontrei backend/whatsapp-agent a partir da pasta atual do RiverLub Connect."
            .to_string()
    })?;
    let agent_entry = agent_dir.join("src").join("index.js");

    if !agent_entry.exists() {
        return Err(format!(
            "Arquivo do agente WhatsApp nao encontrado em {}",
            display_path(&agent_entry)
        ));
    }

    let node_command = resolve_node_command();
    let mut command = Command::new(&node_command);
    command
        .arg("src/index.js")
        .current_dir(&agent_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .env("RIVERLUB_CONNECT_MANAGED", "1");

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = command.spawn().map_err(|error| {
        format!(
            "Nao foi possivel iniciar o agente WhatsApp com '{}': {}",
            node_command, error
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
        let _ = managed.child.kill();
        let _ = managed.child.wait();
        return Ok(true);
    }

    Ok(false)
}

#[tauri::command]
fn agent_process_status(
    state: tauri::State<'_, AgentProcessState>,
) -> Result<AgentProcessStatus, String> {
    build_process_status(&state, None)
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
    state: tauri::State<'_, AgentProcessState>,
) -> Result<AgentProcessStatus, String> {
    spawn_managed_agent(&state)
}

#[tauri::command]
fn stop_agent_process(
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

    build_process_status(&state, Some(message))
}

#[tauri::command]
fn restart_agent_process(
    state: tauri::State<'_, AgentProcessState>,
) -> Result<AgentProcessStatus, String> {
    let stopped = stop_managed_agent(&state)?;
    std::thread::sleep(Duration::from_millis(450));

    if is_agent_port_open() && !stopped {
        return build_process_status(
            &state,
            Some(
                "Agente externo ja esta ocupando a porta 47851. Reinicio completo exige fechar o .cmd atual."
                    .to_string(),
            ),
        );
    }

    spawn_managed_agent(&state)
}

#[tauri::command]
fn read_agent_logs(limit: Option<usize>) -> Result<AgentLogResponse, String> {
    let paths = resolve_agent_paths();
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
            handle_deep_link_args(app.handle(), env::args().collect());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agent_process_status,
            local_agent_health,
            local_agent_qr,
            disconnect_agent_session,
            start_agent_process,
            stop_agent_process,
            restart_agent_process,
            read_agent_logs,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar RiverLub Connect");
}
