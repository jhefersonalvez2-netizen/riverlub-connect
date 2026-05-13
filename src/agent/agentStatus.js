export const AGENT_STATUS = {
  STOPPED: "STOPPED",
  STARTING: "STARTING",
  WAITING_QR: "WAITING_QR",
  CONNECTED: "CONNECTED",
  RECONNECTING: "RECONNECTING",
  DISCONNECTED: "DISCONNECTED",
  ERROR: "ERROR",
  EXTERNAL: "EXTERNAL",
};

export const STATUS_META = {
  [AGENT_STATUS.STOPPED]: {
    label: "Agente parado",
    tone: "neutral",
    detail: "Nenhum agente local respondeu neste computador.",
  },
  [AGENT_STATUS.STARTING]: {
    label: "Iniciando",
    tone: "info",
    detail: "O agente local esta abrindo o servidor e preparando a sessao.",
  },
  [AGENT_STATUS.WAITING_QR]: {
    label: "Aguardando QR Code",
    tone: "warning",
    detail: "O WhatsApp precisa ler o QR Code para concluir o pareamento.",
  },
  [AGENT_STATUS.CONNECTED]: {
    label: "WhatsApp conectado",
    tone: "success",
    detail: "WhatsApp local conectado e pronto para receber jobs.",
  },
  [AGENT_STATUS.RECONNECTING]: {
    label: "Reconectando",
    tone: "info",
    detail: "A sessao existe, mas o WhatsApp ainda esta sincronizando.",
  },
  [AGENT_STATUS.DISCONNECTED]: {
    label: "Sessao desconectada",
    tone: "warning",
    detail: "O agente respondeu, mas o WhatsApp nao esta conectado.",
  },
  [AGENT_STATUS.ERROR]: {
    label: "Erro",
    tone: "danger",
    detail: "O agente local retornou erro. Confira os logs antes de reiniciar.",
  },
  [AGENT_STATUS.EXTERNAL]: {
    label: "Agente externo detectado",
    tone: "info",
    detail: "A porta local esta em uso por um agente iniciado fora do Connect.",
  },
};

export function classifyAgentError(message = "") {
  const value = String(message).toLowerCase();

  if (!value) return null;

  if (
    value.includes("auth") ||
    value.includes("autentic") ||
    value.includes("login") ||
    value.includes("sessao") ||
    value.includes("session")
  ) {
    return "auth";
  }

  if (
    value.includes("puppeteer") ||
    value.includes("chrome") ||
    value.includes("chromium") ||
    value.includes("edge") ||
    value.includes("browser") ||
    value.includes("navegador") ||
    value.includes("executable")
  ) {
    return "browser";
  }

  if (
    value.includes("eaddrinuse") ||
    value.includes("porta") ||
    value.includes("47851")
  ) {
    return "port";
  }

  return "generic";
}

export function getAgentStatus({ health, processState }) {
  const portOpen = Boolean(processState?.portOpen);
  const managedRunning = Boolean(processState?.managedRunning);
  const externalRunning = Boolean(processState?.externalRunning);

  if (health?.erro_ultimo) {
    return AGENT_STATUS.ERROR;
  }

  if (health?.conectado) {
    return AGENT_STATUS.CONNECTED;
  }

  if (health?.inicializando) {
    return health?.configurado ? AGENT_STATUS.RECONNECTING : AGENT_STATUS.STARTING;
  }

  if (health?.configurado && health?.ultimo_qr_em) {
    return AGENT_STATUS.WAITING_QR;
  }

  if (health?.instalado && health?.configurado) {
    return AGENT_STATUS.DISCONNECTED;
  }

  if (health?.instalado) {
    return managedRunning ? AGENT_STATUS.STARTING : AGENT_STATUS.DISCONNECTED;
  }

  if (managedRunning) {
    return AGENT_STATUS.STARTING;
  }

  if (externalRunning || portOpen) {
    return AGENT_STATUS.EXTERNAL;
  }

  return AGENT_STATUS.STOPPED;
}

export function getProcessOrigin(processState) {
  if (processState?.managedRunning) return "Gerenciado pelo Connect";
  if (processState?.externalRunning) return "Externo (.cmd ou terminal)";
  if (processState?.portOpen) return "Porta local ocupada";
  return "Parado";
}
