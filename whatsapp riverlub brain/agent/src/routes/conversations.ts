import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { publishEvent } from "../events";
import { generateConversationSuggestion, LlmError } from "../llm/openai";
import { PolicyBlockedError, sendMessageWithPolicy } from "../messages/messageGateway";
import {
  clearConversationDraft,
  getConversation,
  listConversationSummaries,
  markConversationRead,
  saveConversationDraftSuggestion,
  serializeConversation,
  setConversationAiPaused,
  setConversationHumanTakeover,
  setConversationStatus
} from "../storage/conversationStore";
import { addLog } from "../storage/logStore";

export const conversationsRouter = Router();

const listQuerySchema = z.object({
  includeArchived: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1")
});

const suggestSchema = z.object({
  extraInstruction: z.string().trim().max(800).optional()
});

const sendSchema = z.object({
  message: z.string().trim().min(1)
});

const enabledSchema = z.object({
  enabled: z.boolean()
});

const statusSchema = z.object({
  status: z.enum(["open", "resolved", "archived"])
});

async function getConversationOr404(contactId: string) {
  const conversation = await getConversation(contactId);

  if (!conversation) {
    const error = new Error("Conversa nao encontrada.");
    error.name = "NotFoundError";
    throw error;
  }

  return conversation;
}

function publishConversationUpdated(
  eventType:
    | "conversation_updated"
    | "conversation_read"
    | "conversation_ai_paused"
    | "conversation_human_takeover",
  summary: unknown
) {
  publishEvent(eventType, summary);
  publishEvent("conversation_updated", summary);
}

function respondIfKnownError(error: unknown, response: Response) {
  if (error instanceof Error && error.name === "NotFoundError") {
    response.status(404).json({ ok: false, error: error.message });
    return true;
  }

  if (error instanceof Error && error.message.includes("WhatsApp is not ready")) {
    response.status(409).json({ ok: false, error: error.message });
    return true;
  }

  return false;
}

conversationsRouter.get("/", requireAuth, async (request, response, next) => {
  try {
    const parsed = listQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: parsed.error.flatten()
      });
      return;
    }

    response.json({
      ok: true,
      conversations: await listConversationSummaries(parsed.data.includeArchived)
    });
  } catch (error) {
    next(error);
  }
});

conversationsRouter.get("/:contactId", requireAuth, async (request, response, next) => {
  try {
    const conversation = await getConversationOr404(request.params.contactId);
    response.json({
      ok: true,
      ...serializeConversation(conversation)
    });
  } catch (error) {
    if (respondIfKnownError(error, response)) return;

    next(error);
  }
});

conversationsRouter.post("/:contactId/suggest", requireAuth, async (request, response, next) => {
  try {
    const parsed = suggestSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: parsed.error.flatten()
      });
      return;
    }

    const conversation = await getConversationOr404(request.params.contactId);
    const generated = await generateConversationSuggestion(
      conversation,
      parsed.data.extraInstruction
    );
    const result = await saveConversationDraftSuggestion({
      contactId: conversation.contactId,
      text: generated.suggestion,
      model: generated.model,
      basedOnMessageId: generated.basedOnMessageId
    });

    publishEvent("conversation_suggestion_created", {
      contact: result.summary,
      draftSuggestion: result.draftSuggestion
    });
    publishEvent("conversation_updated", result.summary);
    await addLog("llm_response", {
      source: "conversation_suggestion",
      contactId: conversation.contactId,
      reply: generated.suggestion
    });
    await addLog(
      "conversation_suggestion_created",
      {
        contactId: conversation.contactId,
        basedOnMessageId: generated.basedOnMessageId,
        model: generated.model
      },
      "Sugestao de resposta criada pela IA."
    );

    response.json({
      ok: true,
      suggestion: generated.suggestion,
      draftSuggestion: result.draftSuggestion
    });
  } catch (error) {
    if (error instanceof LlmError) {
      await addLog(
        "error",
        {
          source: "conversation_suggestion",
          statusCode: error.statusCode,
          error: error.message
        },
        "Falha ao gerar sugestao da conversa."
      );
      response.status(error.statusCode).json({
        ok: false,
        error: error.message,
        statusCode: error.statusCode
      });
      return;
    }

    if (respondIfKnownError(error, response)) return;

    next(error);
  }
});

