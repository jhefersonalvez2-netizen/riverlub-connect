import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { ensureDataDir, logsFilePath } from "./paths";

export type LogType =
  | "message_received"
  | "message_sent"
  | "llm_response"
  | "error"
  | "status"
  | "send_attempt"
  | "warning"
  | "settings_updated"
  | "message_ignored"
  | "auto_reply_mode_changed"
  | "auto_reply_open_mode_enabled"
  | "auto_reply_paused"
  | "auto_reply_sent"
  | "conversation_created"
  | "conversation_updated"
  | "conversation_suggestion_created"
  | "manual_conversation_message_sent"
  | "policy_decision"
  | "policy_blocked"
  | "opt_out_detected"
  | "opt_in_updated"
  | "template_sent"
  | "template_blocked"
  | "provider_send_result"
  | "job_created"
  | "appointment_pending_confirmation"
  | "appointment_confirmed"
  | "appointment_cancelled"
  | "reception_notification_sent"
  | "reception_notification_failed"
  | "plate_lookup_success"
  | "plate_lookup_not_found"
  | "ai_action_detected"
  | "ai_action_completed"
  | "ai_action_failed";

export interface LogEntry {
  id: string;
  type: LogType;
  timestamp: string;
  humanMessage?: string;
  payload: Record<string, unknown>;
}

const MAX_LOGS = 300;
let logWriteQueue = Promise.resolve();

function shouldRedactKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized.includes("token") ||
    normalized.includes("authorization") ||
    normalized.includes("openai") ||
    normalized.includes("api_key") ||
    normalized.includes("apikey") ||
    normalized === "key" ||
    normalized === "qr" ||
    normalized === "qr_text" ||
    normalized === "qrdataurl" ||
    normalized === "qr_data_url"
  );
}

function sanitizeValue(value: unknown, key = ""): unknown {
  if (shouldRedactKey(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    return value.length > 1000 ? `${value.slice(0, 1000)}... [truncated]` : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(entryValue, entryKey)
      ])
    );
  }

  return value;
}

export function sanitizeLogPayload(payload: Record<string, unknown>) {
  return sanitizeValue(payload) as Record<string, unknown>;
}

async function readLogsUnsafe(): Promise<LogEntry[]> {
  await ensureDataDir();

  try {
    const raw = await fs.readFile(logsFilePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      await fs.writeFile(logsFilePath, "[]\n", "utf8");
      return [];
    }

    throw error;
  }
}

export async function ensureLogStore() {
  await readLogsUnsafe();
}

export async function getLogs(limit = 100) {
  const logs = await readLogsUnsafe();
  return logs.slice(-Math.min(limit, MAX_LOGS)).reverse();
}

export async function getLogsCount() {
  const logs = await readLogsUnsafe();
  return logs.length;
}

export function addLog(
  type: LogType,
  payload: Record<string, unknown>,
  humanMessage?: string
) {
  const entry: LogEntry = {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    humanMessage,
    payload: sanitizeLogPayload(payload)
  };

  const writeTask = logWriteQueue.then(async () => {
    const logs = await readLogsUnsafe();
    const nextLogs = [...logs, entry].slice(-MAX_LOGS);
    await fs.writeFile(logsFilePath, `${JSON.stringify(nextLogs, null, 2)}\n`, "utf8");
    return entry;
  });

  logWriteQueue = writeTask.then(
    () => undefined,
    () => undefined
  );

  return writeTask;
}
