import { CheckCircle2, QrCode } from "lucide-react";
import type { QrResponse, WhatsAppState } from "../lib/api";

interface QrPanelProps {
  qr: QrResponse | null;
  status: WhatsAppState | null;
}

export function QrPanel({ qr, status }: QrPanelProps) {
  const isReady = status?.isReady || status?.status === "ready";
  const lastError = status?.lastError;

  return (
    <section className="panel qr-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Sessao</span>
          <h2>QR Code</h2>
        </div>
        <QrCode size={22} />
      </div>

      <div className="qr-box">
        {qr?.qr_data_url ? (
          <img src={qr.qr_data_url} alt="QR Code do WhatsApp" />
        ) : isReady ? (
          <div className="success-state">
            <CheckCircle2 size={42} />
            <strong>WhatsApp conectado</strong>
          </div>
        ) : lastError ? (
          <div className="empty-state is-error">{lastError}</div>
        ) : (
          <div className="empty-state">{qr?.message ?? "QR ainda nao disponivel"}</div>
        )}
      </div>

      <dl className="meta-list">
        <div>
          <dt>Status</dt>
          <dd>{qr?.status ?? status?.status ?? "stopped"}</dd>
        </div>
        <div>
          <dt>Atualizado</dt>
          <dd>{qr?.updated_at ? new Date(qr.updated_at).toLocaleTimeString() : "-"}</dd>
        </div>
        <div>
          <dt>Expira</dt>
          <dd>{qr?.expires_at ? new Date(qr.expires_at).toLocaleTimeString() : "-"}</dd>
        </div>
      </dl>
    </section>
  );
}
