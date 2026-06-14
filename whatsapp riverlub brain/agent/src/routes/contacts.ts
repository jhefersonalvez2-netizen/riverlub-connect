import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import {
  getContactPolicy,
  setOptIn,
  setOptOut,
  updateContactPolicy
} from "../policy/contactPolicyStore";
import { addLog } from "../storage/logStore";
import { getActiveWhatsAppClient } from "../whatsapp/client";
import { resolveChatIdForDebug } from "../whatsapp/contactResolver";

export const contactsRouter = Router();

const policyUpdateSchema = z
  .object({
    optIn: z.boolean().optional(),
    optOut: z.boolean().optional(),
    notes: z.string().max(1000).optional()
  })
  .strict();

const optOutSchema = z.object({
  reason: z.string().trim().max(500).optional()
});

contactsRouter.get("/resolve/:chatId", requireAuth, async (request, response, next) => {
  try {
    const result = await resolveChatIdForDebug(
      request.params.chatId,
      getActiveWhatsAppClient()
    );
    response.json({
      ok: true,
      ...result
    });
  } catch (error) {
    if (error instanceof Error) {
      response.status(404).json({
        ok: false,
        error: error.message
      });
      return;
    }

    next(error);
  }
});

contactsRouter.get("/:contactId/policy", requireAuth, async (request, response, next) => {
  try {
    response.json({
      ok: true,
      policy: await getContactPolicy(request.params.contactId)
    });
  } catch (error) {
    next(error);
  }
});

contactsRouter.put("/:contactId/policy", requireAuth, async (request, response, next) => {
  try {
    const parsed = policyUpdateSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }

    const policy = await updateContactPolicy(request.params.contactId, parsed.data);
    await addLog("opt_in_updated", {
      contactId: request.params.contactId,
      optIn: policy.optIn,
      optOut: policy.optOut
    });
    response.json({ ok: true, policy });
  } catch (error) {
    next(error);
  }
});

contactsRouter.post("/:contactId/opt-out", requireAuth, async (request, response, next) => {
  try {
    const parsed = optOutSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }

    const policy = await setOptOut(request.params.contactId, parsed.data.reason);
    await addLog("opt_out_detected", {
      source: "manual_endpoint",
      contactId: request.params.contactId,
      reason: parsed.data.reason ?? null
    });
    response.json({ ok: true, policy });
  } catch (error) {
    next(error);
  }
});

contactsRouter.post("/:contactId/opt-in", requireAuth, async (request, response, next) => {
  try {
    const policy = await setOptIn(request.params.contactId);
    await addLog("opt_in_updated", {
      source: "manual_endpoint",
      contactId: request.params.contactId
    });
    response.json({ ok: true, policy });
  } catch (error) {
    next(error);
  }
});
