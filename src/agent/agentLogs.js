import { invoke } from "@tauri-apps/api/core";

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseAgentLogLine(line) {
  const parsed = safeJsonParse(line);

  if (!parsed) {
    return {
      at: null,
      level: "info",
      message: line,
      extra: null,
      raw: line,
    };
  }

  return {
    at: parsed.ts || null,
    level: parsed.nivel || "info",
    message: parsed.mensagem || line,
    extra: parsed.extra || null,
    raw: line,
  };
}

export async function readAgentLogs(limit = 80) {
  if (!window.__TAURI_INTERNALS__) {
    return {
      exists: false,
      logPath: "",
      lines: [],
      entries: [],
    };
  }

  const response = await invoke("read_agent_logs", { limit });
  const lines = response.lines || [];

  return {
    ...response,
    lines,
    entries: lines.map(parseAgentLogLine).reverse(),
  };
}

export async function clearAgentLogs() {
  if (!window.__TAURI_INTERNALS__) {
    throw new Error("Limpeza de logs disponivel apenas no aplicativo desktop.");
  }

  return invoke("clear_agent_logs");
}

export async function resetAgentTestSession() {
  if (!window.__TAURI_INTERNALS__) {
    throw new Error("Reset de sessao disponivel apenas no aplicativo desktop.");
  }

  return invoke("reset_agent_test_session");
}
