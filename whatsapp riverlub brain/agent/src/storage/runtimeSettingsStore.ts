import fs from "node:fs/promises";
import { z } from "zod";
import { env } from "../env";
import { ensureDataDir, runtimeSettingsFilePath } from "./paths";

export interface RuntimeSettings {
  autoReplyMode: "manual" | "allowlist" | "open";
  autoReplyEnabled: boolean;
  autoSuggestEnabled: boolean;
  allowGroups: boolean;
  autoReplyAllowedNumbers: string[];
  ignoreOldMessagesOnStart: boolean;
  oldMessageMaxAgeSeconds: number;
  maxAutoRepliesPerContactPerHour: number;
  globalPause: boolean;
  updatedAt: string;
}

const runtimeSettingsSchema = z.object({
  autoReplyMode: z.enum(["manual", "allowlist", "open"]).default("manual"),
  autoReplyEnabled: z.boolean().default(false),
  autoSuggestEnabled: z.boolean().default(false),
  allowGroups: z.boolean().default(false),
  autoReplyAllowedNumbers: z.array(z.string()).default([]),
  ignoreOldMessagesOnStart: z.boolean().default(true),
  oldMessageMaxAgeSeconds: z.number().int().min(0).max(86400).default(120),
  maxAutoRepliesPerContactPerHour: z.number().int().min(1).max(200).default(20),
  globalPause: z.boolean().default(false),
  updatedAt: z.string().default(() => new Date().toISOString())
});

const updateRuntimeSettingsSchema = runtimeSettingsSchema
  .omit({ updatedAt: true })
  .partial()
  .strict();

function normalizeAllowedNumbers(numbers: unknown) {
  if (!Array.isArray(numbers)) {
    return [];
  }

  return Array.from(
    new Set(
      numbers
        .flatMap((value) => String(value).split(/[,\n]/))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .map((value) => {
          if (value.includes("@")) {
            return value.replace(/\s/g, "");
          }

          return value.replace(/\D/g, "");
        })
        .filter(Boolean)
    )
  );
}

function modeFromLegacyAutoReply(autoReplyEnabled: boolean, allowedNumbers: string[]) {
  if (!autoReplyEnabled) {
    return "manual";
  }

  return allowedNumbers.length > 0 ? "allowlist" : "open";
}

function buildSafeDefaults(fromEnv = true): RuntimeSettings {
  const allowedNumbers = fromEnv ? env.autoReplyAllowedNumbers : [];
  const autoReplyMode = fromEnv
    ? modeFromLegacyAutoReply(env.autoReply, allowedNumbers)
    : "manual";

  return {
    autoReplyMode,
    autoReplyEnabled: autoReplyMode !== "manual",
    autoSuggestEnabled: fromEnv ? env.autoSuggest : false,
    allowGroups: fromEnv ? env.allowGroups : false,
    autoReplyAllowedNumbers: allowedNumbers,
    ignoreOldMessagesOnStart: fromEnv ? env.ignoreOldMessagesOnStart : true,
    oldMessageMaxAgeSeconds: fromEnv ? env.oldMessageMaxAgeSeconds : 120,
    maxAutoRepliesPerContactPerHour: 20,
    globalPause: false,
    updatedAt: new Date().toISOString()
  };
}

async function writeRuntimeSettings(settings: RuntimeSettings) {
  await ensureDataDir();
  await fs.writeFile(
    runtimeSettingsFilePath,
    `${JSON.stringify(settings, null, 2)}\n`,
    "utf8"
  );
  return settings;
}

async function backupCorruptedRuntimeSettings() {
  const backupPath = `${runtimeSettingsFilePath}.corrupt-${Date.now()}.bak`;

  try {
    await fs.rename(runtimeSettingsFilePath, backupPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

export async function ensureRuntimeSettingsStore() {
  await getRuntimeSettings();
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  await ensureDataDir();

  try {
    const raw = await fs.readFile(runtimeSettingsFilePath, "utf8");
    const rawSettings = JSON.parse(raw) as Record<string, unknown>;
    const parsed = runtimeSettingsSchema.parse(rawSettings);
    const normalizedAllowedNumbers = normalizeAllowedNumbers(parsed.autoReplyAllowedNumbers);
    const hasExplicitMode = typeof rawSettings.autoReplyMode === "string";
    const autoReplyMode = hasExplicitMode
      ? parsed.autoReplyMode
      : modeFromLegacyAutoReply(parsed.autoReplyEnabled, normalizedAllowedNumbers);

    return {
      ...parsed,
      autoReplyMode,
      autoReplyEnabled: autoReplyMode !== "manual",
      autoReplyAllowedNumbers: normalizedAllowedNumbers
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT") {
      return writeRuntimeSettings(buildSafeDefaults(true));
    }

    await backupCorruptedRuntimeSettings();
    return writeRuntimeSettings(buildSafeDefaults(false));
  }
}

export async function getEffectiveRuntimeSettings() {
  return getRuntimeSettings();
}

export async function updateRuntimeSettings(partial: unknown) {
  const parsed = updateRuntimeSettingsSchema.parse(partial);
  const current = await getRuntimeSettings();
  const allowedNumbers =
    "autoReplyAllowedNumbers" in parsed
      ? normalizeAllowedNumbers(parsed.autoReplyAllowedNumbers)
      : current.autoReplyAllowedNumbers;
  const autoReplyMode =
    "autoReplyMode" in parsed
      ? parsed.autoReplyMode ?? current.autoReplyMode
      : "autoReplyEnabled" in parsed
        ? modeFromLegacyAutoReply(Boolean(parsed.autoReplyEnabled), allowedNumbers)
        : current.autoReplyMode;
  const next: RuntimeSettings = {
    ...current,
    ...parsed,
    autoReplyMode,
    autoReplyEnabled: autoReplyMode !== "manual",
    autoReplyAllowedNumbers: allowedNumbers,
    updatedAt: new Date().toISOString()
  };

  return writeRuntimeSettings(runtimeSettingsSchema.parse(next));
}

export async function resetRuntimeSettings() {
  return writeRuntimeSettings(buildSafeDefaults(false));
}

export function isAutoReplyOpenMode(settings: RuntimeSettings) {
  return settings.autoReplyMode === "open";
}
