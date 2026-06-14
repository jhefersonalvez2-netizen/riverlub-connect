import { SupabaseNotConfiguredError } from "../db/supabase";
import type { ConversationRecord } from "../storage/conversationStore";
import { addLog } from "../storage/logStore";
import {
  createPendingAppointment,
  getPendingAppointmentForConversation,
  suggestAvailableSlots
} from "../jobs/appointmentService";
import { ensureCustomerForConversation } from "../jobs/customerService";
import { createAiAction, completeAiAction } from "../jobs/aiActionService";
import { createServiceRequest } from "../jobs/serviceRequestService";
import { lookupPlate, extractPlateFromText } from "../jobs/plateLookupService";
import { notifyReceptionForAppointment } from "../jobs/receptionNotifyService";
import { confirmAppointment } from "../jobs/appointmentService";
import type { Appointment, Vehicle } from "../db/types";

export interface AiActionOrchestratorResult {
  responseOverride?: string;
  actionContext?: string[];
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function wantsAppointment(text: string) {
  const normalized = normalizeText(text);
  return (
    normalized.includes("agendar") ||
    normalized.includes("agenda") ||
    normalized.includes("horario") ||
    normalized.includes("marcar") ||
    normalized.includes("amanha") ||
    normalized.includes("hoje")
  );
}

function isConfirmation(text: string) {
  const normalized = normalizeText(text).trim();
  return /^(sim|ok|fechado|confirmo|pode confirmar|pode sim|isso mesmo|certo|ta bom|tá bom)\b/.test(
    normalized
  );
}

function serviceTypeFromText(text: string) {
  const normalized = normalizeText(text);
  if (normalized.includes("troca") && normalized.includes("oleo")) {
    return "troca_de_oleo";
  }

  if (normalized.includes("filtro")) {
    return "filtros";
  }

  return "servico_automotivo";
}

function findPlateInConversation(conversation: ConversationRecord, latestMessage: string) {
  const latestPlate = extractPlateFromText(latestMessage);
  if (latestPlate) return latestPlate;

  for (const message of [...conversation.messages].reverse()) {
    const plate = extractPlateFromText(message.body);
    if (plate) return plate;
  }

  return null;
}

function extractTime(text: string) {
  const normalized = normalizeText(text);
  const match = normalized.match(/\b([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?\b/);

  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: match[2] ? Number(match[2]) : 0
  };
}

function extractDate(text: string) {
  const normalized = normalizeText(text);
  const now = new Date();
  const date = new Date(now);

  if (normalized.includes("amanha")) {
    date.setDate(date.getDate() + 1);
    return date;
  }

  if (normalized.includes("hoje")) {
    return date;
  }

  const slashDate = normalized.match(/\b([0-3]?\d)\/([01]?\d)(?:\/(\d{2,4}))?\b/);
  if (slashDate) {
    const day = Number(slashDate[1]);
    const month = Number(slashDate[2]) - 1;
    const year = slashDate[3]
      ? Number(slashDate[3].length === 2 ? `20${slashDate[3]}` : slashDate[3])
      : now.getFullYear();
    return new Date(year, month, day);
  }

  const isoDate = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoDate) {
    return new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
  }

  return null;
}

function extractRequestedDateTime(text: string) {
  const date = extractDate(text);
  const time = extractTime(text);

  if (!date || !time) {
    return null;
  }

  date.setHours(time.hour, time.minute, 0, 0);
  return date;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatVehicle(vehicle: Vehicle | null) {
  if (!vehicle) return "veiculo nao identificado";
  return [vehicle.make, vehicle.model, vehicle.year, vehicle.plate ? `/ ${vehicle.plate}` : null]
    .filter(Boolean)
    .join(" ");
}

async function safeNotifyReception(appointment: Appointment, vehicle: Vehicle | null) {
  return notifyReceptionForAppointment({
    appointment,
    vehicleLabel: formatVehicle(vehicle)
  });
}

export async function runAiActionOrchestrator(input: {
  conversation: ConversationRecord;
  latestMessage: string;
}): Promise<AiActionOrchestratorResult> {
  const { conversation, latestMessage } = input;
  const conversationContactId = conversation.contactId;

  try {
    const pendingAppointment = await getPendingAppointmentForConversation(conversationContactId);

    if (pendingAppointment && isConfirmation(latestMessage)) {
      const aiAction = await createAiAction({
        conversationContactId,
        actionType: "confirm_appointment",
        input: { appointmentId: pendingAppointment.id },
        requiresConfirmation: true,
        confirmedByCustomer: true
      });
      const appointment = await confirmAppointment(pendingAppointment.id);
      await completeAiAction(aiAction.id, {
        appointmentId: appointment.id,
        status: appointment.status
      });
      const plate = findPlateInConversation(conversation, latestMessage);
      const vehicle = plate ? (await lookupPlate(plate)).vehicle : null;
      const notification = await safeNotifyReception(appointment, vehicle);

      return {
        responseOverride: notification.ok
          ? `Perfeito, horario confirmado para ${formatDateTime(appointment.scheduled_at)}. A recepcao ja foi avisada.`
          : `Perfeito, horario confirmado para ${formatDateTime(appointment.scheduled_at)}. A recepcao ainda precisa ser avisada manualmente: ${notification.error}`,
        actionContext: [`Agendamento confirmado: ${appointment.id}`]
      };
    }

    const plate = findPlateInConversation(conversation, latestMessage);
    const explicitPlate = extractPlateFromText(latestMessage);

    if (explicitPlate) {
      const aiAction = await createAiAction({
        conversationContactId,
        actionType: "lookup_plate",
        input: { plate: explicitPlate }
      });
      const result = await lookupPlate(explicitPlate);
      await completeAiAction(aiAction.id, {
        found: result.found,
        plate: result.plate,
        vehicleId: result.vehicle?.id ?? null
      });

      if (!result.found) {
        return { responseOverride: result.message };
      }

      if (!wantsAppointment(latestMessage)) {
        return {
          responseOverride: `${result.message} Se for esse mesmo, me diga o servico e o melhor horario para atendimento.`
        };
      }
    }

    if (!wantsAppointment(latestMessage)) {
      return {};
    }

    if (!plate) {
      return {
        responseOverride:
          "Consigo te ajudar com o agendamento. Pode me informar a placa do veiculo para eu localizar o cadastro?"
      };
    }

    const plateResult = await lookupPlate(plate);
    if (!plateResult.found || !plateResult.vehicle) {
      return { responseOverride: plateResult.message };
    }

    const requestedAt = extractRequestedDateTime(latestMessage);
    if (!requestedAt) {
      return {
        responseOverride:
          `Encontrei o veiculo ${formatVehicle(plateResult.vehicle)}. Qual data e horario voce prefere para o atendimento?`
      };
    }

    const customer = await ensureCustomerForConversation({
      conversationContactId
    });
    const serviceType = serviceTypeFromText(latestMessage);
    const serviceRequest = await createServiceRequest({
      customerId: customer.id,
      vehicleId: plateResult.vehicle.id,
      conversationContactId,
      type: serviceType,
      description: `Solicitacao via WhatsApp: ${latestMessage}`,
      createdBy: "ai"
    });
    const aiAction = await createAiAction({
      conversationContactId,
      actionType: "create_pending_appointment",
      input: {
        plate,
        scheduledAt: requestedAt.toISOString(),
        serviceType
      },
      requiresConfirmation: true
    });
    const created = await createPendingAppointment({
      customerId: customer.id,
      vehicleId: plateResult.vehicle.id,
      serviceRequestId: serviceRequest.id,
      conversationContactId,
      scheduledAt: requestedAt.toISOString(),
      serviceType,
      notes: `Criado pela IA aguardando confirmacao do cliente.`
    });

    if (!created.ok) {
      const date = requestedAt.toISOString().slice(0, 10);
      const slots = await suggestAvailableSlots({
        date,
        serviceType,
        limit: 3
      });
      await addLog("ai_action_failed", {
        actionType: "create_pending_appointment",
        reason: created.availability.reason,
        conversationContactId
      });

      if (slots.length === 0) {
        return {
          responseOverride:
            "Esse horario nao esta disponivel dentro da agenda. Nao encontrei opcoes livres nesse dia; posso encaminhar para a recepcao verificar?"
        };
      }

      const options = slots.map((slot) => formatDateTime(slot.scheduledAt)).join(", ");
      return {
        responseOverride: `Esse horario nao esta disponivel. Tenho estas opcoes: ${options}. Alguma delas serve?`
      };
    }

    await completeAiAction(aiAction.id, {
      appointmentId: created.appointment.id,
      status: created.appointment.status
    });

    return {
      responseOverride: `Tenho esse horario disponivel para ${formatDateTime(created.appointment.scheduled_at)}. Posso confirmar para ${formatVehicle(plateResult.vehicle)}?`,
      actionContext: [`Agendamento pendente criado: ${created.appointment.id}`]
    };
  } catch (error) {
    if (error instanceof SupabaseNotConfiguredError) {
      return {
        responseOverride:
          "Consigo conduzir o agendamento, mas o banco de laboratorio ainda nao esta configurado. Vou encaminhar para a recepcao confirmar manualmente."
      };
    }

    const message = error instanceof Error ? error.message : "Falha ao executar acao da IA.";
    await addLog(
      "ai_action_failed",
      {
        conversationContactId,
        error: message
      },
      "Falha no orquestrador de acoes da IA."
    );
    return {
      actionContext: [`Falha ao executar acao operacional: ${message}`]
    };
  }
}
