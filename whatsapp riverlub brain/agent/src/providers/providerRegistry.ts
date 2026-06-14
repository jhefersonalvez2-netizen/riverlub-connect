import type { Client } from "whatsapp-web.js";
import { MetaCloudApiProvider } from "./MetaCloudApiProvider";
import type { WhatsAppProvider } from "./WhatsAppProvider";
import { WhatsAppWebProvider } from "./WhatsAppWebProvider";
import type { ProviderName, ProviderStatus } from "./types";

const providers = new Map<ProviderName, WhatsAppProvider>();
let activeProvider: ProviderName = "whatsapp_web";

providers.set(
  "whatsapp_web",
  new WhatsAppWebProvider({
    getClient: () => null,
    getStatus: () => ({
      status: "not_configured",
      isReady: false,
      lastError: "WhatsApp Web provider has not been attached to the local client yet."
    })
  })
);
providers.set("meta_cloud_api", new MetaCloudApiProvider());

export function configureWhatsAppWebProvider(dependencies: {
  getClient: () => Client | null;
  getStatus: () => Omit<ProviderStatus, "provider">;
}) {
  providers.set("whatsapp_web", new WhatsAppWebProvider(dependencies));
}

export function getActiveProviderName() {
  return activeProvider;
}

export function setActiveProvider(providerName: ProviderName) {
  if (!providers.has(providerName)) {
    throw new Error(`Provider ${providerName} is not registered.`);
  }

  activeProvider = providerName;
}

export function getActiveProvider() {
  const provider = providers.get(activeProvider);

  if (!provider) {
    throw new Error(`Active provider ${activeProvider} is not registered.`);
  }

  return provider;
}

export function getAvailableProviders() {
  return Array.from(providers.keys());
}

export async function getProviderDebugState() {
  const provider = getActiveProvider();

  return {
    activeProvider,
    availableProviders: getAvailableProviders(),
    status: await provider.getStatus()
  };
}
