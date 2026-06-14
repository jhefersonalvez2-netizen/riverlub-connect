import type { Client } from "whatsapp-web.js";
import type { WhatsAppProvider } from "./WhatsAppProvider";
import type { ProviderStatus, SendMessageResult, SendTextInput } from "./types";

interface WhatsAppWebProviderDependencies {
  getClient: () => Client | null;
  getStatus: () => Omit<ProviderStatus, "provider">;
}

export class WhatsAppWebProvider implements WhatsAppProvider {
  constructor(private readonly dependencies: WhatsAppWebProviderDependencies) {}

  getName() {
    return "whatsapp_web";
  }

  getStatus(): ProviderStatus {
    const status = this.dependencies.getStatus();
    return {
      provider: "whatsapp_web",
      ...status
    };
  }

  async sendText(input: SendTextInput): Promise<SendMessageResult> {
    const client = this.dependencies.getClient();
    const status = this.getStatus();

    if (!client || !status.isReady) {
      return {
        ok: false,
        provider: "whatsapp_web",
        to: input.to,
        error: "WhatsApp Web provider is not ready."
      };
    }

    try {
      const sent = await client.sendMessage(input.to, input.text);

      return {
        ok: true,
        provider: "whatsapp_web",
        to: input.to,
        messageId: sent.id?._serialized,
        raw: {
          id: sent.id?._serialized,
          ack: sent.ack
        }
      };
    } catch (error) {
      return {
        ok: false,
        provider: "whatsapp_web",
        to: input.to,
        error: error instanceof Error ? error.message : "WhatsApp Web send failed."
      };
    }
  }
}
