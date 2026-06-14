export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:47852"
).replace(/\/$/, "");

export const AGENT_AUTH_TOKEN = import.meta.env.VITE_AGENT_AUTH_TOKEN || "";

export type WhatsAppStatus =
  | "stopped"
  | "initializing"
  | "waiting_qr"
  | "qr_available"
  | "authenticated"
  | "ready"
  | "disconnected"
  | "logged_out"
  | "error";

export interface WhatsAppState {
  status: WhatsAppStatus;
  hasClient: boolean;
  isReady: boolean;
  lastEvent: string | null;
  lastError: string | null;
  qr: QrResponse | null;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  uptime: number;
  whatsapp: Omit<WhatsAppState, "qr">;
}

export interface QrResponse {
  status: WhatsAppStatus;
  qr_text: string | null;
  qr_data_url: string | null;
  updated_at: string | null;
  expires_at: string | null;
  message?: string;
}

export interface LogEntry {
  id: string;
  type:
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
  timestamp: string;
  humanMessage?: string;
  payload: Record<string, unknown>;
}

export interface AgentEvent {
  type:
    | "connected"
    | "whatsapp_status"
    | "qr_updated"
    | "message_received"
    | "message_sent"
    | "llm_response"
    | "settings_updated"
    | "conversation_created"
    | "conversation_updated"
    | "conversation_message_received"
    | "conversation_message_sent"
    | "conversation_suggestion_created"
    | "conversation_read"
    | "conversation_ai_paused"
    | "conversation_human_takeover"
    | "error";
  timestamp: string;
  payload: unknown;
}

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

export type ConversationStatus = "open" | "human" | "paused" | "resolved" | "archived";

export interface ConversationSummary {
  contactId: string;
  chatId: string;
  phoneDigits: string | null;
  lid: string | null;
  displayName: string | null;
  status: ConversationStatus;
  aiPaused: boolean;
  humanTakeover: boolean;
  unreadCount: number;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  hasDraftSuggestion: boolean;
}

export interface ConversationMessage {
  id: string;
  whatsappMessageId: string | null;
  direction: "inbound" | "outbound";
  source: "whatsapp" | "manual" | "auto_reply" | "template";
  from: string;
  to: string;
  body: string;
  timestamp: string;
  isAutoReply: boolean;
  isManual: boolean;
  policyReason: string | null;
}

export interface DraftSuggestion {
  id: string;
  text: string;
  createdAt: string;
  model: string;
  basedOnMessageId: string | null;
}

export interface ConversationContact {
  contactId: string;
  chatId: string;
  phoneDigits: string | null;
  lid: string | null;
  displayName: string | null;
  status: ConversationStatus;
  aiPaused: boolean;
  humanTakeover: boolean;
  unreadCount: number;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail {
  contact: ConversationContact;
  messages: ConversationMessage[];
  draftSuggestion: DraftSuggestion | null;
}

export interface ContactPolicy {
  contactId: string;
  optIn: boolean;
  optOut: boolean;
  optOutAt: string | null;
  optOutReason: string | null;
  lastPolicyDecisionAt: string | null;
  notes: string;
  updatedAt: string;
}

export interface InternalTemplate {
  name: string;
  category: string;
  status: string;
  enabled: boolean;
  text: string;
  updatedAt: string;
}

export interface JobsHealth {
  ok: boolean;
  supabase: {
    configured: boolean;
    hasUrl: boolean;
    hasServiceRoleKey: boolean;
    hasAnonKey: boolean;
  };
  message: string;
}

export interface JobVehicle {
  id: string;
  customer_id: string | null;
  plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  engine: string | null;
  source: string | null;
}

export interface JobAppointment {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  service_request_id: string | null;
  conversation_contact_id: string | null;
  scheduled_at: string;
  ends_at: string;
  duration_minutes: number;
  service_type: string | null;
  status: "pending_confirmation" | "confirmed" | "cancelled";
  reception_notified_at: string | null;
  notes: string | null;
}

export interface JobPayment {
  id: string;
  customer_id: string | null;
  quote_id: string | null;
  amount: number | null;
  status: string;
  due_date: string | null;
  method: string | null;
  notes: string | null;
  created_at: string;
}

export interface JobReminder {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  conversation_contact_id: string | null;
  reminder_at: string;
  reason: string | null;
  status: string;
}

export interface JobEvent {
  id: string;
  event_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  conversation_contact_id: string | null;
  status: string;
  created_at: string;
}

function normalizeSettingsResponse(
  response: RuntimeSettings | { ok: boolean; settings: RuntimeSettings }
) {
  return "settings" in response ? response.settings : response;
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (AGENT_AUTH_TOKEN) {
    headers.set("Authorization", `Bearer ${AGENT_AUTH_TOKEN}`);
  }

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers
    });
  } catch (error) {
    throw new Error(
      `Agent offline em ${API_BASE_URL}. Confirme que o backend esta rodando na porta 47852.`
    );
  }

  const text = await response.text();
  let payload: Record<string, unknown> = {};

  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    payload = { error: text };
  }

  if (!response.ok) {
    const rawError = payload.error;
    const detail =
      typeof rawError === "string" ? rawError : rawError ? JSON.stringify(rawError) : "";

    if (response.status === 401) {
      throw new Error(
        "Token do desktop invalido ou ausente. Confira VITE_AGENT_AUTH_TOKEN em desktop/.env.local e AGENT_AUTH_TOKEN no agent."
      );
    }

    throw new Error(detail || `HTTP ${response.status} from agent.`);
  }

  return payload as T;
}

