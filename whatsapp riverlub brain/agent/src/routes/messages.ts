import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import {
  PolicyBlockedError,
  sendMessageWithPolicy
} from "../messages/messageGateway";
import { getTemplate, renderTemplate } from "../policy/templateStore";
import { addLog } from "../storage/logStore";
import { normalizeBrazilianPhoneNumber } from "../whatsapp/client";

export const messagesRouter = Router();

const templateMessageSchema = z
  .object({
    to: z.string().trim().min(3),
    templateName: z.string().trim().min(1),
    variables: z.record(z.unknown()).default({})
  })
  .strict();

function normalizeTemplateDestination(to: string) {
  const normalized = to.trim().toLowerCase();

  if (normalized.includes("@")) {
    return normalized.replace(/\s/g, "");
  }

  return normalizeBrazilianPhoneNumber(normalized);
}

messagesRouter.post("/template", requireAuth, async (request, response, next) => {
  try {
    const parsed = templateMessageSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }

    const template = await getTemplate(parsed.data.templateName);

    if (!template || !template.enabled || template.status !== "approved_internal") {
      await addLog("template_blocked", {
        templateName: parsed.data.templateName,
        reason: "template_not_enabled_or_not_approved_internal"
      });
      response.status(404).json({
        ok: false,
        error: "Template nao encontrado, desativado ou nao aprovado internamente."
      });
      return;
    }

    const to = normalizeTemplateDestination(parsed.data.to);
    const text = renderTemplate(template.text, parsed.data.variables);

    if (!text.trim()) {
      response.status(400).json({
        ok: false,
        error: "Template renderizado ficou vazio. Confira variaveis e texto."
      });
      return;
    }

    const result = await sendMessageWithPolicy({
      to,
      text,
      source: "template",
      contactId: to,
      messageType: "template",
      templateEnabled: true,
      markRead: true
    });

    response.json({
      ok: true,
      template,
      renderedText: text,
      policyDecision: result.policyDecision,
      providerResult: result.providerResult,
      contact: result.conversationResult?.summary,
      message: result.conversationResult?.message
    });
  } catch (error) {
    if (error instanceof PolicyBlockedError) {
      await addLog("template_blocked", {
        reason: error.decision.reason,
        policyDecisionId: error.decision.id
      });
      response.status(409).json({
        ok: false,
        error: error.message,
        policyDecision: error.decision
      });
      return;
    }

    if (error instanceof Error && error.message.includes("Telefone")) {
      response.status(400).json({ ok: false, error: error.message });
      return;
    }

    next(error);
  }
});
