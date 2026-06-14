import { env } from "../env";
import { sendMessageWithPolicy } from "../messages/messageGateway";
import { addLog } from "../storage/logStore";
import type { Appointment } from "../db/types";
import { markReceptionNotified } from "./appointmentService";
import { createJobEvent } from "./jobEventService";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

export async function notifyReceptionForAppointment(input: {
  appointment: Appointment;
  customerName?: string | null;
  vehicleLabel?: string | null;
}) {
  if (!env.receptionNotifyEnabled) {
    await createJobEvent({
      eventType: "reception_notification_disabled",
      entityType: "appointment",
      entityId: input.appointment.id,
      conversationContactId: input.appointment.conversation_contact_id,
      status: "pending_reception_notification",
      payload: {
        reason: "RECEPTION_NOTIFY_ENABLED=false"
      }
    });
    return {
      ok: false,
      error: "Notificacao da recepcao desativada por RECEPTION_NOTIFY_ENABLED=false."
    };
  }

  if (!env.receptionNotifyTo) {
    await createJobEvent({
      eventType: "reception_notification_missing_destination",
      entityType: "appointment",
      entityId: input.appointment.id,
      conversationContactId: input.appointment.conversation_contact_id,
      status: "pending_reception_notification",
      payload: {
        reason: "RECEPTION_NOTIFY_TO ausente"
      }
    });
    await addLog(
      "reception_notification_failed",
      { appointmentId: input.appointment.id, reason: "RECEPTION_NOTIFY_TO missing" },
      "Notificacao da recepcao pendente: configure RECEPTION_NOTIFY_TO."
    );
    return {
      ok: false,
      error: "Configure RECEPTION_NOTIFY_TO no .env do agent para notificar a recepcao."
    };
  }

  const message = [
    "Novo horario confirmado pela IA:",
    `Cliente: ${input.customerName || "nao informado"}`,
    `Veiculo: ${input.vehicleLabel || "nao informado"}`,
    `Servico: ${input.appointment.service_type || "nao informado"}`,
    `Data/hora: ${formatDateTime(input.appointment.scheduled_at)}`,
    `Conversa: ${input.appointment.conversation_contact_id || "nao informada"}`
  ].join("\n");

  try {
    await sendMessageWithPolicy({
      to: env.receptionNotifyTo,
      text: message,
      source: "internal_notification",
      contactId: env.receptionNotifyTo,
      messageType: "manual",
      internalNotificationAllowed: true,
      saveToConversation: false
    });
    const appointment = await markReceptionNotified(input.appointment.id);
    await addLog("reception_notification_sent", {
      appointmentId: appointment.id,
      to: env.receptionNotifyTo
    });
    return {
      ok: true,
      appointment
    };
  } catch (error) {
    const messageFromError =
      error instanceof Error ? error.message : "Falha ao notificar recepcao.";
    await createJobEvent({
      eventType: "reception_notification_failed",
      entityType: "appointment",
      entityId: input.appointment.id,
      conversationContactId: input.appointment.conversation_contact_id,
      status: "pending_reception_notification",
      payload: {
        error: messageFromError
      }
    });
    await addLog(
      "reception_notification_failed",
      { appointmentId: input.appointment.id, error: messageFromError },
      "Falha ao notificar recepcao."
    );
    return {
      ok: false,
      error: messageFromError
    };
  }
}