conversationsRouter.post("/:contactId/send", requireAuth, async (request, response, next) => {
  try {
    const parsed = sendSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: parsed.error.flatten()
      });
      return;
    }

    const conversation = await getConversationOr404(request.params.contactId);
    const result = await sendMessageWithPolicy({
      to: conversation.chatId,
      text: parsed.data.message,
      source: "conversation_manual",
      contactId: conversation.contactId,
      conversation,
      messageType: "manual",
      markRead: true
    });
    const cleared = conversation.draftSuggestion
      ? await clearConversationDraft(conversation.contactId)
      : result.conversationResult;
    if (!cleared) {
      throw new Error("Mensagem enviada, mas a conversa nao foi atualizada.");
    }
    publishEvent("conversation_updated", cleared.summary);

    response.json({
      ok: true,
      message: result.conversationResult?.message,
      contact: cleared.summary
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

    if (respondIfKnownError(error, response)) return;

    next(error);
  }
});

conversationsRouter.post("/:contactId/read", requireAuth, async (request, response, next) => {
  try {
    const result = await markConversationRead(request.params.contactId);
    publishConversationUpdated("conversation_read", result.summary);
    response.json({ ok: true, contact: result.summary });
  } catch (error) {
    if (respondIfKnownError(error, response)) return;
    next(error);
  }
});

conversationsRouter.post(
  "/:contactId/clear-draft",
  requireAuth,
  async (request, response, next) => {
    try {
      const result = await clearConversationDraft(request.params.contactId);
      publishEvent("conversation_updated", result.summary);
      response.json({ ok: true, contact: result.summary });
    } catch (error) {
      if (respondIfKnownError(error, response)) return;
      next(error);
    }
  }
);

conversationsRouter.post(
  "/:contactId/human-takeover",
  requireAuth,
  async (request, response, next) => {
    try {
      const parsed = enabledSchema.safeParse(request.body);

      if (!parsed.success) {
        response.status(400).json({ ok: false, error: parsed.error.flatten() });
        return;
      }

      const result = await setConversationHumanTakeover(
        request.params.contactId,
        parsed.data.enabled
      );
      publishConversationUpdated("conversation_human_takeover", result.summary);
      await addLog("conversation_updated", {
        contactId: request.params.contactId,
        humanTakeover: parsed.data.enabled
      });
      response.json({ ok: true, contact: result.summary });
    } catch (error) {
      if (respondIfKnownError(error, response)) return;
      next(error);
    }
  }
);

conversationsRouter.post(
  "/:contactId/pause-ai",
  requireAuth,
  async (request, response, next) => {
    try {
      const parsed = enabledSchema.safeParse(request.body);

      if (!parsed.success) {
        response.status(400).json({ ok: false, error: parsed.error.flatten() });
        return;
      }

      const result = await setConversationAiPaused(
        request.params.contactId,
        parsed.data.enabled
      );
      publishConversationUpdated("conversation_ai_paused", result.summary);
      await addLog("conversation_updated", {
        contactId: request.params.contactId,
        aiPaused: parsed.data.enabled
      });
      response.json({ ok: true, contact: result.summary });
    } catch (error) {
      if (respondIfKnownError(error, response)) return;
      next(error);
    }
  }
);

conversationsRouter.post("/:contactId/status", requireAuth, async (request, response, next) => {
  try {
    const parsed = statusSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }

    const result = await setConversationStatus(request.params.contactId, parsed.data.status);
    publishEvent("conversation_updated", result.summary);
    await addLog("conversation_updated", {
      contactId: request.params.contactId,
      status: parsed.data.status
    });
    response.json({ ok: true, contact: result.summary });
  } catch (error) {
    if (respondIfKnownError(error, response)) return;
    next(error);
  }
});
