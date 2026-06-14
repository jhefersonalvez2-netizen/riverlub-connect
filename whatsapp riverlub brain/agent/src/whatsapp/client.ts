import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { Client, LocalAuth, type Message } from "whatsapp-web.js";
import { runAiActionOrchestrator } from "../ai/aiActionOrchestrator";
import { publishEvent } from "../events";
import { generateAutoReplyFromConversation } from "../llm/openai";
import {
  evaluateMessagePolicy,
  PolicyBlockedError,
  sendMessageWithPolicy
} from "../messages/messageGateway";
import { configureWhatsAppWebProvider } from "../providers/providerRegistry";
import { setOptOut } from "../policy/contactPolicyStore";
import {
  upsertConversationMessage,
  type ConversationRecord
} from "../storage/conversationStore";
import { addLog } from "../storage/logStore";
import { agentRoot } from "../storage/paths";
import {
  getEffectiveRuntimeSettings,
  isAutoReplyOpenMode,
  type RuntimeSettings
} from "../storage/runtimeSettingsStore";
import {
  getWhatsAppState,
  resetWhatsAppState,
  setWhatsAppError,
  setWhatsAppQr,
  setWhatsAppStatus
} from "./status";
import {
  isBroadcastChatId,
  isNewsletterChatId,
  isResolvedSenderAllowed,
  isStatusBroadcastChatId,
  resolveMessageSender,
  type ResolvedMessageSender
} from "./contactResolver";

let client: Client | null = null;
let startPromise: Promise<void> | null = null;
let stopInProgress = false;
let connectReadyAtMs: number | null = null;

const ignoredMessageCounters: Record<string, number> = {};
const localAuthPath = path.join(agentRoot, ".wwebjs_auth");

configureWhatsAppWebProvider({
  getClient: () => client,
  getStatus: () => {
    const state = getWhatsAppState();
    return {
      status: state.status,
      isReady: state.isReady,
      lastError: state.lastError
    };
  }
});

export function getWhatsAppDiagnostics() {
  return {
    clientExists: Boolean(client),
    clientInitializing: Boolean(startPromise),
    connectReadyAt: connectReadyAtMs ? new Date(connectReadyAtMs).toISOString() : null,
    ignoredMessages: { ...ignoredMessageCounters }
  };
}

