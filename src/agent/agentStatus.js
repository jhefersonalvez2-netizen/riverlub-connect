export const AGENT_STATUS = {
  READY: "READY",
  STOPPED: "STOPPED",
  STARTING: "STARTING",
  RUNNING: "RUNNING",
  WAITING_QR: "WAITING_QR",
  QR_READY: "QR_READY",
  AUTHENTICATED: "AUTHENTICATED",
  CONNECTED: "CONNECTED",
  RECONNECTING: "RECONNECTING",
  DISCONNECTED: "DISCONNECTED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  ERROR: "ERROR",
  EXTERNAL: "EXTERNAL",
};

export const STATUS_META = {
  [AGENT_STATUS.READY]: {
    label: "Connect pronto",
    tone: "success",
    detail: "RiverLub Connect aberto e pronto para controlar o WhatsApp da oficina.",
  },
  [AGENT_STATUS.STOPPED]: {
    label: "Agente parado",
    tone: "neutral",
    detail: "Nenhum agente local respondeu neste computador.",
  },
  [AGENT_STATUS.STARTING]: {
    label: "Iniciando agente",
    tone: "info",
    detail: "O agente local esta abrindo o servidor e preparando a sessao.",
  },
  [AGENT_STATUS.RUNNING]: {
    label: "Agente rodando",
    tone: "info",
    detail: "O servidor local esta ativo. O WhatsApp sera controlado por esta tela.",
  },
  [AGENT_STATUS.WAITING_QR]: {
    label: "Aguardando QR Code",
    tone: "warning",
    detail: "O WhatsApp ainda esta preparando um QR Code de pareamento.",
  },
  [AGENT_STATUS.QR_READY]: {
    label: "QR Code disponivel",
    tone: "warning",
    detail: "Abra o WhatsApp no celular e leia o QR Code exibido no Connect.",
  },
  [AGENT_STATUS.AUTHENTICATED]: {
    label: "Autenticando",
    tone: "info",
    detail: "QR lido com sucesso. O WhatsApp Web esta sincronizando a sessao.",
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
  [AGENT_STATUS.SESSION_EXPIRED]: {
    label: "Sessao expirada",
    tone: "danger",
    detail: "A sessao local foi perdida ou desconectada. Reinicie o agente para gerar novo QR.",
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
  const connected = Boolean(health?.conectado || health?.connected);
  const authenticated = Boolean(health?.authenticated);
  const waitingQr = Boolean(health?.waiting_qr || health?.waitingQr);
  const qrDataUrl = health?.qr_data_url || health?.qrDataUrl || "";
  const sessionExpired = Boolean(health?.session_expired || health?.sessionExpired);
  const qrExpired = Boolean(health?.qr_expirado_em || health?.qrExpiradoEm);

  if (connected) {
    return AGENT_STATUS.CONNECTED;
  }

  if (sessionExpired) {
    return AGENT_STATUS.SESSION_EXPIRED;
  }

  if (health?.erro_ultimo) {
    return AGENT_STATUS.ERROR;
  }

  if (authenticated) {
    return AGENT_STATUS.AUTHENTICATED;
  }

  if (waitingQr && qrDataUrl) {
    return AGENT_STATUS.QR_READY;
  }

  if (waitingQr) {
    return AGENT_STATUS.WAITING_QR;
  }

  if (health?.inicializando) {
    return health?.configurado ? AGENT_STATUS.RECONNECTING : AGENT_STATUS.STARTING;
  }

  if (health?.configurado && health?.ultimo_qr_em) {
    return AGENT_STATUS.WAITING_QR;
  }

  if (health?.instalado && health?.configurado && !qrExpired) {
    return AGENT_STATUS.DISCONNECTED;
  }

  if (health?.instalado) {
    return managedRunning ? AGENT_STATUS.RUNNING : AGENT_STATUS.DISCONNECTED;
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
