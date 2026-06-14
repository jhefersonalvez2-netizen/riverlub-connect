import { Router } from "express";
import { getWhatsAppState } from "../whatsapp/status";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  const whatsapp = getWhatsAppState();

  response.json({
    ok: true,
    service: "riverlub-whatsapp-brain-agent",
    uptime: process.uptime(),
    whatsapp: {
      status: whatsapp.status,
      hasClient: whatsapp.hasClient,
      isReady: whatsapp.isReady,
      lastEvent: whatsapp.lastEvent,
      lastError: whatsapp.lastError
    }
  });
});
