import { invoke } from "@tauri-apps/api/core";

const CONNECT_AGENT_URL = "http://127.0.0.1:47851";
const BRAIN_AGENT_URL = import.meta.env.VITE_RIVERLUB_BRAIN_AGENT_URL || "http://127.0.0.1:47852";
const LOCAL_TIMEOUT_MS = 1800;

function isTauriRuntime() {
  return Boolean(window.__TAURI_INTERNALS__);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || LOCAL_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.erro || data?.message || "Agente local indisponivel");
    }

    return data || {};
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchConnectAgent(path, options = {}) {
  return fetchJson(`${CONNECT_AGENT_URL}${path}`, options);
}

async function fetchBrainAgent(path, options = {}) {
  return fetchJson(`${BRAIN_AGENT_URL}${path}`, options);
}

export async function getLocalAgentHealth() {
  if (isTauriRuntime()) {
    return invoke("local_agent_health");
  }

  return fetchConnectAgent("/health");
}

export async function getLocalAgentQr() {
  if (isTauriRuntime()) {
    return invoke("local_agent_qr");
  }

  return fetchConnectAgent("/qr");
}

export async function disconnectLocalAgent() {
  if (isTauriRuntime()) {
    return invoke("disconnect_agent_session");
  }

  return fetchConnectAgent("/desconectar", {
    method: "POST",
  });
}

export async function getBrainAgentHealth() {
  return fetchBrainAgent("/health");
}

export async function getBrainWhatsappStatus() {
  return fetchBrainAgent("/whatsapp/status");
}

export async function getBrainConversations() {
  return fetchBrainAgent("/conversations");
}

export async function getBrainRuntimeSnapshot() {
  const health = await getBrainAgentHealth();
  let whatsapp = null;

  try {
    whatsapp = await getBrainWhatsappStatus();
  } catch {
    whatsapp = null;
  }

  return {
    health,
    whatsapp,
  };
}

export const localAgentEndpoints = {
  connect: CONNECT_AGENT_URL,
  brain: BRAIN_AGENT_URL,
};
