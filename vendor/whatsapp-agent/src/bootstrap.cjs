"use strict";

// Capture startup failures that happen before index.js installs its own logger.
// No QR, session data or agent token are written to the bootstrap log.
try {
  require("./index.js");
} catch (error) {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const logDir = process.env.RIVERLUB_AGENT_LOG_DIR ||
    path.join(process.env.APPDATA || os.homedir(), "RiverLub", "whatsapp-agent", "logs");
  const safeMessage = String(error?.message || "Erro desconhecido")
    .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [oculto]")
    .replace(/(agent[_-]?token\s*[:=]\s*)[^\s,;]+/gi, "$1[oculto]")
    .replace(/data:image\/[^\s"'<>]+/gi, "[QR oculto]")
    .slice(0, 1000);
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, "agent.log"),
      JSON.stringify({
        ts: new Date().toISOString(),
        nivel: "error",
        mensagem: "Falha ao carregar o agente WhatsApp antes de abrir a porta local",
        extra: safeMessage,
      }) + "\n",
      "utf8"
    );
  } catch {
    // Do not expose local paths, tokens or stack traces elsewhere.
  }
  process.exitCode = 1;
}
