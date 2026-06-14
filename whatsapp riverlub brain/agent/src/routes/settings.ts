import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { publishEvent } from "../events";
import { addLog } from "../storage/logStore";
import {
  getEffectiveRuntimeSettings,
  isAutoReplyOpenMode,
  resetRuntimeSettings,
  updateRuntimeSettings
} from "../storage/runtimeSettingsStore";

export const settingsRouter = Router();

const settingsUpdateSchema = z
  .object({
    autoReplyMode: z.enum(["manual", "allowlist", "open"]).optional(),
    autoReplyEnabled: z.boolean().optional(),
    autoSuggestEnabled: z.boolean().optional(),
    allowGroups: z.boolean().optional(),
    autoReplyAllowedNumbers: z.array(z.string()).optional(),
    ignoreOldMessagesOnStart: z.boolean().optional(),
    oldMessageMaxAgeSeconds: z.number().int().min(0).max(86400).optional(),
    maxAutoRepliesPerContactPerHour: z.number().int().min(1).max(200).optional(),
    globalPause: z.boolean().optional()
  })
  .strict();

function settingsLogPayload(settings: Awaited<ReturnType<typeof getEffectiveRuntimeSettings>>) {
  return {
    autoReplyMode: settings.autoReplyMode,
    autoReplyEnabled: settings.autoReplyEnabled,
    autoSuggestEnabled: settings.autoSuggestEnabled,
    globalPause: settings.globalPause,
    allowGroups: settings.allowGroups,
    autoReplyAllowedNumbersCount: settings.autoReplyAllowedNumbers.length,
    ignoreOldMessagesOnStart: settings.ignoreOldMessagesOnStart,
    oldMessageMaxAgeSeconds: settings.oldMessageMaxAgeSeconds,
    maxAutoRepliesPerContactPerHour: settings.maxAutoRepliesPerContactPerHour
  };
}

settingsRouter.get("/", requireAuth, async (_request, response, next) => {
  try {
    response.json(await getEffectiveRuntimeSettings());
  } catch (error) {
    next(error);
  }
});

settingsRouter.put("/", requireAuth, async (request, response, next) => {
  try {
    const parsed = settingsUpdateSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: parsed.error.flatten()
      });
      return;
    }

    const previousSettings = await getEffectiveRuntimeSettings();
    const settings = await updateRuntimeSettings(parsed.data);
    publishEvent("settings_updated", settings);
    await addLog(
      "settings_updated",
      settingsLogPayload(settings),
      "Configuracoes operacionais da IA atualizadas."
    );

    if (previousSettings.autoReplyMode !== settings.autoReplyMode) {
      await addLog(
        "auto_reply_mode_changed",
        {
          from: previousSettings.autoReplyMode,
          to: settings.autoReplyMode
        },
        `Modo de resposta automatica alterado para ${settings.autoReplyMode}.`
      );
    }

    if (isAutoReplyOpenMode(settings)) {
      await addLog(
        "auto_reply_open_mode_enabled",
        {
          source: "settings",
          autoReplyMode: settings.autoReplyMode,
          allowGroups: settings.allowGroups
        },
        "Modo aberto de resposta automatica foi ativado."
      );
    }

    if (settings.globalPause) {
      await addLog(
        "auto_reply_paused",
        {
          source: "settings",
          globalPause: true
        },
        "Pausa global da IA ativada."
      );
    }

    response.json(settings);
  } catch (error) {
    next(error);
  }
});

settingsRouter.post("/reset", requireAuth, async (_request, response, next) => {
  try {
    const settings = await resetRuntimeSettings();
    publishEvent("settings_updated", settings);
    await addLog(
      "settings_updated",
      settingsLogPayload(settings),
      "Configuracoes operacionais da IA restauradas para modo seguro."
    );

    response.json(settings);
  } catch (error) {
    next(error);
  }
});
