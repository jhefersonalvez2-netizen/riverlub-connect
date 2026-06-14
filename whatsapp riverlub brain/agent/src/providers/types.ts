export type ProviderName = "whatsapp_web" | "meta_cloud_api";

export interface ProviderStatus {
  provider: ProviderName;
  status: string;
  isReady: boolean;
  lastError?: string | null;
}

export interface SendTextInput {
  to: string;
  text: string;
  metadata?: {
    source?:
      | "manual"
      | "auto_reply"
      | "conversation_manual"
      | "system_job"
      | "template"
      | "internal_notification";
    contactId?: string;
    conversationId?: string;
    policyDecisionId?: string;
  };
}

export interface SendMediaInput {
  to: string;
  mediaUrl: string;
  caption?: string;
  metadata?: SendTextInput["metadata"];
}

export interface SendMessageResult {
  ok: boolean;
  provider: ProviderName;
  to: string;
  messageId?: string;
  raw?: unknown;
  error?: string;
}
