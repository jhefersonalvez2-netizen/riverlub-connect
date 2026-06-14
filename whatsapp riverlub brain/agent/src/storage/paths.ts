import fs from "node:fs";
import path from "node:path";

function resolveAgentRoot() {
  const cwd = process.cwd();

  if (
    fs.existsSync(path.join(cwd, "src", "index.ts")) ||
    fs.existsSync(path.join(cwd, "dist", "index.js"))
  ) {
    return cwd;
  }

  const nestedAgent = path.join(cwd, "agent");
  if (fs.existsSync(nestedAgent)) {
    return nestedAgent;
  }

  return cwd;
}

export const agentRoot = resolveAgentRoot();
export const dataDir = path.join(agentRoot, "src", "storage", "data");
export const promptFilePath = path.join(dataDir, "prompt.json");
export const logsFilePath = path.join(dataDir, "logs.json");
export const runtimeSettingsFilePath = path.join(dataDir, "runtimeSettings.json");
export const contactMapFilePath = path.join(dataDir, "contactMap.json");
export const conversationsFilePath = path.join(dataDir, "conversations.json");
export const contactPoliciesFilePath = path.join(dataDir, "contactPolicies.json");
export const templatesFilePath = path.join(dataDir, "templates.json");

export async function ensureDataDir() {
  await fs.promises.mkdir(dataDir, { recursive: true });
}
