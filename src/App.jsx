import {
  Activity,
  AlertTriangle,
  FileText,
  LogOut,
  MonitorCog,
  Power,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Square,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readAgentLogs } from "./agent/agentLogs";
import {
  getAgentProcessStatus,
  restartAgentProcess,
  startAgentProcess,
  stopAgentProcess,
} from "./agent/agentProcess";
import {
  classifyAgentError,
  getAgentStatus,
  getProcessOrigin,
  STATUS_META,
} from "./agent/agentStatus";
import { disconnectLocalAgent, getLocalAgentHealth } from "./agentClient";

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

function getHealthErrorDetail(errorType) {
  if (errorType === "auth") return "Falha de autenticacao ou sessao do WhatsApp.";
  if (errorType === "browser") return "Falha relacionada ao Chrome, Edge ou Puppeteer.";
  if (errorType === "port") return "Conflito na porta local 47851.";
  if (errorType === "generic") return "Erro retornado pelo agente local.";
  return "Nenhum erro ativo detectado.";
}

function App() {
  const [status, setStatus] = useState("STOPPED");
  const [health, setHealth] = useState(null);
  const [processState, setProcessState] = useState(null);
  const [agentLogs, setAgentLogs] = useState({
    exists: false,
    logPath: "",
    entries: [],
  });
  const [busyAction, setBusyAction] = useState("");
  const [logsOpen, setLogsOpen] = useState(true);
  const [events, setEvents] = useState([
    {
      at: new Date().toISOString(),
      level: "info",
      message: "RiverLub Connect pronto para gerenciar o agente WhatsApp.",
    },
  ]);

  const meta = STATUS_META[status] || STATUS_META.STOPPED;
  const isBusy = Boolean(busyAction);
  const qrDataUrl = health?.qr_data_url || health?.qrDataUrl || "";
  const errorType = classifyAgentError(health?.erro_ultimo || "");

  const addEvent = useCallback((level, message) => {
    setEvents((current) => [
      { at: new Date().toISOString(), level, message },
      ...current,
    ].slice(0, 40));
  }, []);

  const refreshLogs = useCallback(async () => {
    try {
      const logs = await readAgentLogs(80);
      setAgentLogs(logs);
    } catch (error) {
      addEvent("warn", error.message || "Nao foi possivel ler logs locais.");
    }
  }, [addEvent]);

  const refreshStatus = useCallback(async ({ silent = false, includeLogs = false } = {}) => {
    if (!silent) setBusyAction("refresh");

    const [processResult, healthResult] = await Promise.allSettled([
      getAgentProcessStatus(),
      getLocalAgentHealth(),
    ]);

    const nextProcessState =
      processResult.status === "fulfilled" ? processResult.value : null;
    const nextHealth = healthResult.status === "fulfilled" ? healthResult.value : null;
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

    if (!silent) setBusyAction("");
  }, [addEvent, refreshLogs]);

  useEffect(() => {
    refreshStatus({ silent: true, includeLogs: true });

    const statusTimer = window.setInterval(() => {
      refreshStatus({ silent: true });
    }, 4000);

    const logsTimer = window.setInterval(() => {
      refreshLogs();
    }, 7000);

    return () => {
      window.clearInterval(statusTimer);
      window.clearInterval(logsTimer);
    };
  }, [refreshLogs, refreshStatus]);

  const metrics = useMemo(() => [
    {
      label: "Processo",
      value: getProcessOrigin(processState),
      foot: processState?.managedPid ? `PID ${processState.managedPid}` : "Sem PID gerenciado",
    },
    {
      label: "Porta local",
      value: processState?.portOpen ? "Ocupada" : "Livre",
      foot: `127.0.0.1:${processState?.port || 47851}`,
    },
    {
      label: "Configuracao",
      value: health?.configurado ? "Pareado" : "Pendente",
      foot: "Token nunca aparece nesta tela",
    },
    {
      label: "WhatsApp",
      value: health?.conectado ? "Online" : "Offline",
      foot: health?.navegador_local ? "Navegador local detectado" : "Chrome/Edge ainda nao confirmado",
    },
  ], [health, processState]);

  const latestAgentLogs = agentLogs.entries.slice(0, 8);

  async function runAction(action, eventMessage, callback) {
    setBusyAction(action);
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
      setStatus("ERROR");
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
    await runAction("disconnect", "Sessao WhatsApp desconectada.", disconnectLocalAgent);
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

        <div className="side-note">
          <span>Windows primeiro</span>
          <strong>Controle local seguro</strong>
          <small>
            Mantem o fluxo .cmd existente e so encerra processos criados pelo Connect.
          </small>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Integracoes locais</p>
            <h1>RiverLub Connect</h1>
            <p className="intro">
              Controle desktop para iniciar, monitorar e operar o agente WhatsApp da oficina.
            </p>
          </div>
          <div className={`status-pill ${meta.tone}`}>
            <Activity size={18} />
            {meta.label}
          </div>
        </header>

        <section className={`status-band ${meta.tone}`}>
          <div>
            <p className="eyebrow">Status atual</p>
            <h2>{meta.label}</h2>
            <p>{health?.erro_ultimo || meta.detail}</p>
          </div>
          <div className="action-row">
            <button
              className="btn primary"
              type="button"
              onClick={handleStartAgent}
              disabled={isBusy || processState?.managedRunning || processState?.externalRunning}
              title={processState?.externalRunning ? "Agente externo ja esta usando a porta local" : "Iniciar agente"}
            >
              <Power size={17} />
              Iniciar
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={handleStopAgent}
              disabled={isBusy || !processState?.managedRunning}
              title="Para apenas o processo iniciado pelo Connect"
            >
              <Square size={15} />
              Parar
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={handleRestartAgent}
              disabled={isBusy || processState?.externalRunning}
            >
              <RefreshCw size={17} />
              Reiniciar
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={handleDisconnect}
              disabled={isBusy || !health?.instalado}
            >
              <LogOut size={17} />
              Desconectar
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => setLogsOpen((open) => !open)}
            >
              <FileText size={17} />
              Logs
            </button>
          </div>
        </section>

        <section className="metric-grid" aria-label="Resumo local">
          {metrics.map((item) => (
            <article className="metric-card" key={item.label}>
              <span>{item.label}</span>
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
                <h2>QR Code</h2>
              </div>
              <QrCode size={24} />
            </div>
            <div className={qrDataUrl ? "qr-live" : "qr-placeholder"}>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Code do WhatsApp" />
              ) : (
                <>
                  <div className="qr-box" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <p>
                    O agente atual envia o QR real para o backend RiverLub. O Connect
                    ja esta pronto para renderizar o QR quando ele vier no health local.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="details-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Agente atual</p>
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

            <dl className="detail-list">
              <div>
                <dt>Origem do processo</dt>
                <dd>{getProcessOrigin(processState)}</dd>
              </div>
              <div>
                <dt>Inicio gerenciado</dt>
                <dd>{formatTimestampMs(processState?.managedStartedAtMs)}</dd>
              </div>
              <div>
                <dt>API configurada</dt>
                <dd>{health?.apiUrl || "-"}</dd>
              </div>
              <div>
                <dt>Ultimo evento</dt>
                <dd>{health?.ultimo_evento || "-"}</dd>
              </div>
              <div>
                <dt>Ultimo QR</dt>
                <dd>{formatDate(health?.ultimo_qr_em)}</dd>
              </div>
              <div>
                <dt>Config local</dt>
                <dd>{processState?.paths?.configPath || "-"}</dd>
              </div>
              <div>
                <dt>Sessao LocalAuth</dt>
                <dd>{processState?.paths?.sessionPath || "-"}</dd>
              </div>
              <div>
                <dt>Arquivo do agente</dt>
                <dd>{processState?.paths?.agentEntry || "-"}</dd>
              </div>
            </dl>
          </div>
        </section>

        {logsOpen ? (
          <section className="logs-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Observabilidade local</p>
                <h2>Logs recentes</h2>
              </div>
              <button className="text-btn" type="button" onClick={refreshLogs}>
                Atualizar logs
              </button>
            </div>

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
                      {entry.message}
                      {entry.extra ? <small>{String(entry.extra)}</small> : null}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="event-list screen-events">
              {events.slice(0, 5).map((event) => (
                <div className={`event-row ${event.level}`} key={`${event.at}-${event.message}`}>
                  <time>{formatDate(event.at)}</time>
                  <span>{event.message}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

export default App;
