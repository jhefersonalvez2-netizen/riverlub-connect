import { Power, RefreshCw, Square, WifiOff } from "lucide-react";
import type { HealthResponse, WhatsAppState } from "../lib/api";

interface StatusCardProps {
  health: HealthResponse | null;
  status: WhatsAppState | null;
  error: string | null;
  busyAction:
    | "start"
    | "stop"
    | "refresh"
    | "save"
    | "test"
    | "send"
    | "settings"
    | "conversation"
    | "jobs"
    | null;
  onRefresh: () => void;
  onStart: () => void;
  onStop: () => void;
}

function formatUptime(seconds?: number) {
  if (!seconds) {
    return "0s";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

export function StatusCard({
  health,
  status,
  error,
  busyAction,
  onRefresh,
  onStart,
  onStop
}: StatusCardProps) {
  const agentOnline = Boolean(health?.ok);
  const whatsappStatus = status?.status ?? health?.whatsapp.status ?? "stopped";
  const busy = Boolean(busyAction);

  return (
    <section className="panel status-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Agent</span>
          <h1>RiverLub WhatsApp Brain</h1>
        </div>
        <span className={`status-pill ${agentOnline ? "is-online" : "is-offline"}`}>
          {agentOnline ? "online" : "offline"}
        </span>
      </div>

      {error ? (
        <div className="alert">
          <WifiOff size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="status-grid">
        <div>
          <span>WhatsApp</span>
          <strong>{whatsappStatus}</strong>
        </div>
        <div>
          <span>Pronto</span>
          <strong>{status?.isReady || health?.whatsapp.isReady ? "sim" : "nao"}</strong>
        </div>
        <div>
          <span>Uptime</span>
          <strong>{formatUptime(health?.uptime)}</strong>
        </div>
        <div>
          <span>Ultimo evento</span>
          <strong>{status?.lastEvent ?? health?.whatsapp.lastEvent ?? "-"}</strong>
        </div>
      </div>

      <div className="actions-row">
        <button type="button" className="primary" disabled={busy} onClick={onStart}>
          <Power size={17} />
          {busyAction === "start" ? "Iniciando..." : "Iniciar WhatsApp"}
        </button>
        <button type="button" disabled={busy} onClick={onStop}>
          <Square size={17} />
          {busyAction === "stop" ? "Parando..." : "Parar"}
        </button>
        <button type="button" className="icon-button" disabled={busy} onClick={onRefresh}>
          <RefreshCw size={18} />
          <span className="sr-only">Atualizar</span>
        </button>
      </div>
    </section>
  );
}
