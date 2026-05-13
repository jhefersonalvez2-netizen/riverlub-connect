import { invoke } from "@tauri-apps/api/core";

const LOCAL_AGENT_URL = "http://127.0.0.1:47851";
const LOCAL_TIMEOUT_MS = 1800;

function isTauriRuntime() {
  return Boolean(window.__TAURI_INTERNALS__);
}

async function fetchLocalAgent(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), LOCAL_TIMEOUT_MS);

  try {
    const response = await fetch(`${LOCAL_AGENT_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.erro || "Agente local indisponivel");
    }

    return data || {};
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getLocalAgentHealth() {
  if (isTauriRuntime()) {
    return invoke("local_agent_health");
  }

  return fetchLocalAgent("/health");
}

export async function disconnectLocalAgent() {
  if (isTauriRuntime()) {
    return invoke("disconnect_agent_session");
  }

  return fetchLocalAgent("/desconectar", {
    method: "POST",
  });
}