export function getActiveWhatsAppClient() {
  return client;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeDestroyClient(target: Client | null, source: string) {
  if (!target) {
    return;
  }

  try {
    await target.destroy();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to destroy WhatsApp client.";
    await addLog(
      "warning",
      { source, error: errorMessage },
      "Cleanup seguro do client WhatsApp encontrou erro toleravel."
    );
  }
}

function isLogoutReason(reason: unknown) {
  return String(reason ?? "").toUpperCase().includes("LOGOUT");
}

function createClient() {
  let hadAuthFailure = false;
  const nextClient = new Client({
    authStrategy: new LocalAuth({
      dataPath: localAuthPath
    }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    }
  });

  nextClient.on("loading_screen", (percent: string, message: string) => {
    setWhatsAppStatus("initializing", {
      hasClient: true,
      isReady: false,
      lastEvent: `loading_screen:${percent}:${message}`
    });
  });

  nextClient.on("qr", async (qr) => {
    try {
      const qrDataUrl = await QRCode.toDataURL(qr, {
        margin: 1,
        width: 320
      });
      setWhatsAppQr(qr, qrDataUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to generate QR.";
      setWhatsAppError(errorMessage, "qr_error");
      publishEvent("error", { source: "whatsapp", error: errorMessage });
      void addLog(
        "error",
        { source: "whatsapp", error: errorMessage },
        "Falha ao gerar QR Code do WhatsApp."
      );
    }
  });

  nextClient.on("authenticated", () => {
    setWhatsAppStatus("authenticated", {
      hasClient: true,
      isReady: false,
      lastEvent: "authenticated"
    });
  });

  nextClient.on("auth_failure", (message) => {
    hadAuthFailure = true;
    const errorMessage = typeof message === "string" ? message : "WhatsApp auth failure.";
    startPromise = null;
    connectReadyAtMs = null;
    if (client === nextClient) {
      client = null;
    }

    void safeDestroyClient(nextClient, "auth_failure");
    setWhatsAppStatus("error", {
      hasClient: false,
      isReady: false,
      lastEvent: "auth_failure",
      lastError: errorMessage
    });
    publishEvent("error", { source: "whatsapp", error: errorMessage });
    void addLog(
      "error",
      { source: "whatsapp", error: errorMessage },
      "Falha de autenticacao do WhatsApp."
    );
  });

  nextClient.on("ready", () => {
    connectReadyAtMs = Date.now();
    setWhatsAppStatus("ready", {
      hasClient: true,
      isReady: true,
      lastEvent: "ready"
    });
  });

  nextClient.on("disconnected", (reason) => {
    void handleDisconnected(nextClient, reason, hadAuthFailure);
  });

  nextClient.on("message", (message) => {
    void handleIncomingMessage(message);
  });

  return nextClient;
}

async function handleDisconnected(
  disconnectedClient: Client,
  reason: unknown,
  hadAuthFailure: boolean
) {
  startPromise = null;
  connectReadyAtMs = null;

  if (client === disconnectedClient) {
    client = null;
  }

  if (hadAuthFailure || stopInProgress) {
    return;
  }

  const logout = isLogoutReason(reason);
  setWhatsAppStatus(logout ? "logged_out" : "disconnected", {
    hasClient: false,
    isReady: false,
    lastEvent: logout ? "logged_out" : "disconnected",
    lastError: logout
      ? "WhatsApp foi desconectado pelo celular. Use reset-session e gere novo QR."
      : reason
        ? `WhatsApp disconnected: ${String(reason)}`
        : null
  });

  await safeDestroyClient(disconnectedClient, "disconnected");
}

function getMessageId(message: Message) {
  return message.id?._serialized ?? null;
}

function getIgnoredReason(message: Message, settings: RuntimeSettings) {
  const from = message.from ?? "";
  const to = message.to ?? "";
  const author = message.author ?? "";
  const id = getMessageId(message) ?? "";
  const body = message.body ?? "";

  if (message.fromMe) {
    return "ignored_from_me";
  }

  if (
    isNewsletterChatId(from) ||
    isNewsletterChatId(to) ||
    isNewsletterChatId(author) ||
    from.includes("@newsletter") ||
    to.includes("@newsletter") ||
    author.includes("@newsletter") ||
    id.includes("@newsletter")
  ) {
    return "ignored_newsletter_channel";
  }

  if (
    from === "status@broadcast" ||
    to === "status@broadcast" ||
    isStatusBroadcastChatId(from) ||
    isStatusBroadcastChatId(to) ||
    isStatusBroadcastChatId(author) ||
    isStatusBroadcastChatId(id)
  ) {
    return "ignored_status_broadcast";
  }

  if (
    isBroadcastChatId(from) ||
    isBroadcastChatId(to) ||
    isBroadcastChatId(author) ||
    isBroadcastChatId(id)
  ) {
    return "ignored_broadcast";
  }

  if (from.endsWith("@g.us") && !settings.allowGroups) {
    return "ignored_group";
  }

  if (!body.trim()) {
    return "ignored_empty_body";
  }

  if (
    settings.ignoreOldMessagesOnStart &&
    connectReadyAtMs &&
    message.timestamp &&
    message.timestamp * 1000 < connectReadyAtMs - settings.oldMessageMaxAgeSeconds * 1000
  ) {
    return "ignored_old_message";
  }

  return null;
}

function ignoredHumanMessage(reason: string) {
  const messages: Record<string, string> = {
    ignored_not_in_allowlist: "Mensagem ignorada: contato fora da lista permitida.",
    ignored_global_pause: "Mensagem ignorada: IA pausada globalmente.",
    ignored_auto_reply_rate_limited:
      "Mensagem ignorada: limite de respostas automaticas atingido.",
    ignored_contact_ai_paused: "Mensagem ignorada: IA pausada para este contato.",
    ignored_human_takeover: "Mensagem ignorada: atendimento humano assumiu a conversa.",
    ignored_conversation_archived: "Mensagem ignorada: conversa arquivada.",
    ignored_opted_out: "Mensagem ignorada: contato opt-out.",
    ignored_provider_not_ready: "Mensagem ignorada: provider indisponivel.",
    ignored_outside_24h_window_template_required:
      "Mensagem ignorada: fora da janela de atendimento de 24h.",
    ignored_auto_reply_manual_mode: "Mensagem ignorada: modo manual ativo.",
    ignored_newsletter_channel: "Mensagem ignorada: canal/newsletter do WhatsApp.",
    ignored_non_private_chat: "Mensagem ignorada: chat nao privado.",
    ignored_group: "Mensagem ignorada: grupo bloqueado.",
    ignored_status_broadcast: "Mensagem ignorada: status do WhatsApp.",
    ignored_empty_body: "Mensagem ignorada: texto vazio."
  };

  return messages[reason] ?? `Mensagem ignorada: ${reason}.`;
}

async function recordIgnoredMessage(
  reason: string,
  message: Message,
  options: {
    sender?: ResolvedMessageSender;
    allowedNumbersCount?: number;
  } = {}
) {
  ignoredMessageCounters[reason] = (ignoredMessageCounters[reason] ?? 0) + 1;
  const count = ignoredMessageCounters[reason];

  if (count > 5 && count % 50 !== 0) {
    return;
  }

  await addLog(
    "message_ignored",
    {
      reason,
      count,
      id: getMessageId(message),
      from: options.sender?.rawFrom ?? message.from,
      to: message.to,
      rawAuthor: options.sender?.rawAuthor ?? message.author ?? null,
      isGroup: options.sender?.isGroup ?? message.from?.endsWith("@g.us") ?? false,
      isStatusBroadcast:
        options.sender?.isStatusBroadcast ?? isStatusBroadcastChatId(message.from),
      isNewsletter: options.sender?.isNewsletter ?? isNewsletterChatId(message.from),
      isBroadcast: options.sender?.isBroadcast ?? isBroadcastChatId(message.from),
      isPrivateChat: options.sender?.isPrivateChat ?? false,
      isLid: options.sender?.isLid ?? message.from?.endsWith("@lid") ?? false,
      resolvedPhoneDigits: options.sender?.phoneDigits ?? null,
      lidDigits: options.sender?.lidDigits ?? null,
      resolutionSource: options.sender?.resolutionSource ?? null,
      allowedNumbersCount: options.allowedNumbersCount,
      timestamp: message.timestamp
    },
    ignoredHumanMessage(reason)
  );
}

function getConversationContactId(sender: ResolvedMessageSender) {
  return sender.chatId || sender.rawFrom;
}

function conversationInputFromSender(
  sender: ResolvedMessageSender,
  message: Message,
  body: string
) {
  return {
    contactId: getConversationContactId(sender),
    chatId: sender.chatId || sender.rawFrom,
    phoneDigits: sender.phoneDigits,
    lid: sender.lid,
    displayName: sender.displayName,
    whatsappMessageId: getMessageId(message),
    direction: "inbound" as const,
    source: "whatsapp" as const,
    from: sender.rawFrom,
    to: message.to,
    body,
    timestamp: message.timestamp
      ? new Date(message.timestamp * 1000).toISOString()
      : new Date().toISOString()
  };
}

async function recordConversationInbound(sender: ResolvedMessageSender, message: Message) {
  const result = await upsertConversationMessage(
    conversationInputFromSender(sender, message, message.body.trim())
  );

  if (result.created) {
    publishEvent("conversation_created", result.summary);
    await addLog(
      "conversation_created",
      {
        contactId: result.summary.contactId,
        chatId: result.summary.chatId
      },
      "Nova conversa criada."
    );
  }

  publishEvent("conversation_message_received", {
    contact: result.summary,
    message: result.message
  });
  publishEvent("conversation_updated", result.summary);

  return result.conversation;
}

function optOutReasonFromMessage(body: string) {
  const normalized = body
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const optOutPatterns = [
    /\bpare\b/,
    /\bparar\b/,
    /\bnao quero\b/,
    /\bn quero\b/,
    /\bsair\b/,
    /\bcancelar mensagens\b/,
    /\bremover meu numero\b/
  ];

  return optOutPatterns.some((pattern) => pattern.test(normalized))
    ? "opt_out_keyword"
    : null;
}

function ignoredReasonFromPolicy(reason: string) {
  const map: Record<string, string> = {
    global_pause: "ignored_global_pause",
    contact_ai_paused: "ignored_contact_ai_paused",
    human_takeover: "ignored_human_takeover",
    conversation_archived: "ignored_conversation_archived",
    not_in_allowlist: "ignored_not_in_allowlist",
    rate_limited: "ignored_auto_reply_rate_limited",
    opted_out: "ignored_opted_out",
    provider_not_ready: "ignored_provider_not_ready",
    outside_24h_window_template_required: "ignored_outside_24h_window_template_required",
    auto_reply_manual_mode: "ignored_auto_reply_manual_mode",
    newsletter_channel_blocked: "ignored_newsletter_channel"
  };

  return map[reason] ?? `ignored_${reason}`;
}

async function handleIncomingMessage(message: Message) {
  const settings = await getEffectiveRuntimeSettings();
  const ignoredReason = getIgnoredReason(message, settings);

  if (ignoredReason) {
    await recordIgnoredMessage(ignoredReason, message);
    return;
  }

  const sender = await resolveMessageSender(message, client);

  if (!sender.isPrivateChat) {
    const reason = sender.isNewsletter
      ? "ignored_newsletter_channel"
      : sender.isStatusBroadcast
        ? "ignored_status_broadcast"
        : sender.isBroadcast
          ? "ignored_broadcast"
          : sender.isGroup
            ? "ignored_group"
            : "ignored_non_private_chat";
    await recordIgnoredMessage(reason, message, { sender });
    return;
  }

  const payload = {
    id: getMessageId(message),
    from: sender.rawFrom,
    to: message.to,
    rawAuthor: sender.rawAuthor,
    chatId: sender.chatId,
    resolvedPhoneDigits: sender.phoneDigits,
    lidDigits: sender.lidDigits,
    isLid: sender.isLid,
    resolutionSource: sender.resolutionSource,
    isGroup: sender.isGroup,
    isStatusBroadcast: sender.isStatusBroadcast,
    isNewsletter: sender.isNewsletter,
    isBroadcast: sender.isBroadcast,
    isPrivateChat: sender.isPrivateChat,
    displayName: sender.displayName,
    body: message.body.trim(),
    timestamp: message.timestamp
  };

  publishEvent("message_received", payload);
  await addLog("message_received", payload);
  const conversation = await recordConversationInbound(sender, message);

  const optOutReason = optOutReasonFromMessage(message.body);
  if (optOutReason) {
    await setOptOut(conversation.contactId, optOutReason);
    await addLog(
      "opt_out_detected",
      {
        contactId: conversation.contactId,
        from: sender.rawFrom,
        reason: optOutReason
      },
      "Opt-out detectado em mensagem recebida."
    );

    const policy = await evaluateMessagePolicy({
      to: conversation.chatId,
      text: "",
      source: "auto_reply",
      contactId: conversation.contactId,
      conversation,
      messageType: "session",
      allowlistAllowed: false
    });
    await recordIgnoredMessage(ignoredReasonFromPolicy(policy.decision.reason), message, {
      sender
    });
    return;
  }

  let allowlistAllowed = true;
  if (settings.autoReplyMode === "allowlist") {
    allowlistAllowed = isResolvedSenderAllowed(sender, settings).allowed;
  }

  const policy = await evaluateMessagePolicy({
    to: conversation.chatId,
    text: "",
    source: "auto_reply",
    contactId: conversation.contactId,
    conversation,
    messageType: "session",
    allowlistAllowed
  });

  if (!policy.decision.allowed) {
    if (policy.decision.reason === "auto_reply_manual_mode") {
      return;
    }

    await recordIgnoredMessage(ignoredReasonFromPolicy(policy.decision.reason), message, {
      sender,
      allowedNumbersCount: settings.autoReplyAllowedNumbers.length
    });
    return;
  }

  try {
    const actionResult = await runAiActionOrchestrator({
      conversation,
      latestMessage: message.body
    });
    const generated = actionResult.responseOverride
      ? {
          reply: actionResult.responseOverride,
          contextMessagesCount: conversation.messages.slice(-15).length,
          basedOnMessageId: conversation.messages.at(-1)?.id ?? null
        }
      : await generateAutoReplyFromConversation(
          conversation,
          message.body,
          actionResult.actionContext ?? []
        );
    const reply = generated.reply;
    publishEvent("llm_response", {
      source: "auto_reply",
      autoReplyMode: settings.autoReplyMode,
      from: sender.rawFrom,
      resolvedPhoneDigits: sender.phoneDigits,
      lidDigits: sender.lidDigits,
      isLid: sender.isLid,
      contextMessagesCount: generated.contextMessagesCount,
      basedOnMessageId: generated.basedOnMessageId,
      input: message.body,
      reply
    });
    await addLog("llm_response", {
      source: "auto_reply",
      autoReplyMode: settings.autoReplyMode,
      from: sender.rawFrom,
      resolvedPhoneDigits: sender.phoneDigits,
      lidDigits: sender.lidDigits,
      isLid: sender.isLid,
      contextMessagesCount: generated.contextMessagesCount,
      basedOnMessageId: generated.basedOnMessageId,
      input: message.body,
      reply
    });

    await sendMessageWithPolicy({
      to: conversation.chatId,
      text: reply,
      source: "auto_reply",
      contactId: conversation.contactId,
      conversation,
      messageType: "session",
      allowlistAllowed,
      policyDecision: policy.decision
    });
  } catch (error) {
    if (error instanceof PolicyBlockedError) {
      await recordIgnoredMessage(ignoredReasonFromPolicy(error.decision.reason), message, {
        sender
      });
      return;
    }

    const errorMessage = error instanceof Error ? error.message : "Auto reply failed.";
    publishEvent("error", { source: "auto_reply", error: errorMessage });
    await addLog(
      "error",
      { source: "auto_reply", error: errorMessage },
      "Falha ao gerar ou enviar resposta automatica."
    );
  }
}

export function normalizeBrazilianPhoneNumber(value: string) {
  const digitsOnly = value.replace(/\D/g, "");

  if (!digitsOnly) {
    throw new Error("Telefone vazio. Informe DDD + numero ou 55 + DDD + numero.");
  }

  let digits = digitsOnly;

  if (digits.startsWith("55")) {
    const nationalNumber = digits.slice(2);
    if (nationalNumber.length !== 10 && nationalNumber.length !== 11) {
      throw new Error(
        "Telefone brasileiro invalido. Use 55 + DDD + numero com 10 ou 11 digitos nacionais."
      );
    }
  } else if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  } else if (digits.length < 10) {
    throw new Error("Telefone curto demais. Informe pelo menos DDD + numero.");
  } else {
    throw new Error(
      "Telefone invalido para envio local. Use formato brasileiro, por exemplo +55 (87) 99999-9999."
    );
  }

  return `${digits}@c.us`;
}

export async function startWhatsAppClient() {
  const currentState = getWhatsAppState();
  const isAlreadyStarting =
    client &&
    ["initializing", "waiting_qr", "qr_available", "authenticated"].includes(
      currentState.status
    );

  if (client && currentState.isReady) {
    return {
      ok: true,
      reason: "already_ready",
      status: currentState.status,
      message: "WhatsApp is already connected."
    };
  }

  if (startPromise || isAlreadyStarting) {
    return {
      ok: true,
      reason: "already_initializing",
      status: currentState.status,
      message: "WhatsApp client is already initializing or waiting for QR."
    };
  }

  if (client) {
    const staleClient = client;
    client = null;
    await safeDestroyClient(staleClient, "start_cleanup");
    await delay(500);
  }

  const nextClient = createClient();
  client = nextClient;
  setWhatsAppStatus("initializing", {
    hasClient: true,
    isReady: false,
    lastEvent: "initialize_requested"
  });

  startPromise = nextClient
    .initialize()
    .then(() => {
      const state = getWhatsAppState();
      if (!state.isReady && state.status === "initializing") {
        setWhatsAppStatus("waiting_qr", {
          hasClient: true,
          isReady: false,
          lastEvent: "initialize_completed_waiting_qr"
        });
      }
    })
    .catch(async (error) => {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to initialize WhatsApp client.";
      if (client === nextClient) {
        client = null;
      }
      connectReadyAtMs = null;
      await safeDestroyClient(nextClient, "initialize_failed");
      setWhatsAppError(errorMessage, "initialize_failed");
      publishEvent("error", { source: "whatsapp", error: errorMessage });
      await addLog("error", { source: "whatsapp", error: errorMessage });
    })
    .finally(() => {
      startPromise = null;
    });

  const settings = await getEffectiveRuntimeSettings();
  if (isAutoReplyOpenMode(settings)) {
    await addLog(
      "warning",
      { source: "start", autoReplyMode: settings.autoReplyMode },
      "Modo aberto de resposta automatica esta ativo."
    );
  }

  return {
    ok: true,
    reason: "started",
    status: "initializing",
    message: "WhatsApp initialization started. Watch /whatsapp/qr or /events for the QR code."
  };
}

export async function stopWhatsAppClient() {
  const currentClient = client;
  stopInProgress = true;
  client = null;
  startPromise = null;
  connectReadyAtMs = null;

  if (!currentClient) {
    resetWhatsAppState("stopped", "stop_requested_without_client");
    stopInProgress = false;
    return {
      ok: true,
      reason: "not_running",
      status: "stopped",
      message: "WhatsApp client was not running."
    };
  }

  await safeDestroyClient(currentClient, "stop");
  resetWhatsAppState("stopped", "destroyed");
  stopInProgress = false;

  return {
    ok: true,
    reason: "stopped",
    status: "stopped",
    message: "WhatsApp client stopped."
  };
}

export async function resetWhatsAppSession() {
  await stopWhatsAppClient();
  await fs.rm(localAuthPath, { recursive: true, force: true });
  resetWhatsAppState("stopped", "session_reset");

  return {
    ok: true,
    status: "stopped",
    message:
      "Sessao local do WhatsApp removida. Chame /whatsapp/start para gerar um novo QR."
  };
}

export async function sendWhatsAppText(to: string, message: string) {
  const body = message.trim();
  const normalizedDigits = to.replace(/\D/g, "");

  await addLog(
    "send_attempt",
    {
      toInput: to,
      normalizedDigits,
      messageLength: body.length
    },
    "Tentativa de envio manual pelo endpoint /whatsapp/send."
  );

  let chatId: string;

  try {
    chatId = normalizeBrazilianPhoneNumber(to);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Telefone invalido.";
    await addLog(
      "error",
      { source: "whatsapp_send", toInput: to, normalizedDigits, error: errorMessage },
      "Envio manual rejeitado por telefone invalido."
    );
    throw error;
  }

  if (!body) {
    await addLog(
      "error",
      { source: "whatsapp_send", to: chatId, error: "message_required" },
      "Envio manual rejeitado por mensagem vazia."
    );
    throw new Error("Message is required.");
  }

  const result = await sendMessageWithPolicy({
    to: chatId,
    text: body,
    source: "manual",
    contactId: chatId,
    messageType: "manual",
    markRead: true
  });
  const payload = {
    source: "manual_endpoint",
    to: chatId,
    message: body,
    id: result.providerResult.messageId,
    policyDecisionId: result.policyDecision.id
  };

  return payload;
}
