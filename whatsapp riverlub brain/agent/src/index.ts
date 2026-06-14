import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { requireAuth } from "./auth";
import { env } from "./env";
import { registerSseClient } from "./events";
import { ensurePromptStore } from "./llm/promptStore";
import { contactsRouter } from "./routes/contacts";
import { conversationsRouter } from "./routes/conversations";
import { debugRouter } from "./routes/debug";
import { healthRouter } from "./routes/health";
import { jobsRouter } from "./routes/jobs";
import { logsRouter } from "./routes/logs";
import { promptRouter } from "./routes/prompt";
import { settingsRouter } from "./routes/settings";
import { testRouter } from "./routes/test";
import { messagesRouter } from "./routes/messages";
import { templatesRouter } from "./routes/templates";
import { whatsappRouter } from "./routes/whatsapp";
import { ensureContactPolicyStore } from "./policy/contactPolicyStore";
import { ensureTemplateStore } from "./policy/templateStore";
import { ensureContactMapStore } from "./storage/contactMapStore";
import { ensureConversationStore } from "./storage/conversationStore";
import { addLog, ensureLogStore } from "./storage/logStore";
import {
  ensureRuntimeSettingsStore,
  getEffectiveRuntimeSettings,
  isAutoReplyOpenMode
} from "./storage/runtimeSettingsStore";

async function bootstrap() {
  await ensurePromptStore();
  await ensureLogStore();
  await ensureRuntimeSettingsStore();
  await ensureContactMapStore();
  await ensureConversationStore();
  await ensureContactPolicyStore();
  await ensureTemplateStore();

  const runtimeSettings = await getEffectiveRuntimeSettings();
  if (isAutoReplyOpenMode(runtimeSettings)) {
    await addLog(
      "warning",
      {
        source: "startup",
        autoReplyMode: runtimeSettings.autoReplyMode
      },
      "Modo aberto de resposta automatica esta ativo."
    );
  }

  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || origin === env.frontendOrigin) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin ${origin} is not allowed by FRONTEND_ORIGIN.`));
      }
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/events", requireAuth, (request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const unregister = registerSseClient(response);
    const heartbeat = setInterval(() => {
      response.write(": heartbeat\n\n");
    }, 25_000);

    request.on("close", () => {
      clearInterval(heartbeat);
      unregister();
    });
  });

  app.use("/health", healthRouter);
  app.use("/debug", debugRouter);
  app.use("/settings", settingsRouter);
  app.use("/contacts", contactsRouter);
  app.use("/conversations", conversationsRouter);
  app.use("/jobs", jobsRouter);
  app.use("/messages", messagesRouter);
  app.use("/templates", templatesRouter);
  app.use("/whatsapp", whatsappRouter);
  app.use("/prompt", promptRouter);
  app.use("/logs", logsRouter);
  app.use("/test", testRouter);

  app.use((_request, response) => {
    response.status(404).json({
      ok: false,
      error: "Route not found."
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    response.status(500).json({
      ok: false,
      error: message
    });
  };

  app.use(errorHandler);

  app.listen(env.port, () => {
    console.log(`riverlub-whatsapp-brain-agent listening on http://localhost:${env.port}`);
  });
}

void bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
