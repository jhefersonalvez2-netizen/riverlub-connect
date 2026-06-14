import type {
  ProviderStatus,
  SendMediaInput,
  SendMessageResult,
  SendTextInput
} from "./types";

export interface WhatsAppProvider {
  getName(): string;
  getStatus(): Promise<ProviderStatus> | ProviderStatus;
  initialize?(): Promise<void>;
  destroy?(): Promise<void>;
  sendText(input: SendTextInput): Promise<SendMessageResult>;
  sendMedia?(input: SendMediaInput): Promise<SendMessageResult>;
  markRead?(messageId: string): Promise<void>;
}
