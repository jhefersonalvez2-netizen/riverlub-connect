import { ListTree } from "lucide-react";
import type { LogEntry } from "../lib/api";

interface LogsPanelProps {
  logs: LogEntry[];
}

function summarizePayload(payload: Record<string, unknown>) {
  const compact = JSON.stringify(payload);
  return compact.length > 220 ? `${compact.slice(0, 220)}...` : compact;
}

function getLogHumanMessage(log: LogEntry) {
  if (log.humanMessage) {
    return log.humanMessage;
  }

  const reason = String(log.payload.reason ?? "");
  const reasonLabels: Record<string, string> = {
    ignored_number_not_allowed: "Numero nao permitido pela lista.",
    ignored_unresolved_lid_not_allowed: "LID nao resolvido para numero permitido.",
    ignored_not_in_allowlist: "Contato fora da lista permitida.",
    ignored_newsletter_channel: "Canal/newsletter bloqueado.",
    ignored_global_pause: "IA pausada globalmente.",
    ignored_auto_reply_rate_limited: "Limite de respostas automaticas atingido.",
    contact_ai_paused: "Politica bloqueou: IA pausada neste contato.",
    human_takeover: "Politica bloqueou: humano assumiu o atendimento.",
    opted_out: "Politica bloqueou: contato em opt-out.",
    outside_24h_window_template_required:
      "Politica bloqueou: fora da janela de atendimento de 24h.",
    provider_not_ready: "Politica bloqueou: provider indisponivel.",
    newsletter_channel_blocked: "Canal/newsletter bloqueado pela politica.",
    template_allowed: "Politica permitiu template interno.",
    internal_notification_allowed: "Politica permitiu notificacao interna.",
    manual_send_allowed: "Politica permitiu envio manual."
  };

  return reasonLabels[reason] ?? null;
}

export function LogsPanel({ logs }: LogsPanelProps) {
  return (
    <section className="panel logs-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Eventos</span>
          <h2>Logs</h2>
        </div>
        <ListTree size={22} />
      </div>

      <div className="logs-list">
        {logs.length === 0 ? (
          <div className="empty-state">Nenhum evento registrado</div>
        ) : (
          logs.map((log) => (
            <article className="log-item" key={log.id}>
              <div>
                <strong>{log.type}</strong>
                <time>{new Date(log.timestamp).toLocaleString()}</time>
              </div>
              {getLogHumanMessage(log) ? <p>{getLogHumanMessage(log)}</p> : null}
              <code>{summarizePayload(log.payload)}</code>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
