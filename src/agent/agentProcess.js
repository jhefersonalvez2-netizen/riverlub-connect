import { invoke } from "@tauri-apps/api/core";

function isTauriRuntime() {
  return Boolean(window.__TAURI_INTERNALS__);
}

async function invokeProcess(command) {
  if (!isTauriRuntime()) {
    throw new Error("Comando disponivel apenas no aplicativo desktop Tauri.");
  }

  return invoke(command);
}

export async function getAgentProcessStatus() {
  return invokeProcess("agent_process_status");
}

export async function startAgentProcess() {
  return invokeProcess("start_agent_process");
}

export async function stopAgentProcess() {
  return invokeProcess("stop_agent_process");
}

export async function restartAgentProcess() {
  return invokeProcess("restart_agent_process");
}
