import { Router } from "express";
import { requireAuth } from "../auth";
import { env } from "../env";
import { getSupabaseStatus, isSupabaseConfigured } from "../db/supabase";
import { listAppointments } from "../jobs/appointmentService";
import { listJobEvents } from "../jobs/jobEventService";
import { listPayments } from "../jobs/paymentService";
import { listReminders } from "../jobs/reminderService";
import { promptExists } from "../llm/promptStore";
import { getContactPolicyStats } from "../policy/contactPolicyStore";
import { getTemplateStats } from "../policy/templateStore";
import { getProviderDebugState } from "../providers/providerRegistry";
import { getContactMapStats } from "../storage/contactMapStore";
import { getConversationStats } from "../storage/conversationStore";
import { getLogsCount } from "../storage/logStore";
import {
  getEffectiveRuntimeSettings
} from "../storage/runtimeSettingsStore";
import { getWhatsAppDiagnostics } from "../whatsapp/client";
import { getWhatsAppState } from "../whatsapp/status";

export const debugRouter = Router();

debugRouter.get("/state", requireAuth, async (_request, response, next) => {
  try {
    const whatsapp = getWhatsAppState();
    const diagnostics = getWhatsAppDiagnostics();
    const settings = await getEffectiveRuntimeSettings();
    const contactMap = await getContactMapStats();
    const conversations = await getConversationStats();
    const provider = await getProviderDebugState();
    const [contactPolicyStats, templateStats] = await Promise.all([
      getContactPolicyStats(),
      getTemplateStats()
    ]);
    const jobs = await getJobsDebugState();

    response.json({
      ok: true,
      env: {
        hasOpenAIKey: Boolean(env.openAiKey),
        hasAuthToken: Boolean(env.agentAuthToken),
        model: env.openAiModel,
        port: env.port
      },
      settings: {
        autoReplyMode: settings.autoReplyMode,
        autoReplyEnabled: settings.autoReplyEnabled,
        autoSuggestEnabled: settings.autoSuggestEnabled,
        globalPause: settings.globalPause,
        allowGroups: settings.allowGroups,
        autoReplyAllowedNumbersCount: settings.autoReplyAllowedNumbers.length,
        ignoreOldMessagesOnStart: settings.ignoreOldMessagesOnStart,
        oldMessageMaxAgeSeconds: settings.oldMessageMaxAgeSeconds,
        maxAutoRepliesPerContactPerHour: settings.maxAutoRepliesPerContactPerHour
      },
      whatsapp: {
        status: whatsapp.status,
        isReady: whatsapp.isReady,
        clientExists: diagnostics.clientExists,
        clientInitializing: diagnostics.clientInitializing,
        canRecoverFromError:
          whatsapp.status === "error" ||
          whatsapp.status === "disconnected" ||
          whatsapp.status === "logged_out",
        lastEvent: whatsapp.lastEvent,
        lastError: whatsapp.lastError,
        hasQr: Boolean(whatsapp.qr),
        qrUpdatedAt: whatsapp.qr?.updated_at ?? null,
        ignoredMessages: diagnostics.ignoredMessages
      },
      filters: {
        ignoredNewsletterCount:
          diagnostics.ignoredMessages.ignored_newsletter_channel ?? 0,
        ignoredStatusBroadcastCount:
          diagnostics.ignoredMessages.ignored_status_broadcast ?? 0,
        ignoredGroupCount: diagnostics.ignoredMessages.ignored_group ?? 0,
        ignoredEmptyCount: diagnostics.ignoredMessages.ignored_empty_body ?? 0
      },
      provider,
      policy: {
        contactPoliciesCount: contactPolicyStats.contactPoliciesCount,
        templatesCount: templateStats.templatesCount,
        lastPolicyDecisionAt: contactPolicyStats.lastPolicyDecisionAt
      },
      storage: {
        promptExists: await promptExists(),
        logsCount: await getLogsCount()
      },
      contactMap,
      conversations,
      jobs,
      runtime: {
        uptime: process.uptime(),
        platform: process.platform,
        nodeVersion: process.version,
        memory: process.memoryUsage()
      }
    });
  } catch (error) {
    next(error);
  }
});

async function getJobsDebugState() {
  if (!isSupabaseConfigured()) {
    return {
      supabaseConfigured: false,
      appointmentsToday: 0,
      pendingConfirmations: 0,
      pendingReceptionNotifications: 0,
      pendingPayments: 0,
      remindersScheduled: 0
    };
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const [appointmentsToday, pendingConfirmations, pendingEvents, pendingPayments, reminders] =
      await Promise.all([
        listAppointments({ date: today }),
        listAppointments({ status: "pending_confirmation" }),
        listJobEvents("pending_reception_notification"),
        listPayments("pending"),
        listReminders("scheduled")
      ]);

    return {
      supabaseConfigured: getSupabaseStatus().configured,
      appointmentsToday: appointmentsToday.length,
      pendingConfirmations: pendingConfirmations.length,
      pendingReceptionNotifications: pendingEvents.length,
      pendingPayments: pendingPayments.length,
      remindersScheduled: reminders.length
    };
  } catch (error) {
    return {
      supabaseConfigured: true,
      error: error instanceof Error ? error.message : "Falha ao consultar jobs."
    };
  }
}
