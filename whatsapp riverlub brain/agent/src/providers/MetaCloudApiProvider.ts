import type { WhatsAppProvider } from "./WhatsAppProvider";
import type { ProviderStatus, SendMessageResult, SendTextInput } from "./types";

export class MetaCloudApiProvider implements WhatsAppProvider {
  getName() {
    return "meta_cloud_api";
  }

  getStatus(): ProviderStatus {
    return {
      provider: "meta_cloud_api",
      status: "not_configured",
      isReady: false,
      lastError:
        "Meta Cloud API provider not configured yet. Future envs: META_WA_TOKEN, META_WA_PHONE_NUMBER_ID, META_WA_BUSINESS_ACCOUNT_ID, META_WA_VERIFY_TOKEN."
    };
  }

  async sendText(input: SendTextInput): Promise<SendMessageResult> {
    return {
      ok: false,
      provider: "meta_cloud_api",
      to: input.to,
      error: "Meta Cloud API provider not configured yet."
    };
  }
}
