import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { PolicyBlockedError } from "../messages/messageGateway";
import {
  resetWhatsAppSession,
  sendWhatsAppText,
  startWhatsAppClient,
  stopWhatsAppClient
} from "../whatsapp/client";
import {
  getWhatsAppState,
  SUPPORTED_WHATSAPP_STATUSES
} from "../whatsapp/status";

export const whatsappRouter = Router();

const sendSchema = z.object({
  to: z.string().min(10),
  message: z.string().trim().min(1)
});

whatsappRouter.get("/status", (_request, response) => {
  response.json({
    ok: true,
    supported_statuses: SUPPORTED_WHATSAPP_STATUSES,
    whatsapp: getWhatsAppState()
  });
});

whatsappRouter.get("/qr", (_request, response) => {
  const state = getWhatsAppState();

  if (!state.qr) {
    response.json({
      ok: true,
      status: state.status,
      qr_text: null,
      qr_data_url: null,
      updated_at: null,
      expires_at: null,
      message: state.isReady
        ? "WhatsApp is connected. QR is no longer needed."
        : "No QR code is available yet. Start the WhatsApp client and wait for qr_available."
    });
    return;
  }

  response.json({
    ok: true,
    status: state.status,
    ...state.qr
  });
});

whatsappRouter.post("/start", requireAuth, async (_request, response, next) => {
  try {
    response.json(await startWhatsAppClient());
  } catch (error) {
    next(error);
  }
});

whatsappRouter.post("/stop", requireAuth, async (_request, response, next) => {
  try {
    response.json(await stopWhatsAppClient());
  } catch (error) {
    next(error);
  }
});

whatsappRouter.post("/reset-session", requireAuth, async (_request, response, next) => {
  try {
    response.json(await resetWhatsAppSession());
  } catch (error) {
    next(error);
  }
});

whatsappRouter.post("/send", requireAuth, async (request, response, next) => {
  try {
    const parsed = sendSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: parsed.error.flatten()
      });
      return;
    }

    const result = await sendWhatsAppText(parsed.data.to, parsed.data.message);
    response.json({
      ok: true,
      result
    });
  } catch (error) {
    if (error instanceof PolicyBlockedError) {
      response.status(409).json({
        ok: false,
        error: error.message,
        policyDecision: error.decision
      });
      return;
    }

    if (error instanceof Error) {
      const isBadRequest =
        error.message.includes("Telefone") ||
        error.message.includes("phone") ||
        error.message.includes("Message is required");
      const isNotReady = error.message.includes("WhatsApp is not ready");

      if (isBadRequest || isNotReady) {
        response.status(isBadRequest ? 400 : 409).json({
          ok: false,
          error: error.message
        });
        return;
      }
    }

    next(error);
  }
});
