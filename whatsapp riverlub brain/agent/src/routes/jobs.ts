import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import {
  getSupabaseStatus,
  isSupabaseConfigured,
  SupabaseNotConfiguredError
} from "../db/supabase";
import {
  cancelAppointment,
  checkAvailability,
  confirmAppointment,
  createPendingAppointment,
  getAppointmentById,
  listAppointments,
  suggestAvailableSlots
} from "../jobs/appointmentService";
import { createCustomer, listCustomers } from "../jobs/customerService";
import { createAiAction, listAiActions } from "../jobs/aiActionService";
import { createJobEvent, listJobEvents, processJobEvent } from "../jobs/jobEventService";
import { lookupPlate } from "../jobs/plateLookupService";
import { createPendingPayment, listPayments } from "../jobs/paymentService";
import { createQuoteDraft, listQuotes } from "../jobs/quoteService";
import { createReturnReminder, listReminders } from "../jobs/reminderService";
import { notifyReceptionForAppointment } from "../jobs/receptionNotifyService";
import { createServiceRequest, listServiceRequests } from "../jobs/serviceRequestService";
import { createVehicle, listVehicles } from "../jobs/vehicleService";

export const jobsRouter = Router();

const customerSchema = z.object({
  name: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  whatsappChatId: z.string().trim().max(160).optional()
});

const vehicleSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  plate: z.string().trim().max(20).optional(),
  make: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  year: z.number().int().min(1900).max(2200).nullable().optional(),
  engine: z.string().trim().max(80).optional(),
  source: z.string().trim().max(80).optional()
});

const appointmentSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  serviceRequestId: z.string().uuid().nullable().optional(),
  conversationContactId: z.string().trim().max(200).optional(),
  scheduledAt: z.string().trim().min(1),
  serviceType: z.string().trim().max(120).optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  notes: z.string().trim().max(1000).optional(),
  createdBy: z.string().trim().max(80).optional()
});

const quoteSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  serviceRequestId: z.string().uuid().nullable().optional(),
  totalEstimated: z.number().nullable().optional(),
  notes: z.string().trim().max(1000).optional()
});

const paymentSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  quoteId: z.string().uuid().nullable().optional(),
  amount: z.number().nullable().optional(),
  dueDate: z.string().trim().optional(),
  method: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(1000).optional()
});

const reminderSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  conversationContactId: z.string().trim().max(200).optional(),
  reminderAt: z.string().trim().min(1),
  reason: z.string().trim().max(1000).optional()
});

const serviceRequestSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  conversationContactId: z.string().trim().max(200).optional(),
  type: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  priority: z.string().trim().max(40).optional(),
  createdBy: z.string().trim().max(80).optional()
});

const aiActionSchema = z.object({
  conversationContactId: z.string().trim().max(200).optional(),
  actionType: z.string().trim().min(1).max(120),
  status: z.string().trim().max(80).optional(),
  input: z.record(z.unknown()).nullable().optional(),
  result: z.record(z.unknown()).nullable().optional(),
  requiresConfirmation: z.boolean().optional(),
  confirmedByCustomer: z.boolean().optional()
});

function handleJobsError(error: unknown, response: Response) {
  if (error instanceof SupabaseNotConfiguredError) {
    response.status(503).json({
      ok: false,
      error: error.message,
      supabase: getSupabaseStatus()
    });
    return true;
  }

  return false;
}

jobsRouter.get("/health", requireAuth, async (_request, response) => {
  response.json({
    ok: true,
    supabase: getSupabaseStatus(),
    message: isSupabaseConfigured()
      ? "Supabase configurado para o laboratorio de jobs."
      : "Supabase ainda nao configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
  });
});

