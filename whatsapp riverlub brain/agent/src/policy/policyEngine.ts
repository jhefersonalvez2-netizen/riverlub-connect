import { randomUUID } from "node:crypto";
import type { PolicyDecision, PolicyInput, PolicyReason } from "./types";

function createDecision(
  allowed: boolean,
  reason: PolicyReason,
  severity: PolicyDecision["severity"],
  details?: Record<string, unknown>,
  now = new Date().toISOString()
): PolicyDecision {
  return {
    id: randomUUID(),
    allowed,
    reason,
    severity,
    details,
    createdAt: now
  };
}

function isAutoSource(source: PolicyInput["source"]) {
  return source === "auto_reply" || source === "system_job";
}

function isManualSource(source: PolicyInput["source"]) {
  return source === "manual" || source === "conversation_manual";
}

function isNonManualOutbound(source: PolicyInput["source"]) {
  return !isManualSource(source);
}

function isWithin24h(lastInboundAt: string | null | undefined, nowIso: string) {
  if (!lastInboundAt) {
    return false;
  }

  const lastInboundMs = Date.parse(lastInboundAt);
  const nowMs = Date.parse(nowIso);

  if (!Number.isFinite(lastInboundMs) || !Number.isFinite(nowMs)) {
    return false;
  }

  return nowMs - lastInboundMs <= 24 * 60 * 60 * 1000;
}

function isNewsletterChannelId(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().endsWith("@newsletter");
}

export function evaluateSendPolicy(input: PolicyInput): PolicyDecision {
  const now = input.now ?? new Date().toISOString();

  if (
    isNewsletterChannelId(input.contactId) ||
    isNewsletterChannelId(input.chatId) ||
    isNewsletterChannelId(input.conversation?.contactId) ||
    isNewsletterChannelId(input.conversation?.chatId)
  ) {
    return createDecision(false, "newsletter_channel_blocked", "block", {
      contactId: input.contactId,
      chatId: input.chatId
    }, now);
  }

  if (!input.providerStatus?.isReady) {
    return createDecision(false, "provider_not_ready", "block", {
      provider: input.providerStatus?.provider,
      status: input.providerStatus?.status
    }, now);
  }

  if (input.settings?.globalPause && isAutoSource(input.source)) {
    return createDecision(false, "global_pause", "block", undefined, now);
  }

  if (input.conversation?.status === "archived" && isNonManualOutbound(input.source)) {
    return createDecision(false, "conversation_archived", "block", undefined, now);
  }

  if (input.conversation?.humanTakeover && input.source === "auto_reply") {
    return createDecision(false, "human_takeover", "block", undefined, now);
  }

  if (input.conversation?.aiPaused && input.source === "auto_reply") {
    return createDecision(false, "contact_ai_paused", "block", undefined, now);
  }

  if (input.contactPolicy?.optOut && isNonManualOutbound(input.source)) {
    return createDecision(false, "opted_out", "block", {
      optOutAt: input.contactPolicy.optOutAt,
      optOutReason: input.contactPolicy.optOutReason
    }, now);
  }

  if (input.source === "internal_notification") {
    return createDecision(
      Boolean(input.internalNotificationAllowed),
      "internal_notification_allowed",
      input.internalNotificationAllowed ? "allow" : "block",
      {
        internalNotificationAllowed: Boolean(input.internalNotificationAllowed)
      },
      now
    );
  }

  if (input.source === "auto_reply") {
    if (input.settings?.autoReplyMode === "manual") {
      return createDecision(false, "auto_reply_manual_mode", "block", undefined, now);
    }

    if (input.settings?.autoReplyMode === "allowlist" && !input.allowlistAllowed) {
      return createDecision(false, "not_in_allowlist", "block", undefined, now);
    }

    if (input.rateLimited) {
      return createDecision(false, "rate_limited", "block", undefined, now);
    }
  }

  const inside24h = isWithin24h(input.conversation?.lastInboundAt, now);

  if (input.messageType === "template") {
    return createDecision(Boolean(input.templateEnabled), "template_allowed", input.templateEnabled ? "allow" : "block", {
      inside24h,
      templateEnabled: input.templateEnabled
    }, now);
  }

  if (!inside24h && input.source !== "manual" && input.source !== "conversation_manual") {
    return createDecision(false, "outside_24h_window_template_required", "block", {
      lastInboundAt: input.conversation?.lastInboundAt ?? null
    }, now);
  }

  if (!inside24h && isManualSource(input.source)) {
    return createDecision(true, "outside_24h_window_manual_warning", "warn", {
      lastInboundAt: input.conversation?.lastInboundAt ?? null
    }, now);
  }

  if (input.source === "auto_reply") {
    return createDecision(true, "auto_reply_allowed", "allow", {
      inside24h
    }, now);
  }

  if (isManualSource(input.source)) {
    return createDecision(true, "manual_send_allowed", "allow", {
      inside24h,
      optedOut: Boolean(input.contactPolicy?.optOut)
    }, now);
  }

  return createDecision(true, "inside_24h_customer_service_window", "allow", {
    inside24h
  }, now);
}
