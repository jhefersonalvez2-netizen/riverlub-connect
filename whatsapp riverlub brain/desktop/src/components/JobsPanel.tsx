import { Bell, CalendarCheck, Car, CreditCard, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import type {
  JobAppointment,
  JobEvent,
  JobPayment,
  JobReminder,
  JobsHealth,
  JobVehicle
} from "../lib/api";

interface JobsPanelProps {
  health: JobsHealth | null;
  appointments: JobAppointment[];
  events: JobEvent[];
  payments: JobPayment[];
  reminders: JobReminder[];
  loading: boolean;
  errorMessage: string | null;
  onRefresh: () => Promise<void>;
  onLookupPlate: (plate: string) => Promise<{ found: boolean; vehicle: JobVehicle | null; message: string }>;
  onConfirmAppointment: (id: string) => Promise<void>;
  onCancelAppointment: (id: string) => Promise<void>;
  onNotifyReception: (id: string) => Promise<void>;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending_confirmation: "Aguardando confirmacao",
    confirmed: "Confirmado",
    cancelled: "Cancelado",
    pending: "Pendente",
    scheduled: "Agendado"
  };
  return labels[status] ?? status;
}

export function JobsPanel({
  health,
  appointments,
  events,
  payments,
  reminders,
  loading,
  errorMessage,
  onRefresh,
  onLookupPlate,
  onConfirmAppointment,
  onCancelAppointment,
  onNotifyReception
}: JobsPanelProps) {
  const [plate, setPlate] = useState("AAA1234");
  const [plateResult, setPlateResult] = useState<string | null>(null);

  async function handleLookupPlate() {
    const result = await onLookupPlate(plate);
    setPlateResult(
      result.found && result.vehicle
        ? `${result.vehicle.make ?? ""} ${result.vehicle.model ?? ""} ${result.vehicle.year ?? ""} (${result.vehicle.plate})`
        : result.message
    );
  }

  return (
    <section className="panel jobs-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Operacao</span>
          <h2>Jobs</h2>
        </div>
        <button type="button" className="icon-button" disabled={loading} onClick={() => void onRefresh()}>
          <RefreshCw size={18} />
          <span className="sr-only">Atualizar jobs</span>
        </button>
      </div>

      {errorMessage ? <div className="reply-box is-error">{errorMessage}</div> : null}

      {health ? (
        <div className={health.supabase.configured ? "inline-success" : "warning-box"}>
          {health.message}
        </div>
      ) : null}

      <div className="jobs-grid">
        <div className="job-box">
          <h3>
            <Car size={18} />
            Veiculos
          </h3>
          <div className="inline-form">
            <input value={plate} onChange={(event) => setPlate(event.target.value)} />
            <button type="button" disabled={loading || !plate.trim()} onClick={() => void handleLookupPlate()}>
              <Search size={17} />
              Buscar placa
            </button>
          </div>
          {plateResult ? <div className="reply-box">{plateResult}</div> : null}
        </div>

        <div className="job-box">
          <h3>
            <CalendarCheck size={18} />
            Agendamentos
          </h3>
          <div className="job-list">
            {appointments.length === 0 ? (
              <div className="empty-state">Nenhum agendamento</div>
            ) : (
              appointments.map((appointment) => (
                <article className="job-item" key={appointment.id}>
                  <strong>{statusLabel(appointment.status)}</strong>
                  <span>{formatDate(appointment.scheduled_at)}</span>
                  <small>{appointment.service_type || "servico nao informado"}</small>
                  <small>{appointment.conversation_contact_id}</small>
                  <div className="actions-row">
                    <button
                      type="button"
                      disabled={loading || appointment.status !== "pending_confirmation"}
                      onClick={() => void onConfirmAppointment(appointment.id)}
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      disabled={loading || appointment.status === "cancelled"}
                      onClick={() => void onCancelAppointment(appointment.id)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={loading || appointment.status !== "confirmed"}
                      onClick={() => void onNotifyReception(appointment.id)}
                    >
                      <Bell size={16} />
                      Notificar
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="job-box">
          <h3>
            <CreditCard size={18} />
            Pagamentos pendentes
          </h3>
          <div className="job-list">
            {payments.length === 0 ? (
              <div className="empty-state">Nenhum pagamento</div>
            ) : (
              payments.map((payment) => (
                <article className="job-item" key={payment.id}>
                  <strong>{statusLabel(payment.status)}</strong>
                  <span>{payment.amount ? `R$ ${payment.amount}` : "valor nao definido"}</span>
                  <small>{payment.notes}</small>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="job-box">
          <h3>Lembretes</h3>
          <div className="job-list">
            {reminders.length === 0 ? (
              <div className="empty-state">Nenhum lembrete</div>
            ) : (
              reminders.map((reminder) => (
                <article className="job-item" key={reminder.id}>
                  <strong>{statusLabel(reminder.status)}</strong>
                  <span>{formatDate(reminder.reminder_at)}</span>
                  <small>{reminder.reason}</small>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="job-box is-wide">
          <h3>Eventos</h3>
          <div className="job-list is-compact">
            {events.length === 0 ? (
              <div className="empty-state">Nenhum evento de job</div>
            ) : (
              events.map((event) => (
                <article className="job-item" key={event.id}>
                  <strong>{event.event_type || "evento"}</strong>
                  <span>{statusLabel(event.status)}</span>
                  <small>{formatDate(event.created_at)}</small>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