jobsRouter.get("/customers", requireAuth, async (_request, response, next) => {
  try {
    response.json({ ok: true, customers: await listCustomers() });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.post("/customers", requireAuth, async (request, response, next) => {
  try {
    const parsed = customerSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }
    response.status(201).json({ ok: true, customer: await createCustomer(parsed.data) });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.get("/vehicles/by-plate/:plate", requireAuth, async (request, response, next) => {
  try {
    response.json({ ok: true, ...(await lookupPlate(request.params.plate)) });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.get("/vehicles", requireAuth, async (_request, response, next) => {
  try {
    response.json({ ok: true, vehicles: await listVehicles() });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.post("/vehicles", requireAuth, async (request, response, next) => {
  try {
    const parsed = vehicleSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }
    response.status(201).json({ ok: true, vehicle: await createVehicle(parsed.data) });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.get("/appointments/availability", requireAuth, async (request, response, next) => {
  try {
    const parsed = z
      .object({
        datetime: z.string().trim().min(1),
        durationMinutes: z.coerce.number().int().min(15).max(480).optional(),
        serviceType: z.string().trim().optional()
      })
      .safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }
    response.json({
      ok: true,
      availability: await checkAvailability({
        scheduledAt: parsed.data.datetime,
        durationMinutes: parsed.data.durationMinutes,
        serviceType: parsed.data.serviceType
      })
    });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.get("/appointments/suggest-slots", requireAuth, async (request, response, next) => {
  try {
    const parsed = z
      .object({
        date: z.string().trim().min(10),
        serviceType: z.string().trim().optional(),
        durationMinutes: z.coerce.number().int().min(15).max(480).optional(),
        limit: z.coerce.number().int().min(1).max(12).optional()
      })
      .safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }
    response.json({ ok: true, slots: await suggestAvailableSlots(parsed.data) });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.get("/appointments", requireAuth, async (request, response, next) => {
  try {
    response.json({
      ok: true,
      appointments: await listAppointments({
        status: typeof request.query.status === "string" ? request.query.status : undefined,
        date: typeof request.query.date === "string" ? request.query.date : undefined,
        conversationContactId:
          typeof request.query.conversationContactId === "string"
            ? request.query.conversationContactId
            : undefined
      })
    });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.post("/appointments", requireAuth, async (request, response, next) => {
  try {
    const parsed = appointmentSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }
    const result = await createPendingAppointment(parsed.data);
    response.status(result.ok ? 201 : 409).json(result);
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.post("/appointments/:id/request-confirmation", requireAuth, async (request, response, next) => {
  try {
    const appointment = await getAppointmentById(request.params.id);
    if (!appointment) {
      response.status(404).json({ ok: false, error: "Agendamento nao encontrado." });
      return;
    }
    response.json({ ok: true, appointment });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.post("/appointments/:id/confirm", requireAuth, async (request, response, next) => {
  try {
    const appointment = await confirmAppointment(request.params.id);
    const receptionNotification = await notifyReceptionForAppointment({ appointment });
    response.json({ ok: true, appointment, receptionNotification });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.post("/appointments/:id/cancel", requireAuth, async (request, response, next) => {
  try {
    response.json({ ok: true, appointment: await cancelAppointment(request.params.id) });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.post("/appointments/:id/notify-reception", requireAuth, async (request, response, next) => {
  try {
    const appointment = await getAppointmentById(request.params.id);
    if (!appointment) {
      response.status(404).json({ ok: false, error: "Agendamento nao encontrado." });
      return;
    }
    const result = await notifyReceptionForAppointment({ appointment });
    response.status(result.ok ? 200 : 409).json(result);
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.get("/service-requests", requireAuth, async (_request, response, next) => {
  try {
    response.json({ ok: true, serviceRequests: await listServiceRequests() });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.post("/service-requests", requireAuth, async (request, response, next) => {
  try {
    const parsed = serviceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }
    response.status(201).json({ ok: true, serviceRequest: await createServiceRequest(parsed.data) });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.get("/quotes", requireAuth, async (_request, response, next) => {
  try {
    response.json({ ok: true, quotes: await listQuotes() });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.post("/quotes", requireAuth, async (request, response, next) => {
  try {
    const parsed = quoteSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }
    response.status(201).json({ ok: true, quote: await createQuoteDraft(parsed.data) });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.get("/payments", requireAuth, async (_request, response, next) => {
  try {
    response.json({ ok: true, payments: await listPayments() });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.post("/payments", requireAuth, async (request, response, next) => {
  try {
    const parsed = paymentSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }
    response.status(201).json({ ok: true, payment: await createPendingPayment(parsed.data) });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.get("/reminders", requireAuth, async (_request, response, next) => {
  try {
    response.json({ ok: true, reminders: await listReminders() });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.post("/reminders", requireAuth, async (request, response, next) => {
  try {
    const parsed = reminderSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }
    response.status(201).json({ ok: true, reminder: await createReturnReminder(parsed.data) });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.get("/events", requireAuth, async (_request, response, next) => {
  try {
    response.json({ ok: true, events: await listJobEvents() });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.post("/events/:id/process", requireAuth, async (request, response, next) => {
  try {
    response.json({ ok: true, event: await processJobEvent(request.params.id) });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.get("/ai-actions", requireAuth, async (_request, response, next) => {
  try {
    response.json({ ok: true, aiActions: await listAiActions() });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});

jobsRouter.post("/ai-actions", requireAuth, async (request, response, next) => {
  try {
    const parsed = aiActionSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }
    response.status(201).json({
      ok: true,
      aiAction: await createAiAction({
        ...parsed.data,
        input: parsed.data.input as never,
        result: parsed.data.result as never
      })
    });
  } catch (error) {
    if (handleJobsError(error, response)) return;
    next(error);
  }
});