export const api = {
  getHealth: () => requestJson<HealthResponse>("/health"),
  getWhatsAppStatus: () =>
    requestJson<{ ok: boolean; whatsapp: WhatsAppState }>("/whatsapp/status"),
  getQr: () => requestJson<QrResponse>("/whatsapp/qr"),
  startWhatsApp: () =>
    requestJson<{ ok: boolean; reason: string; status: WhatsAppStatus; message: string }>(
      "/whatsapp/start",
      { method: "POST", body: JSON.stringify({}) }
    ),
  stopWhatsApp: () =>
    requestJson<{ ok: boolean; reason: string; status: WhatsAppStatus; message: string }>(
      "/whatsapp/stop",
      { method: "POST", body: JSON.stringify({}) }
    ),
  getPrompt: () => requestJson<{ ok: boolean; prompt: string; updated_at: string }>("/prompt"),
  savePrompt: (prompt: string) =>
    requestJson<{ ok: boolean; prompt: string; updated_at: string }>("/prompt", {
      method: "PUT",
      body: JSON.stringify({ prompt })
    }),
  getLogs: (limit = 100) =>
    requestJson<{ ok: boolean; logs: LogEntry[] }>(`/logs?limit=${limit}`),
  getSettings: async () =>
    normalizeSettingsResponse(
      await requestJson<RuntimeSettings | { ok: boolean; settings: RuntimeSettings }>(
        "/settings"
      )
    ),
  saveSettings: async (settings: Partial<RuntimeSettings>) =>
    normalizeSettingsResponse(
      await requestJson<RuntimeSettings | { ok: boolean; settings: RuntimeSettings }>(
        "/settings",
        {
          method: "PUT",
          body: JSON.stringify(settings)
        }
      )
    ),
  resetSettings: async () =>
    normalizeSettingsResponse(
      await requestJson<RuntimeSettings | { ok: boolean; settings: RuntimeSettings }>(
        "/settings/reset",
        {
          method: "POST",
          body: JSON.stringify({})
        }
      )
    ),
  testLlm: (message: string) =>
    requestJson<{ ok: boolean; reply: string }>("/test/llm", {
      method: "POST",
      body: JSON.stringify({ message })
    }),
  sendWhatsApp: (to: string, message: string) =>
    requestJson<{ ok: boolean; result: Record<string, unknown> }>("/whatsapp/send", {
      method: "POST",
      body: JSON.stringify({ to, message })
    }),
  getConversations: (includeArchived = false) =>
    requestJson<{ ok: boolean; conversations: ConversationSummary[] }>(
      `/conversations?includeArchived=${includeArchived ? "true" : "false"}`
    ),
  getConversation: (contactId: string) =>
    requestJson<ConversationDetail & { ok: boolean }>(
      `/conversations/${encodeURIComponent(contactId)}`
    ),
  suggestConversationReply: (contactId: string, extraInstruction?: string) =>
    requestJson<{ ok: boolean; suggestion: string; draftSuggestion: DraftSuggestion }>(
      `/conversations/${encodeURIComponent(contactId)}/suggest`,
      {
        method: "POST",
        body: JSON.stringify({ extraInstruction })
      }
    ),
  sendConversationReply: (contactId: string, message: string) =>
    requestJson<{ ok: boolean; message: ConversationMessage; contact: ConversationSummary }>(
      `/conversations/${encodeURIComponent(contactId)}/send`,
      {
        method: "POST",
        body: JSON.stringify({ message })
      }
    ),
  markConversationRead: (contactId: string) =>
    requestJson<{ ok: boolean; contact: ConversationSummary }>(
      `/conversations/${encodeURIComponent(contactId)}/read`,
      { method: "POST", body: JSON.stringify({}) }
    ),
  clearConversationDraft: (contactId: string) =>
    requestJson<{ ok: boolean; contact: ConversationSummary }>(
      `/conversations/${encodeURIComponent(contactId)}/clear-draft`,
      { method: "POST", body: JSON.stringify({}) }
    ),
  setConversationHumanTakeover: (contactId: string, enabled: boolean) =>
    requestJson<{ ok: boolean; contact: ConversationSummary }>(
      `/conversations/${encodeURIComponent(contactId)}/human-takeover`,
      { method: "POST", body: JSON.stringify({ enabled }) }
    ),
  setConversationAiPaused: (contactId: string, enabled: boolean) =>
    requestJson<{ ok: boolean; contact: ConversationSummary }>(
      `/conversations/${encodeURIComponent(contactId)}/pause-ai`,
      { method: "POST", body: JSON.stringify({ enabled }) }
    ),
  setConversationStatus: (
    contactId: string,
    status: Extract<ConversationStatus, "open" | "resolved" | "archived">
  ) =>
    requestJson<{ ok: boolean; contact: ConversationSummary }>(
      `/conversations/${encodeURIComponent(contactId)}/status`,
      { method: "POST", body: JSON.stringify({ status }) }
    ),
  getContactPolicy: (contactId: string) =>
    requestJson<{ ok: boolean; policy: ContactPolicy }>(
      `/contacts/${encodeURIComponent(contactId)}/policy`
    ),
  updateContactPolicy: (
    contactId: string,
    policy: Partial<Pick<ContactPolicy, "optIn" | "optOut" | "notes">>
  ) =>
    requestJson<{ ok: boolean; policy: ContactPolicy }>(
      `/contacts/${encodeURIComponent(contactId)}/policy`,
      { method: "PUT", body: JSON.stringify(policy) }
    ),
  optOutContact: (contactId: string, reason?: string) =>
    requestJson<{ ok: boolean; policy: ContactPolicy }>(
      `/contacts/${encodeURIComponent(contactId)}/opt-out`,
      { method: "POST", body: JSON.stringify({ reason }) }
    ),
  optInContact: (contactId: string) =>
    requestJson<{ ok: boolean; policy: ContactPolicy }>(
      `/contacts/${encodeURIComponent(contactId)}/opt-in`,
      { method: "POST", body: JSON.stringify({}) }
    ),
  getTemplates: () =>
    requestJson<{ ok: boolean; templates: InternalTemplate[] }>("/templates"),
  getJobsHealth: () => requestJson<JobsHealth>("/jobs/health"),
  lookupPlate: (plate: string) =>
    requestJson<{
      ok: boolean;
      found: boolean;
      plate: string;
      vehicle: JobVehicle | null;
      message: string;
    }>(`/jobs/vehicles/by-plate/${encodeURIComponent(plate)}`),
  getJobAppointments: () =>
    requestJson<{ ok: boolean; appointments: JobAppointment[] }>("/jobs/appointments"),
  confirmJobAppointment: (id: string) =>
    requestJson<{ ok: boolean; appointment: JobAppointment }>(
      `/jobs/appointments/${encodeURIComponent(id)}/confirm`,
      { method: "POST", body: JSON.stringify({}) }
    ),
  cancelJobAppointment: (id: string) =>
    requestJson<{ ok: boolean; appointment: JobAppointment }>(
      `/jobs/appointments/${encodeURIComponent(id)}/cancel`,
      { method: "POST", body: JSON.stringify({}) }
    ),
  notifyReceptionForAppointment: (id: string) =>
    requestJson<{ ok: boolean; error?: string; appointment?: JobAppointment }>(
      `/jobs/appointments/${encodeURIComponent(id)}/notify-reception`,
      { method: "POST", body: JSON.stringify({}) }
    ),
  getJobEvents: () => requestJson<{ ok: boolean; events: JobEvent[] }>("/jobs/events"),
  getJobPayments: () =>
    requestJson<{ ok: boolean; payments: JobPayment[] }>("/jobs/payments"),
  getJobReminders: () =>
    requestJson<{ ok: boolean; reminders: JobReminder[] }>("/jobs/reminders")
};

export function openAgentEvents(
  onEvent: (event: AgentEvent) => void,
  onError?: () => void
) {
  if (!AGENT_AUTH_TOKEN) {
    return null;
  }

  const url = new URL(`${API_BASE_URL}/events`);
  url.searchParams.set("token", AGENT_AUTH_TOKEN);

  const source = new EventSource(url.toString());
  const eventTypes: AgentEvent["type"][] = [
    "connected",
    "whatsapp_status",
    "qr_updated",
    "message_received",
    "message_sent",
    "llm_response",
    "settings_updated",
    "conversation_created",
    "conversation_updated",
    "conversation_message_received",
    "conversation_message_sent",
    "conversation_suggestion_created",
    "conversation_read",
    "conversation_ai_paused",
    "conversation_human_takeover",
    "error"
  ];

  for (const eventType of eventTypes) {
    source.addEventListener(eventType, (message) => {
      onEvent(JSON.parse((message as MessageEvent).data) as AgentEvent);
    });
  }

  source.onerror = () => {
    onError?.();
  };

  return source;
}
