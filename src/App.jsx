import {
  Activity,
  FileText,
  LogOut,
  MonitorCog,
  Power,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { disconnectLocalAgent, getLocalAgentHealth } from "./agentClient";

const STATUS = {
  STOPPED: "STOPPED",
  STARTING: "STARTING",
  WAITING_QR: "WAITING_QR",
  CONNECTED: "CONNECTED",
  ERROR: "ERROR",
};

const STATUS_META = {
  [STATUS.STOPPED]: {
    label: "Agente parado",
    tone: "neutral",
    detail: "Nenhum agente local respondeu neste computador.",
  },
  [STATUS.STARTING]: {
    label: "Iniciando",
    tone: "info",
    detail: "O agente local esta abrindo a sessao do WhatsApp.",
  },
  [STATUS.WAITING_QR]: {
    label: "Aguardando QR Code",
    tone: "warning",
    detail: "Abra o painel Web para visualizar o QR Code real nesta fase.",
  },
  [STATUS.CONNECTED]: {
    label: "Conectado",
    tone: "success",
    detail: "WhatsApp local conectado e pronto para receber jobs.",
  },
  [STATUS.ERROR]: {
    label: "Erro",
    tone: "danger",
    detail: "O agente local retornou erro. Confira logs antes de reiniciar.",
  },
};

function getStatusFromHealth(health) {
  if (!health?.instalado) return STATUS.STOPPED;
  if (health.erro_ultimo) return STATUS.ERROR;
  if (health.conectado) return STATUS.CONNECTED;
  if (health.inicializando) return STATUS.STARTING;
  if (health.configurado) return STATUS.WAITING_QR;
  return STATUS.STOPPED;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function App() {
  const [status, setStatus] = useState(STATUS.STOPPED);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [events, setEvents] = useState([
    {
      at: new Date().toISOString(),
      level: "info",
      message: "RiverLub Connect iniciado em modo base.",
    },
  ]);

  const meta = STATUS_META[status];

  const addEvent = useCallback((level, message) => {
    setEvents((current) => [
      { at: new Date().toISOString(), level, message },
      ...current,
    ].slice(0, 30));
  }, []);

  const refreshStatus = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);

    try {
      const data = await getLocalAgentHealth();
      const nextStatus = getStatusFromHealth(data);
      setHealth(data);
      setStatus(nextStatus);

      if (!silent) {
        addEvent("info", `Status local lido: ${STATUS_META[nextStatus].label}.`);
      }
    } catch {
      setHealth(null);
      setStatus(STATUS.STOPPED);
      if (!silent) {
        addEvent("warn", "Nenhum agente local respondeu em 127.0.0.1:47851.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addEvent]);

  useEffect(() => {
    refreshStatus({ silent: true });
    const timer = window.setInterval(() => {
      refreshStatus({ silent: true });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  const metrics = useMemo(() => [
    {
      label: "Agente local",
      value: health?.instalado ? "Detectado" : "Nao encontrado",
      foot: health?.versao ? `Versao ${health.versao}` : "Porta 47851",
    },
    {
      label: "Configuracao",
      value: health?.configurado ? "Pareado" : "Pendente",
      foot: "Token nao exibido na interface",
    },
    {
      label: "WhatsApp",
      value: health?.conectado ? "Online" : "Offline",
      foot: health?.navegador_local ? "Navegador local detectado" : "Chrome/Edge nao confirmado",
    },
    {
      label: "Ultima leitura",
      value: health?.atualizado_em ? formatDate(health.atualizado_em) : "-",
      foot: health?.ultimo_evento || "Sem evento local",
    },
  ], [health]);

  async function handleStartAgent() {
    addEvent(
      "info",
      "Base criada. Na proxima fase o Tauri iniciara o agente como sidecar sem terminal."
    );
    await refreshStatus();
  }

  async function handleRestartAgent() {
    setStatus(STATUS.STARTING);
    addEvent(
      "info",
      "Reinicio preparado para a fase sidecar. Por enquanto a acao apenas reler o agente atual."
    );
    await refreshStatus();
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await disconnectLocalAgent();
      addEvent("info", "Comando de desconexao enviado ao agente local atual.");
      await refreshStatus({ silent: true });
    } catch (error) {
      addEvent("error", error.message || "Nao foi possivel desconectar o agente local.");
      setStatus(STATUS.ERROR);
    } finally {
      setLoading(false);
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

        <div className="side-note">
          <span>Windows primeiro</span>
          <strong>Base Tauri v2</strong>
          <small>Sem alterar o RiverLub Web nem o backend em producao.</small>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Integracoes locais</p>
            <h1>RiverLub Connect</h1>
            <p className="intro">
              Controle local para WhatsApp, impressoras e futuras rotinas da oficina.
            </p>
          </div>
          <div className={`status-pill ${meta.tone}`}>
            <Activity size={18} />
            {meta.label}
          </div>
        </header>

        <section className="status-band">
          <div>
            <p className="eyebrow">Status atual</p>
            <h2>{meta.label}</h2>
            <p>{health?.erro_ultimo || meta.detail}</p>
          </div>
          <div className="action-row">
            <button className="btn primary" type="button" onClick={handleStartAgent} disabled={loading}>
              <Power size={17} />
              Iniciar agente
            </button>
            <button className="btn secondary" type="button" onClick={handleRestartAgent} disabled={loading}>
              <RefreshCw size={17} />
              Reiniciar
            </button>
            <button className="btn danger" type="button" onClick={handleDisconnect} disabled={loading || !health?.instalado}>
              <LogOut size={17} />
              Desconectar
            </button>
            <button className="btn ghost" type="button" onClick={() => setLogsOpen((open) => !open)}>
              <FileText size={17} />
              Ver logs
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

        <section className="workspace-grid">
          <div className="qr-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Pareamento</p>
                <h2>QR Code</h2>
              </div>
              <QrCode size={24} />
            </div>
            <div className="qr-placeholder">
              <div className="qr-box">
                <span />
                <span />
                <span />
                <span />
              </div>
              <p>
                Nesta base inicial, o QR real continua vindo pelo painel Web. O Connect
                ja esta preparado para receber essa tela na proxima fase.
              </p>
            </div>
          </div>

          <div className="details-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Agente atual</p>
                <h2>Leitura local</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => refreshStatus()} disabled={loading}>
                <RefreshCw size={18} />
              </button>
            </div>

            <dl className="detail-list">
              <div>
                <dt>API configurada</dt>
                <dd>{health?.apiUrl || "-"}</dd>
              </div>
              <div>
                <dt>Porta local</dt>
                <dd>{health?.porta || "47851"}</dd>
              </div>
              <div>
                <dt>Ultimo evento</dt>
                <dd>{health?.ultimo_evento || "-"}</dd>
              </div>
              <div>
                <dt>Ultimo QR</dt>
                <dd>{formatDate(health?.ultimo_qr_em)}</dd>
              </div>
            </dl>
          </div>
        </section>

        {logsOpen ? (
          <section className="logs-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Eventos desta tela</p>
                <h2>Logs</h2>
              </div>
              <button className="text-btn" type="button" onClick={() => setEvents([])}>
                Limpar
              </button>
            </div>
            <div className="event-list">
              {events.length === 0 ? (
                <p className="empty-log">Nenhum evento registrado nesta execucao.</p>
              ) : (
                events.map((event) => (
                  <div className={`event-row ${event.level}`} key={`${event.at}-${event.message}`}>
                    <time>{formatDate(event.at)}</time>
                    <span>{event.message}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

export default App;

