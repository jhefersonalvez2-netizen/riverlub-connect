const path = require("node:path");
const dotenv = require("dotenv");

for (const envPath of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env")
]) {
  dotenv.config({ path: envPath, override: false });
}

const baseUrl = process.env.AGENT_BASE_URL || `http://localhost:${process.env.PORT || 47852}`;
const token = process.env.AGENT_AUTH_TOKEN || "dev-local-token";

async function getJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`${path} failed with HTTP ${response.status}: ${payload.error || ""}`);
  }

  return payload;
}

async function main() {
  const health = await getJson("/health");
  const debug = await getJson("/debug/state");
  const jobsHealth = await getJson("/jobs/health");

  console.log(
    JSON.stringify(
      {
        ok: true,
        health: {
          service: health.service,
          whatsappStatus: health.whatsapp?.status
        },
        debug: {
          hasOpenAIKey: debug.env?.hasOpenAIKey,
          hasAuthToken: debug.env?.hasAuthToken,
          autoReplyMode: debug.settings?.autoReplyMode,
          autoReplyEnabled: debug.settings?.autoReplyEnabled,
          globalPause: debug.settings?.globalPause,
          allowGroups: debug.settings?.allowGroups,
          whatsappStatus: debug.whatsapp?.status,
          promptExists: debug.storage?.promptExists,
          logsCount: debug.storage?.logsCount,
          conversationsCount: debug.conversations?.contactsCount,
          activeProvider: debug.provider?.activeProvider,
          contactPoliciesCount: debug.policy?.contactPoliciesCount,
          templatesCount: debug.policy?.templatesCount,
          ignoredNewsletterCount: debug.filters?.ignoredNewsletterCount,
          jobsSupabaseConfigured: jobsHealth.supabase?.configured
        }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
