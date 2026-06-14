import type { ProviderStatus } from "../providers/types";
import type { ConversationRecord } from "../storage/conversationStore";
import type { RuntimeSettings } from "../storage/runtimeSettingsStore";
import type { ContactPolicy } from "./contactPolicyStore";

export type PolicySource =
  | "manual"
  | "auto_reply"
  | "conversation_manual"
  | "system_job"
  | "template"
  | "internal_notification";

export type PolicyMessageType = "session" | "template" | "manual";

export type PolicyReason =
  | "manual_send_allowed"
  | "auto_reply_allowed"
  | "inside_24h_customer_service_window"
  | "outside_24h_window_template_required"
  | "outside_24h_window_manual_warning"
  | "global_pause"
  | "contact_ai_paused"
  | "human_takeover"
  | "conversation_archived"
  | "not_in_allowlist"
  | "rate_limited"
  | "opted_out"
  | "newsletter_channel_blocked"
  | "provider_not_ready"
  | "template_allowed"
  | "internal_notification_allowed"
  | "auto_reply_manual_mode";

export interface PolicyInput {
  contactId: string;
  chatId: string;
  direction: "outbound";
  source: PolicySource;
  messageType: PolicyMessageType;
  text?: string;
  conversation?: ConversationRecord | null;
  settings?: RuntimeSettings;
  contactPolicy?: ContactPolicy;
  providerStatus?: ProviderStatus;
  allowlistAllowed?: boolean;
  rateLimited?: boolean;
  templateEnabled?: boolean;
  internalNotificationAllowed?: boolean;
  now?: string;
}

export interface PolicyDecision {
  id: string;
  allowed: boolean;
  reason: PolicyReason;
  severity: "allow" | "block" | "warn";
  details?: Record<string, unknown>;
  createdAt: string;
}
