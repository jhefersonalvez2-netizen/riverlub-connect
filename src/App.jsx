import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  LogOut,
  MonitorCog,
  PlayCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Square,
  Wifi,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readAgentLogs } from "./agent/agentLogs";
import {
  getAgentProcessStatus,
  restartAgentProcess,
  startAgentProcess,
  stopAgentProcess,
} from "./agent/agentProcess";
import {
  AGENT_STATUS,
  classifyAgentError,
  getAgentStatus,
  getProcessOrigin,
  STATUS_META,
} from "./agent/agentStatus";
import { disconnectLocalAgent, getLocalAgentHealth, getLocalAgentQr } from "./agentClient";

const CONNECT_VERSION = "0.1.0";
const LOCAL_AGENT_PORT = 47851;
const PANEL_URL = import.meta.env.VITE_RIVERLUB_WEB_URL || "https://app.riverlub.com.br/whatsapp";
const RELEASE_URL =
  import.meta.env.VITE_RIVERLUB_CONNECT_RELEASE_URL ||
  "https://github.com/jhefersonalvez2-netizen/riverlub-connect/releases/latest";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function formatTimestampMs(value) {
  if (!value) return "-";
  return formatDate(Number(value));
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isTauriRuntime() {
  return Boolean(window.__TAURI_INTERNALS__);
}

async function openExternalUrl(url) {
  if (isTauriRuntime()) {
    await invoke("open_external_url", { url });
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function sanitizeDiagnostic(value) {
  return String(value || "")
    .replace(/rla_[a-f0-9]{24,}/gi, "rla_[oculto]")
    .replace(/Bearer\s+[^\s"]+/gi, "Bearer [oculto]")
    .replace(/agentToken["']?\s*:\s*["'][^"']+["']/gi, 'agentToken: "[oculto]"')
    .replace(/qr_data_url["']?\s*:\s*["'][^"']+["']/gi, 'qr_data_url: "[oculto]"')
    .replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g, "data:image/[qr-oculto]");
}

function isValidQrDataUrl(value) {
  return /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(
    String(value || "").trim()
  );
}

function getQrDataUrl(health) {
  const value = health?.qr_data_url || health?.qrDataUrl || "";
  return isValidQrDataUrl(value) ? value.trim() : "";
}

function getQrText(health) {
  return String(health?.qr_text || health?.qrText || "").trim();
}

function getQrExpiresAt(health) {
  return health?.expires_at || health?.qr_expires_at || health?.qr_expira_em || health?.qrExpiresAt || null;
}

function isQrExpired(health) {
  if (health?.qr_expirado_em || health?.qrExpiradoEm || health?.qr_expired || health?.qrExpired) {
    return true;
  }

  const expiresAt = getQrExpiresAt(health);
  if (!expiresAt) return false;

  const date = new Date(expiresAt);
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}

async function createQrDataUrlFromText(qrText) {
  if (!qrText) return "";

  try {
    return await QRCode.toDataURL(qrText, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
    });
  } catch {
    return "";
  }
}

function shouldFetchQrPayload(health) {
  if (!health) return false;

  const connected = Boolean(health.conectado || health.connected || health.pronto_para_envio);
  if (connected) return false;

  return Boolean(
    health.qr_available ||
      health.qrAvailable ||
      health.waiting_qr ||
      health.waitingQr ||
      getQrDataUrl(health) ||
      getQrText(health)
  );
}

function mergeDefinedQrPayload(healthPayload, qrPayload, generatedQrDataUrl = "") {
  if (!healthPayload && !qrPayload) return null;

  const nextHealth = { ...(healthPayload || {}) };

  Object.entries(qrPayload || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      nextHealth[key] = value;
    }
  });

  const connected = Boolean(nextHealth.conectado || nextHealth.connected || nextHealth.pronto_para_envio);
  const qrDataUrl = getQrDataUrl(nextHealth) || generatedQrDataUrl;
  const qrText = getQrText(nextHealth);
  const expiresAt = getQrExpiresAt(nextHealth);
  const qrExpired = isQrExpired(nextHealth);
  const qrAvailable = Boolean(!connected && !qrExpired && (nextHealth.qr_available || qrDataUrl || qrText));

  return {
    ...nextHealth,
    waiting_qr: connected ? false : Boolean(nextHealth.waiting_qr || nextHealth.waitingQr || qrAvailable),
    qr_available: qrAvailable,
    qr_data_url: qrAvailable ? qrDataUrl : null,
    qr_text: qrAvailable ? qrText || null : null,
    qr_expires_at: expiresAt,
    expires_at: expiresAt,
  };
}

function getHealthErrorDetail(errorType) {
  if (errorType === "auth") return "A sessao do WhatsApp precisa ser refeita.";
  if (errorType === "browser") return "Chrome, Edge ou Puppeteer nao abriu corretamente.";
  if (errorType === "port") return "A porta local 47851 esta ocupada por outro processo.";
  if (errorType === "generic") return "O agente local retornou erro. Confira os logs recentes.";
  return "Nenhum erro ativo detectado.";
}

function getWhatsappFlags(health) {
  const qrAvailable = Boolean(health?.qr_available || health?.qrAvailable || getQrDataUrl(health) || getQrText(health));

  return {
    connected: Boolean(health?.conectado || health?.connected || health?.pronto_para_envio),
    authenticated: Boolean(health?.authenticated),
    waitingQr: Boolean(health?.waiting_qr || health?.waitingQr),
    qrAvailable,
    sessionExpired: Boolean(health?.session_expired || health?.sessionExpired),
    qrExpired: isQrExpired(health),
  };
}

function getAccountInfo(health) {
  return {
    name: health?.nome_conta || health?.nomeConta || "-",
    phone: health?.telefone_conectado || health?.telefoneConectado || "-",
  };
}

function getPollingInterval(status, health) {
  const flags = getWhatsappFlags(health);

  if (
    status === AGENT_STATUS.STARTING ||
    status === AGENT_STATUS.RECONNECTING ||
    status === AGENT_STATUS.WAITING_QR ||
    status === AGENT_STATUS.QR_READY ||
    status === AGENT_STATUS.AUTHENTICATED ||
    flags.waitingQr
  ) {
    return 1600;
  }

  if (status === AGENT_STATUS.CONNECTED) return 9000;
  if (status === AGENT_STATUS.ERROR || status === AGENT_STATUS.SESSION_EXPIRED) return 4500;
  return 6500;
}

function getQrPanelState(health) {
  const qrDataUrl = getQrDataUrl(health);
  const flags = getWhatsappFlags(health);

  if (flags.connected) {
    return {
      tone: "success",
      label: "WhatsApp conectado",
      message: "Sessao pronta. O QR fica oculto enquanto a oficina estiver conectada.",
      loading: false,
    };
  }

  if (flags.authenticated) {
    return {
      tone: "info",
      label: "Autenticando",
      message: "QR lido. Aguarde alguns segundos enquanto o WhatsApp Web sincroniza.",
      loading: true,
    };
  }

  if (flags.qrExpired) {
    return {
      tone: "danger",
      label: "QR expirado",
      message: "O QR expirou por seguranca. Clique em Reconectar para gerar um novo.",
      loading: false,
    };
  }

  if (qrDataUrl && flags.qrAvailable) {
    return {
      tone: "warning",
      label: "QR Code disponivel",
      message: "No celular, abra WhatsApp > Aparelhos conectados e leia este QR Code.",
      loading: false,
    };
  }

  if (flags.sessionExpired) {
    return {
      tone: "danger",
      label: "Sessao expirada",
      message: "A sessao foi desconectada. Reinicie o agente para receber um novo QR.",
      loading: false,
    };
  }

  if (flags.waitingQr || health?.inicializando) {
    return {
      tone: "info",
      label: "Aguardando QR Code",
      message: "O agente esta preparando o WhatsApp Web. O QR aparece aqui automaticamente.",
      loading: true,
    };
  }

  if (health?.instalado && !health?.configurado) {
    return {
      tone: "warning",
      label: "Ativacao pendente",
      message: "O agente esta rodando, mas ainda precisa ser vinculado a oficina pelo painel RiverLub.",
      loading: false,
    };
  }

  if (health?.instalado) {
    return {
      tone: "neutral",
      label: "Sem QR ativo",
      message: "Clique em Conectar WhatsApp para iniciar ou reconectar a sessao.",
      loading: false,
    };
  }

  return {
    tone: "neutral",
    label: "Agente parado",
    message: "O QR aparece aqui quando o agente local estiver rodando e o WhatsApp pedir autenticacao.",
    loading: false,
  };
}

function getNextSteps(status, health, processState) {
  const flags = getWhatsappFlags(health);

  if (processState?.externalRunning) {
    return [
      "Ha um agente legado usando a porta local. O Connect vai apenas monitorar.",
      "Feche o .cmd antigo se quiser que o Connect assuma o reinicio completo.",
      "A sessao atual do WhatsApp nao sera encerrada automaticamente.",
    ];
  }

  if (status === AGENT_STATUS.CONNECTED) {
    return [
      "Mantenha o Connect aberto neste computador da oficina.",
      "O RiverLub Web pode ficar apenas como painel de status.",
      "Envios e verificacoes ja podem usar o WhatsApp conectado.",
    ];
  }

  if (status === AGENT_STATUS.QR_READY) {
    return [
      "Abra o WhatsApp da oficina no celular.",
      "Entre em Aparelhos conectados e leia o QR exibido.",
      "Aguarde o status mudar para WhatsApp conectado.",
    ];
  }

  if (flags.waitingQr || status === AGENT_STATUS.STARTING) {
    return [
      "Aguarde o Chrome/Edge iniciar em segundo plano.",
      "Nao feche esta janela enquanto o QR esta sendo gerado.",
      "Se passar de alguns minutos, use Reiniciar agente.",
    ];
  }

  if (status === AGENT_STATUS.SESSION_EXPIRED || flags.qrExpired) {
    return [
      "Clique em Reconectar WhatsApp.",
      "Leia o novo QR quando ele aparecer.",
      "Se o erro repetir, confira se Chrome ou Edge esta instalado.",
    ];
  }

  if (status === AGENT_STATUS.ERROR) {
    return [
      "Copie o diagnostico antes de reiniciar.",
      "Confira se Chrome ou Edge esta disponivel neste Windows.",
      "Reinicie apenas pelo Connect para preservar o controle do processo.",
    ];
  }

  return [
    "Clique em Conectar WhatsApp para iniciar o agente local.",
    "Quando o QR aparecer, leia com o celular da oficina.",
    "Depois de conectado, mantenha este app aberto.",
  ];
}

function getPrimaryAction(status, health, processState) {
  const flags = getWhatsappFlags(health);

  if (processState?.externalRunning) {
    return { label: "Atualizar leitura", action: "refresh", disabled: false };
  }

  if (status === AGENT_STATUS.CONNECTED) {
    return { label: "Abrir painel RiverLub", action: "panel", disabled: false };
  }

  if (status === AGENT_STATUS.QR_READY) {
    return { label: "Leia o QR no celular", action: "none", disabled: true };
  }

  if (status === AGENT_STATUS.WAITING_QR || status === AGENT_STATUS.AUTHENTICATED) {
    return { label: "Aguardando WhatsApp", action: "none", disabled: true };
  }

  if (status === AGENT_STATUS.STARTING || status === AGENT_STATUS.RECONNECTING) {
    return { label: "Iniciando agente", action: "none", disabled: true };
  }

  if (flags.sessionExpired || flags.qrExpired || status === AGENT_STATUS.ERROR) {
    return { label: "Reconectar WhatsApp", action: "restart", disabled: false };
  }

  return { label: "Conectar WhatsApp", action: "start", disabled: false };
}

function getToneDot(tone) {
  return `tone-dot ${tone || "neutral"}`;
}

function App() {
  const [status, setStatus] = useState(AGENT_STATUS.STOPPED);
  const [health, setHealth] = useState(null);
  const [processState, setProcessState] = useState(null);
  const [agentLogs, setAgentLogs] = useState({
    exists: false,
    logPath: "",
    entries: [],
  });
  const [busyAction, setBusyAction] = useState("");
  const [logsOpen, setLogsOpen] = useState(true);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [diagnosticCopied, setDiagnosticCopied] = useState(false);
  const [events, setEvents] = useState([
    {
      at: new Date().toISOString(),
      level: "info",
      message: "RiverLub Connect pronto para gerenciar o WhatsApp.",
    },
  ]);
  const refreshingRef = useRef(false);

  const meta = STATUS_META[status] || STATUS_META.STOPPED;
  const isBusy = Boolean(busyAction);
  const whatsappFlags = getWhatsappFlags(health);
  const qrDataUrl = whatsappFlags.qrExpired ? "" : getQrDataUrl(health);
  const qrPanelState = getQrPanelState(health);
  const account = getAccountInfo(health);
  const errorType = classifyAgentError(health?.erro_ultimo || "");
  const primaryAction = getPrimaryAction(status, health, processState);
  const nextSteps = getNextSteps(status, health, processState);
  const pollingInterval = getPollingInterval(status, health);
  const latestAgentLogs = agentLogs.entries.slice(0, 12);

  const addEvent = useCallback((level, message) => {
    setEvents((current) => [
      { at: new Date().toISOString(), level, message },
      ...current,
    ].slice(0, 60));
  }, []);

  const refreshLogs = useCallback(async () => {
    try {
      const logs = await readAgentLogs(120);
      setAgentLogs(logs);
    } catch (error) {
      addEvent("warn", error.message || "Nao foi possivel ler logs locais.");
    }
  }, [addEvent]);

  const refreshStatus = useCallback(async ({ silent = false, includeLogs = false } = {}) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (!silent) setBusyAction("refresh");

    try {
      const [processResult, healthResult] = await Promise.allSettled([
        getAgentProcessStatus(),
        getLocalAgentHealth(),
      ]);

      const nextProcessState =
        processResult.status === "fulfilled" ? processResult.value : null;
      const healthPayload = healthResult.status === "fulfilled" ? healthResult.value : null;

      let qrPayload = null;
      if (shouldFetchQrPayload(healthPayload)) {
        try {
          qrPayload = await getLocalAgentQr();
        } catch (error) {
          if (!silent) {
            addEvent("warn", error.message || "Nao foi possivel ler o QR local.");
          }
        }
      }

      const directQrDataUrl = getQrDataUrl(qrPayload) || getQrDataUrl(healthPayload);
      const qrText = getQrText(qrPayload) || getQrText(healthPayload);
      const generatedQrDataUrl = directQrDataUrl ? "" : await createQrDataUrlFromText(qrText);
      const nextHealth = mergeDefinedQrPayload(healthPayload, qrPayload, generatedQrDataUrl);
      const nextStatus = getAgentStatus({
        health: nextHealth,
        processState: nextProcessState,
      });

      setProcessState(nextProcessState);
      setHealth(nextHealth);
      setStatus(nextStatus);

      if (!silent) {
        const label = STATUS_META[nextStatus]?.label || "Status desconhecido";
        addEvent("info", `Leitura local atualizada: ${label}.`);
      }

      if (includeLogs) {
        await refreshLogs();
      }
    } finally {
      refreshingRef.current = false;
      if (!silent) setBusyAction("");
    }
  }, [addEvent, refreshLogs]);

  useEffect(() => {
    const onVisibilityChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    refreshStatus({ silent: true, includeLogs: true });
  }, [refreshStatus]);

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;

    let active = true;
    let unlisten = null;

    listen("riverlub-deep-link", () => {
      if (!active) return;
      addEvent("info", "RiverLub Web pediu para abrir a tela WhatsApp.");
      refreshStatus({ silent: true, includeLogs: true });
    }).then((cleanup) => {
      if (active) {
        unlisten = cleanup;
      } else {
        cleanup();
      }
    });

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, [addEvent, refreshStatus]);

  useEffect(() => {
    if (!visible) return undefined;

    let cancelled = false;
    let timer = null;

    const schedule = () => {
      timer = window.setTimeout(async () => {
        await refreshStatus({ silent: true });
        if (!cancelled) schedule();
      }, pollingInterval);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [pollingInterval, refreshStatus, visible]);

  useEffect(() => {
    if (!logsOpen || !visible) return undefined;

    const timer = window.setInterval(() => {
      refreshLogs();
    }, 10000);

    return () => window.clearInterval(timer);
  }, [logsOpen, refreshLogs, visible]);

  const metrics = useMemo(() => [
    {
      label: "Connect",
      value: "Pronto",
      foot: `v${CONNECT_VERSION} | Windows local`,
      tone: "success",
    },
    {
      label: "Processo",
      value: getProcessOrigin(processState),
      foot: processState?.managedPid ? `PID ${processState.managedPid}` : `127.0.0.1:${processState?.port || LOCAL_AGENT_PORT}`,
      tone: processState?.externalRunning ? "info" : processState?.managedRunning ? "success" : "neutral",
    },
    {
      label: "WhatsApp",
      value: whatsappFlags.connected
        ? "Pronto"
        : whatsappFlags.authenticated
          ? "Autenticando"
          : whatsappFlags.waitingQr
            ? "Aguardando QR"
            : "Pendente",
      foot: account.phone !== "-" ? account.phone : "Sem numero conectado",
      tone: whatsappFlags.connected ? "success" : whatsappFlags.waitingQr ? "warning" : "neutral",
    },
    {
      label: "Ultima sinc.",
      value: formatDate(health?.atualizado_em),
      foot: health?.ultimo_evento || "Aguardando evento local",
      tone: "info",
    },
  ], [
    account.phone,
    health?.atualizado_em,
    health?.ultimo_evento,
    processState,
    whatsappFlags.authenticated,
    whatsappFlags.connected,
    whatsappFlags.waitingQr,
  ]);

  async function runAction(action, eventMessage, callback) {
    setBusyAction(action);
    setDiagnosticCopied(false);
    try {
      const result = await callback();
      if (result?.message) {
        addEvent("info", result.message);
      } else if (eventMessage) {
        addEvent("info", eventMessage);
      }
      await wait(700);
      await refreshStatus({ silent: true, includeLogs: true });
    } catch (error) {
      addEvent("error", error.message || "Acao local falhou.");
      setStatus(AGENT_STATUS.ERROR);
    } finally {
      setBusyAction("");
    }
  }

  async function handleStartAgent() {
    await runAction("start", "Agente iniciado pelo RiverLub Connect.", startAgentProcess);
  }

  async function handleStopAgent() {
    await runAction("stop", "Comando para parar processo gerenciado enviado.", stopAgentProcess);
  }

  async function handleRestartAgent() {
    await runAction("restart", "Comando de reinicio enviado.", restartAgentProcess);
  }

  async function handleDisconnect() {
    const confirmed = window.confirm(
      "Desconectar o WhatsApp desta oficina agora? A sessao atual sera encerrada e um novo QR pode ser necessario."
    );
    if (!confirmed) return;
    await runAction("disconnect", "Sessao WhatsApp desconectada.", disconnectLocalAgent);
  }

  async function handlePrimaryAction() {
    if (primaryAction.action === "panel") {
      await openExternalUrl(PANEL_URL);
      return;
    }

    if (primaryAction.action === "refresh") {
      await refreshStatus({ includeLogs: true });
      return;
    }

    if (primaryAction.action === "restart") {
      await handleRestartAgent();
      return;
    }

    if (primaryAction.action === "start") {
      await handleStartAgent();
    }
  }

  async function handleCopyDiagnostic() {
    const diagnostics = {
      generated_at: new Date().toISOString(),
      connect_version: CONNECT_VERSION,
      agent_version: health?.versao || null,
      status,
      status_label: meta.label,
      process_origin: getProcessOrigin(processState),
      managed_pid: processState?.managedPid || null,
      managed_by_connect: Boolean(health?.managed_by_connect),
      port: processState?.port || LOCAL_AGENT_PORT,
      port_open: Boolean(processState?.portOpen),
      external_running: Boolean(processState?.externalRunning),
      whatsapp_connected: whatsappFlags.connected,
      whatsapp_authenticated: whatsappFlags.authenticated,
      waiting_qr: whatsappFlags.waitingQr,
      session_expired: whatsappFlags.sessionExpired,
      qr_expired: whatsappFlags.qrExpired,
      whatsapp_state: health?.whatsapp_state || null,
      account_name: account.name,
      account_phone: account.phone,
      last_event: health?.ultimo_evento || null,
      last_error: health?.erro_ultimo || null,
      log_path: agentLogs.logPath || processState?.paths?.logPath || null,
      os: navigator.userAgent,
      recent_events: events.slice(0, 8).map((event) => ({
        at: event.at,
        level: event.level,
        message: event.message,
      })),
      recent_agent_logs: latestAgentLogs.slice(0, 8).map((entry) => ({
        at: entry.at,
        level: entry.level,
        message: entry.message,
      })),
    };

    const text = sanitizeDiagnostic(JSON.stringify(diagnostics, null, 2));

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard indisponivel neste ambiente.");
      }
      await navigator.clipboard.writeText(text);
      setDiagnosticCopied(true);
      addEvent("info", "Diagnostico copiado sem tokens nem QR.");
    } catch (error) {
      setDiagnosticCopied(false);
      addEvent("warn", error.message || "Nao foi possivel copiar o diagnostico.");
    }
  }

  return (
    <main className="app-shell">
      <aside className="side-panel">
        <div className="brand-lockup">
          <div className="brand-mark">RL</div>
          <div>
            <div className="brand-name">RiverLub</div>
            <div className="brand-subtitle">Connect</div>
          </div>
        </div>

        <nav className="module-list" aria-label="Modulos locais">
          <button className="module-item active" type="button">
            <Wifi size={18} />
            WhatsApp
          </button>
          <button className="module-item" type="button" disabled>
            <MonitorCog size={18} />
            Impressoras
          </button>
          <button className="module-item" type="button" disabled>
            <ShieldCheck size={18} />
            Offline
          </button>
        </nav>

        <div className="connect-readiness">
          <span className={getToneDot("success")} />
          <div>
            <strong>Connect pronto</strong>
            <small>Centro local oficial do WhatsApp RiverLub.</small>
          </div>
        </div>

        <div className="side-note">
          <span>Seguranca local</span>
          <strong>Sem terminal para a oficina</strong>
          <small>
            O Connect so encerra processos que ele criou e mantem o QR restrito a 127.0.0.1.
          </small>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">WhatsApp local</p>
            <h1>Central RiverLub Connect</h1>
            <p className="intro">
              Inicie o agente, leia o QR real e acompanhe a sessao da oficina em um unico lugar.
            </p>
          </div>
          <div className={`status-pill ${meta.tone}`} aria-live="polite">
            <Activity size={18} />
            {meta.label}
          </div>
        </header>

        <section className={`status-band ${meta.tone}`}>
          <div className="status-copy">
            <p className="eyebrow">Status atual</p>
            <h2>{meta.label}</h2>
            <p>{health?.erro_ultimo || meta.detail}</p>
            {processState?.externalRunning ? (
              <small>
                Agente externo detectado. Por seguranca, o Connect nao vai encerrar esse processo.
              </small>
            ) : null}
          </div>

          <div className="action-cluster">
            <button
              className="btn primary cta"
              type="button"
              onClick={handlePrimaryAction}
              disabled={isBusy || primaryAction.disabled}
            >
              {isBusy && busyAction !== "refresh" ? <Loader2 className="spin" size={18} /> : <PlayCircle size={18} />}
              {primaryAction.label}
            </button>
            <div className="action-row">
              <button
                className="btn secondary"
                type="button"
                onClick={handleRestartAgent}
                disabled={isBusy || processState?.externalRunning}
                title="Reinicia apenas o processo gerenciado pelo Connect"
              >
                <RefreshCw size={17} />
                Reiniciar agente
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={handleStopAgent}
                disabled={isBusy || !processState?.managedRunning}
                title="Para apenas o processo iniciado pelo Connect"
              >
                <Square size={15} />
                Parar agente
              </button>
              <button
                className="btn danger"
                type="button"
                onClick={handleDisconnect}
                disabled={isBusy || !health?.instalado || processState?.externalRunning}
              >
                <LogOut size={17} />
                Desconectar
              </button>
            </div>
          </div>
        </section>

        <section className="metric-grid" aria-label="Resumo local">
          {metrics.map((item) => (
            <article className="metric-card" key={item.label}>
              <div className="metric-head">
                <span>{item.label}</span>
                <i className={getToneDot(item.tone)} aria-hidden="true" />
              </div>
              <strong>{item.value}</strong>
              <small>{item.foot}</small>
            </article>
          ))}
        </section>

        {errorType ? (
          <section className="diagnostic-strip">
            <AlertTriangle size={18} />
            <span>{getHealthErrorDetail(errorType)}</span>
          </section>
        ) : null}

        <section className="workspace-grid">
          <div className="qr-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Pareamento</p>
                <h2>QR Code real</h2>
              </div>
              <span className={`qr-state-pill ${qrPanelState.tone}`}>
                {qrPanelState.loading ? <Loader2 className="spin" size={17} /> : <QrCode size={17} />}
                {qrPanelState.label}
              </span>
            </div>

            <div className={qrDataUrl ? "qr-live" : "qr-placeholder"}>
              {qrDataUrl ? (
                <>
                  <img src={qrDataUrl} alt="QR Code real do WhatsApp" />
                  <p>{qrPanelState.message}</p>
                  <small>
                    Gerado em {formatDate(health?.qr_gerado_em || health?.ultimo_qr_em)}.
                    {getQrExpiresAt(health) ? ` Expira em ${formatDate(getQrExpiresAt(health))}.` : ""}
                  </small>
                </>
              ) : (
                <>
                  <div className={qrPanelState.loading ? "qr-skeleton active" : "qr-box"} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <p>{qrPanelState.message}</p>
                  {whatsappFlags.qrExpired || whatsappFlags.sessionExpired ? (
                    <button
                      className="btn secondary compact-action"
                      type="button"
                      onClick={handleRestartAgent}
                      disabled={isBusy || processState?.externalRunning}
                    >
                      <RefreshCw size={16} />
                      Gerar novo QR
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="details-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Conta e diagnostico</p>
                <h2>Leitura local</h2>
              </div>
              <button
                className="icon-btn"
                type="button"
                onClick={() => refreshStatus({ includeLogs: true })}
                disabled={isBusy}
                title="Atualizar status"
              >
                <RefreshCw size={18} />
              </button>
            </div>

            <dl className="detail-list compact">
              <div>
                <dt>Conta conectada</dt>
                <dd>{account.name}</dd>
              </div>
              <div>
                <dt>Numero conectado</dt>
                <dd>{account.phone}</dd>
              </div>
              <div>
                <dt>Pronto para envio</dt>
                <dd>{whatsappFlags.connected ? "Sim" : "Nao"}</dd>
              </div>
              <div>
                <dt>Origem do processo</dt>
                <dd>{getProcessOrigin(processState)}</dd>
              </div>
              <div>
                <dt>Versao do agente</dt>
                <dd>{health?.versao || "-"}</dd>
              </div>
              <div>
                <dt>Estado WhatsApp</dt>
                <dd>{health?.whatsapp_state || health?.whatsappState || "-"}</dd>
              </div>
              <div>
                <dt>QR</dt>
                <dd>
                  {whatsappFlags.connected
                    ? "Oculto"
                    : whatsappFlags.qrExpired
                      ? "Expirado"
                      : whatsappFlags.qrAvailable
                        ? "Disponivel"
                        : whatsappFlags.waitingQr
                          ? "Aguardando"
                          : "-"}
                </dd>
              </div>
              <div>
                <dt>Expira em</dt>
                <dd>{formatDate(getQrExpiresAt(health))}</dd>
              </div>
              <div>
                <dt>Ultimo evento</dt>
                <dd>{health?.ultimo_evento || "-"}</dd>
              </div>
              <div>
                <dt>Ultima sincronizacao</dt>
                <dd>{formatDate(health?.atualizado_em)}</dd>
              </div>
              <div>
                <dt>Log local</dt>
                <dd>{agentLogs.logPath || processState?.paths?.logPath || "-"}</dd>
              </div>
            </dl>

            <div className="utility-row">
              <button className="btn secondary" type="button" onClick={handleCopyDiagnostic}>
                <Copy size={17} />
                {diagnosticCopied ? "Diagnostico copiado" : "Copiar diagnostico"}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => openExternalUrl(PANEL_URL)}
              >
                <ExternalLink size={17} />
                Abrir painel RiverLub
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => openExternalUrl(RELEASE_URL)}
              >
                <Download size={17} />
                Instalador
              </button>
            </div>
          </div>
        </section>

        <section className="ops-grid">
          <div className="next-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Proximos passos</p>
                <h2>Orientacao da oficina</h2>
              </div>
              <CheckCircle2 size={20} />
            </div>
            <ol className="next-list">
              {nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="runtime-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Runtime</p>
                <h2>Controle seguro</h2>
              </div>
              <Clock3 size={20} />
            </div>
            <dl className="detail-list compact">
              <div>
                <dt>Porta local</dt>
                <dd>127.0.0.1:{processState?.port || LOCAL_AGENT_PORT}</dd>
              </div>
              <div>
                <dt>Polling atual</dt>
                <dd>{visible ? `${pollingInterval} ms` : "Pausado com a janela oculta"}</dd>
              </div>
              <div>
                <dt>Inicio gerenciado</dt>
                <dd>{formatTimestampMs(processState?.managedStartedAtMs)}</dd>
              </div>
              <div>
                <dt>Sessao LocalAuth</dt>
                <dd>{processState?.paths?.sessionPath || "-"}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="logs-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Observabilidade local</p>
              <h2>Eventos e logs</h2>
            </div>
            <div className="mini-actions">
              <button className="text-btn" type="button" onClick={refreshLogs}>
                <FileText size={16} />
                Atualizar logs
              </button>
              <button className="text-btn" type="button" onClick={() => setLogsOpen((open) => !open)}>
                {logsOpen ? "Ocultar" : "Ver logs"}
              </button>
            </div>
          </div>

          {logsOpen ? (
            <>
              <div className="log-path">
                {agentLogs.logPath || processState?.paths?.logPath || "Log ainda nao localizado"}
              </div>

              <div className="event-list">
                {latestAgentLogs.length === 0 ? (
                  <p className="empty-log">
                    Nenhum log do agente encontrado ainda. Ao iniciar o agente, os eventos aparecem aqui.
                  </p>
                ) : (
                  latestAgentLogs.map((entry, index) => (
                    <div
                      className={`event-row ${entry.level}`}
                      key={`${entry.at || "log"}-${entry.message}-${index}`}
                    >
                      <time>{formatDate(entry.at)}</time>
                      <span>
                        {sanitizeDiagnostic(entry.message)}
                        {entry.extra ? <small>{sanitizeDiagnostic(entry.extra)}</small> : null}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}

          <div className="event-list screen-events">
            {events.slice(0, 6).map((event) => (
              <div className={`event-row ${event.level}`} key={`${event.at}-${event.message}`}>
                <time>{formatDate(event.at)}</time>
                <span>{event.message}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
