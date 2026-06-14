import { publishEvent } from "../events";
import { getActiveProvider } from "../providers/providerRegistry";
import type { SendMessageResult } from "../providers/types";
import {
  getContactPolicy,
  markPolicyDecision
} from "../policy/contactPolicyStore";
import { evaluateSendPolicy } from "../policy/policyEngine";
import {
  isAutoReplyRateLimited,
  recordAutoReplySent
} from "../policy/ratePolicy";
import type { PolicyDecision, PolicyMessageType, PolicySource } from "../policy/types";
import {
  getConversation,
  upsertConversationMessage,
  type ConversationRecord
} from "../storage/conversationStore";
import { addLog } from "../storage/logStore";
import { getEffectiveRuntimeSettings } from "../storage/runtimeSettingsStore";

export class PolicyBlockedError extends Error {
  constructor(public readonly decision: PolicyDecision) {
    super(`Send blocked by policy: ${decision.reason}`);
    this.name = "PolicyBlockedError";
  }
}

export interface SendMessageWithPolicyInput {
  to: string;
  text: string;
  source: PolicySource;
  contactId?: string;
  conversationId?: string;
  conversation?: ConversationRecord | null;
  messageType?: PolicyMessageType;
  allowlistAllowed?: boolean;
  templateEnabled?: boolean;
  internalNotificationAllowed?: boolean;
  policyDecision?: PolicyDecision;
  saveToConversation?: boolean;
  markRead?: boolean;
}

function sourceToConversationSource(source: PolicySource) {
  if (source === "auto_reply") {
    return "auto_reply";
  }

  if (source === "template") {
    return "template";
  }

  return "manual";
}

function policyLogPayload(input: SendMessageWithPolicyInput, decision: PolicyDecision) {
  return {
    id: decision.id,
    allowed: decision.allowed,
    reason: decision.reason,
    severity: decision.severity,
    source: input.source,
    messageType: input.messageType ?? "session",
    contactId: input.contactId,
    to: input.to,
    details: decision.details
  };
}

async function getPolicyContext(input: SendMessageWithPolicyInput) {
  const provider = getActiveProvider();
  const [providerStatus, settings] = await Promise.all([
    provider.getStatus(),
    getEffectiveRuntimeSettings()
  ]);
  const contactId = input.contactId ?? input.conversation?.contactId ?? input.to;
  const conversation =
    input.conversation ?? (await getConversation(contactId)) ?? null;
  const contactPolicy = await getContactPolicy(contactId);
  const rateLimited =
    input.source === "auto_reply"
      ? isAutoReplyRateLimited(contactId, settings.maxAutoRepliesPerContactPerHour)
      : false;

  return {
    provider,
    providerStatus,
    settings,
    contactId,
    conversation,
    contactPolicy,
    rateLimited
  };
}

export async function evaluateMessagePolicy(input: SendMessageWithPolicyInput) {
  const context = await getPolicyContext(input);
  const decision = evaluateSendPolicy({
    contactId: context.contactId,
    chatId: input.to,
    direction: "outbound",
    source: input.source,
    messageType: input.messageType ?? (input.source === "template" ? "template" : "session"),
    text: input.text,
    conversation: context.conversation,
    settings: context.settings,
    contactPolicy: context.contactPolicy,
    providerStatus: context.providerStatus,
    allowlistAllowed: input.allowlistAllowed,
    rateLimited: context.rateLimited,
    templateEnabled: input.templateEnabled,
    internalNotificationAllowed: input.internalNotificationAllowed
  });

  await addLog("policy_decision", policyLogPayload(input, decision));
  await markPolicyDecision(context.contactId, decision.createdAt);

  if (!decision.allowed) {
    await addLog("policy_blocked", policyLogPayload(input, decision));
  }

  return {
    ...context,
    decision
  };
}

export async function sendMessageWithPolicy(input: SendMessageWithPolicyInput) {
  const context = input.policyDecision
    ? await getPolicyContext(input).then((loadedContext) => ({
        ...loadedContext,
        decision: input.policyDecision as PolicyDecision
      }))
    : await evaluateMessagePolicy(input);

  if (!context.decision.allowed) {
    throw new PolicyBlockedError(context.decision);
  }

  const sendResult: SendMessageResult = await context.provider.sendText({
    to: input.to,
    text: input.text,
    metadata: {
      source: input.source,
      contactId: context.contactId,
      conversationId: input.conversationId,
      policyDecisionId: context.decision.id
    }
  });

  await addLog("provider_send_result", {
    ok: sendResult.ok,
    provider: sendResult.provider,
    to: sendResult.to,
    messageId: sendResult.messageId,
    error: sendResult.error,
    policyDecisionId: context.decision.id
  });

  if (!sendResult.ok) {
    throw new Error(sendResult.error || "Provider failed to send message.");
  }

  const shouldSave = input.saveToConversation !== false;
  let conversationResult: Awaited<ReturnType<typeof upsertConversationMessage>> | null = null;

  if (shouldSave) {
    const conversation = context.conversation;
    conversationResult = await upsertConversationMessage({
      contactId: context.contactId,
      chatId: conversation?.chatId ?? input.to,
      phoneDigits: conversation?.phoneDigits ?? (input.to.includes("@lid") ? null : input.to.replace(/\D/g, "")),
      lid: conversation?.lid ?? (input.to.endsWith("@lid") ? input.to : null),
      displayName: conversation?.displayName ?? null,
      whatsappMessageId: sendResult.messageId ?? null,
      direction: "outbound",
      source: sourceToConversationSource(input.source),
      from: input.source === "auto_reply" ? "bot" : "human",
      to: input.to,
      body: input.text,
      isAutoReply: input.source === "auto_reply",
      isManual: input.source !== "auto_reply",
      policyReason: context.decision.reason,
      markRead: input.markRead
    });

    if (conversationResult.created) {
      publishEvent("conversation_created", conversationResult.summary);
    }

    publishEvent("conversation_message_sent", {
      contact: conversationResult.summary,
      message: conversationResult.message
    });
    publishEvent("conversation_updated", conversationResult.summary);
  }

  const sentPayload = {
    source: input.source,
    to: input.to,
    message: input.text,
    id: sendResult.messageId,
    policyDecisionId: context.decision.id
  };
  publishEvent("message_sent", sentPayload);
  await addLog("message_sent", sentPayload);

  if (input.source === "auto_reply") {
    recordAutoReplySent(context.contactId);
    await addLog(
      "auto_reply_sent",
      {
        source: "auto_reply",
        to: input.to,
        id: sendResult.messageId,
        policyDecisionId: context.decision.id
      },
      "Resposta automatica enviada."
    );
  }

  if (input.source === "conversation_manual") {
    await addLog(
      "manual_conversation_message_sent",
      {
        contactId: context.contactId,
        to: input.to,
        id: sendResult.messageId,
        policyDecisionId: context.decision.id
      },
      "Mensagem manual enviada pela tela Atendimento."
    );
  }

  if (input.source === "template") {
    await addLog(
      "template_sent",
      {
        contactId: context.contactId,
        to: input.to,
        id: sendResult.messageId,
        policyDecisionId: context.decision.id
      },
      "Template interno enviado."
    );
  }

  if (input.source === "internal_notification") {
    await addLog(
      "reception_notification_sent",
      {
        to: input.to,
        id: sendResult.messageId,
        policyDecisionId: context.decision.id
      },
      "Notificacao interna enviada."
    );
  }

  return {
    ok: true,
    providerResult: sendResult,
    policyDecision: context.decision,
    conversationResult
  };
}
