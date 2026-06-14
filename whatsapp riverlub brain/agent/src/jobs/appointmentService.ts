import { formatSupabaseError, getSupabaseClient } from "../db/supabase";
import type { Appointment } from "../db/types";
import { addLog } from "../storage/logStore";
import {
  DEFAULT_BUSINESS_HOURS,
  type AvailabilityInput,
  type AvailabilityResult,
  type CreatePendingAppointmentInput,
  type Weekday
} from "./jobsTypes";

const BLOCKING_STATUSES = ["pending_confirmation", "confirmed"];
const WEEKDAYS: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

export function inferDurationMinutes(serviceType?: string | null, explicit?: number) {
  if (explicit && Number.isFinite(explicit) && explicit > 0) {
    return Math.min(Math.max(Math.trunc(explicit), 15), 480);
  }

  const normalized = (serviceType ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  if (normalized.includes("troca") && normalized.includes("oleo")) {
    return 40;
  }

  return 60;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function dateMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function isInsideBusinessHours(start: Date, end: Date) {
  const windows = DEFAULT_BUSINESS_HOURS[WEEKDAYS[start.getDay()]];
  const startMinutes = dateMinutes(start);
  const endMinutes = dateMinutes(end);

  return windows.some(
    (window) =>
      startMinutes >= minutesFromTime(window.start) &&
      endMinutes <= minutesFromTime(window.end)
  );
}

function overlaps(leftStart: Date, leftEnd: Date, rightStart: Date, rightEnd: Date) {
  return leftStart < rightEnd && leftEnd > rightStart;
}

function appointmentEnd(appointment: Appointment) {
  return appointment.ends_at
    ? new Date(appointment.ends_at)
    : addMinutes(new Date(appointment.scheduled_at), appointment.duration_minutes || 60);
}

export async function listAppointments(filters: {
  status?: string;
  date?: string;
  conversationContactId?: string;
} = {}) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("appointments")
    .select("*")
    .order("scheduled_at", { ascending: true })
    .limit(200);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.conversationContactId) {
    query = query.eq("conversation_contact_id", filters.conversationContactId);
  }

  if (filters.date) {
    const start = new Date(`${filters.date}T00:00:00`);
    const end = new Date(`${filters.date}T23:59:59`);
    query = query.gte("scheduled_at", start.toISOString()).lte("scheduled_at", end.toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(formatSupabaseError(error));
  return (data ?? []) as Appointment[];
}

export async function getPendingAppointmentForConversation(conversationContactId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("conversation_contact_id", conversationContactId)
    .eq("status", "pending_confirmation")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(formatSupabaseError(error));
  return (data ?? null) as Appointment | null;
}

export async function checkAvailability(input: AvailabilityInput): Promise<AvailabilityResult> {
  const start = new Date(input.scheduledAt);
  const durationMinutes = inferDurationMinutes(input.serviceType, input.durationMinutes);

  if (!Number.isFinite(start.getTime())) {
    return {
      available: false,
      reason: "invalid_datetime",
      conflictingAppointments: [],
      durationMinutes,
      endsAt: null
    };
  }

  const end = addMinutes(start, durationMinutes);

  if (!isInsideBusinessHours(start, end)) {
    return {
      available: false,
      reason: "outside_business_hours",
      conflictingAppointments: [],
      durationMinutes,
      endsAt: end.toISOString()
    };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .in("status", BLOCKING_STATUSES);

  if (error) throw new Error(formatSupabaseError(error));

  const conflictingAppointments = ((data ?? []) as Appointment[]).filter((appointment) =>
    overlaps(start, end, new Date(appointment.scheduled_at), appointmentEnd(appointment))
  );

  return {
    available: conflictingAppointments.length === 0,
    reason: conflictingAppointments.length === 0 ? "slot_available" : "slot_conflict",
    conflictingAppointments,
    durationMinutes,
    endsAt: end.toISOString()
  };
}

export async function suggestAvailableSlots(input: {
  date: string;
  serviceType?: string | null;
  durationMinutes?: number;
  limit?: number;
}) {
  const durationMinutes = inferDurationMinutes(input.serviceType, input.durationMinutes);
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 12);
  const day = new Date(`${input.date}T00:00:00`);

  if (!Number.isFinite(day.getTime())) {
    return [];
  }

  const windows = DEFAULT_BUSINESS_HOURS[WEEKDAYS[day.getDay()]];
  const slots: { scheduledAt: string; endsAt: string; durationMinutes: number }[] = [];

  for (const window of windows) {
    const [startHour, startMinute] = window.start.split(":").map(Number);
    const [endHour, endMinute] = window.end.split(":").map(Number);
    const cursor = new Date(day);
    cursor.setHours(startHour, startMinute, 0, 0);
    const windowEnd = new Date(day);
    windowEnd.setHours(endHour, endMinute, 0, 0);

    while (addMinutes(cursor, durationMinutes) <= windowEnd && slots.length < limit) {
      const availability = await checkAvailability({
        scheduledAt: cursor.toISOString(),
        durationMinutes,
        serviceType: input.serviceType
      });

      if (availability.available && availability.endsAt) {
        slots.push({
          scheduledAt: cursor.toISOString(),
          endsAt: availability.endsAt,
          durationMinutes
        });
      }

      cursor.setMinutes(cursor.getMinutes() + 30);
    }
  }

  return slots;
}

export async function createPendingAppointment(input: CreatePendingAppointmentInput) {
  const availability = await checkAvailability({
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes,
    serviceType: input.serviceType
  });

  if (!availability.available || !availability.endsAt) {
    return {
      ok: false as const,
      availability,
      appointment: null
    };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      customer_id: input.customerId ?? null,
      vehicle_id: input.vehicleId ?? null,
      service_request_id: input.serviceRequestId ?? null,
      conversation_contact_id: input.conversationContactId ?? null,
      scheduled_at: new Date(input.scheduledAt).toISOString(),
      ends_at: availability.endsAt,
      duration_minutes: availability.durationMinutes,
      service_type: input.serviceType ?? null,
      status: "pending_confirmation",
      confirmation_requested_at: new Date().toISOString(),
      notes: input.notes ?? null,
      created_by: input.createdBy ?? "ai"
    })
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  const appointment = data as Appointment;
  await addLog("job_created", {
    entityType: "appointment",
    appointmentId: appointment.id,
    status: appointment.status
  });
  await addLog("appointment_pending_confirmation", {
    appointmentId: appointment.id,
    conversationContactId: appointment.conversation_contact_id,
    scheduledAt: appointment.scheduled_at
  });
  return {
    ok: true as const,
    availability,
    appointment
  };
}

export async function confirmAppointment(id: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("status", "pending_confirmation")
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  const appointment = data as Appointment;
  await addLog("appointment_confirmed", {
    appointmentId: appointment.id,
    conversationContactId: appointment.conversation_contact_id,
    scheduledAt: appointment.scheduled_at
  });
  return appointment;
}

export async function cancelAppointment(id: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  const appointment = data as Appointment;
  await addLog("appointment_cancelled", { appointmentId: appointment.id });
  return appointment;
}

export async function markReceptionNotified(id: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      reception_notified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  return data as Appointment;
}

export async function getAppointmentById(id: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(formatSupabaseError(error));
  return (data ?? null) as Appointment | null;
}
