import type { Client, Contact, Message } from "whatsapp-web.js";
import {
  getContactMapEntry,
  upsertContactMapEntry,
  type ContactMapItem
} from "../storage/contactMapStore";
import type { RuntimeSettings } from "../storage/runtimeSettingsStore";

export type ContactResolutionSource =
  | "from"
  | "author"
  | "cache"
  | "getContact"
  | "getContactById"
  | "chat"
  | "fallback";

export interface ResolvedMessageSender {
  rawFrom: string;
  rawAuthor: string | null;
  chatId: string;
  phoneDigits: string | null;
  lidDigits: string | null;
  lid: string | null;
  isLid: boolean;
  isGroup: boolean;
  isStatusBroadcast: boolean;
  isNewsletter: boolean;
  isBroadcast: boolean;
  isPrivateChat: boolean;
  displayName: string | null;
  resolutionSource: ContactResolutionSource;
}

export interface SenderAllowCheck {
  allowed: boolean;
  reason: "allowed" | "ignored_not_in_allowlist";
  sender: ResolvedMessageSender;
  allowedNumbersCount: number;
}

interface ContactDetails {
  phoneDigits: string | null;
  displayName: string | null;
}

export function normalizeChatId(input: unknown) {
  return String(input ?? "").trim().toLowerCase();
}

export function digitsFromChatId(input: unknown) {
  return String(input ?? "").replace(/\D/g, "");
}

export function isLidChatId(input: string) {
  return normalizeChatId(input).endsWith("@lid");
}

export function isGroupChatId(input: string) {
  return normalizeChatId(input).endsWith("@g.us");
}

export function isNewsletterChatId(input: unknown) {
  return normalizeChatId(input).endsWith("@newsletter");
}

export function isStatusBroadcastChatId(input: unknown) {
  return normalizeChatId(input).includes("status@broadcast");
}

export function isBroadcastChatId(input: string) {
  const normalized = normalizeChatId(input);
  return normalized.includes("@broadcast") || isStatusBroadcastChatId(normalized);
}

export function isPrivateChatId(input: unknown) {
  const normalized = normalizeChatId(input);
  return (
    Boolean(normalized) &&
    !isGroupChatId(normalized) &&
    !isStatusBroadcastChatId(normalized) &&
    !isNewsletterChatId(normalized) &&
    !isBroadcastChatId(normalized)
  );
}

function displayNameFromContact(contact: Contact) {
  return (
    contact.name ||
    contact.pushname ||
    contact.verifiedName ||
    contact.shortName ||
    null
  );
}

async function detailsFromContact(contact: Contact): Promise<ContactDetails> {
  const serializedId = normalizeChatId(contact.id?._serialized);
  const serializedLidDigits = isLidChatId(serializedId)
    ? digitsFromChatId(serializedId)
    : "";
  let phoneDigits = digitsFromChatId(contact.number);

  if (serializedLidDigits && phoneDigits === serializedLidDigits) {
    phoneDigits = "";
  }

  if (
    !phoneDigits &&
    serializedId &&
    !isLidChatId(serializedId) &&
    !isGroupChatId(serializedId) &&
    !isNewsletterChatId(serializedId) &&
    !isBroadcastChatId(serializedId)
  ) {
    phoneDigits = digitsFromChatId(serializedId);
  }

  if (!phoneDigits) {
    try {
      phoneDigits = digitsFromChatId(await contact.getFormattedNumber());
      if (serializedLidDigits && phoneDigits === serializedLidDigits) {
        phoneDigits = "";
      }
    } catch {
      phoneDigits = "";
    }
  }

  return {
    phoneDigits: phoneDigits || null,
    displayName: displayNameFromContact(contact)
  };
}

function resultFromCache(
  base: Omit<ResolvedMessageSender, "phoneDigits" | "displayName" | "resolutionSource">,
  cached: ContactMapItem
): ResolvedMessageSender {
  return {
    ...base,
    phoneDigits: cached.phoneDigits,
    displayName: cached.displayName ?? null,
    resolutionSource: "cache"
  };
}

async function resultFromContact(
  base: Omit<ResolvedMessageSender, "phoneDigits" | "displayName" | "resolutionSource">,
  contact: Contact,
  source: ContactResolutionSource
) {
  const details = await detailsFromContact(contact);

  if (base.lid && details.phoneDigits) {
    await upsertContactMapEntry({
      lid: base.lid,
      phoneDigits: details.phoneDigits,
      displayName: details.displayName ?? undefined,
      source
    });
  }

  return {
    ...base,
    phoneDigits: details.phoneDigits,
    displayName: details.displayName,
    resolutionSource: source
  };
}

function normalizeAllowedValue(value: string) {
  const normalized = normalizeChatId(value);
  if (normalized.includes("@")) {
    return normalized;
  }

  return digitsFromChatId(normalized);
}

function addDigitsCandidates(candidates: Set<string>, digits: string | null) {
  if (!digits) {
    return;
  }

  candidates.add(digits);
  candidates.add(`${digits}@c.us`);

  if (digits.startsWith("55")) {
    candidates.add(digits.slice(2));
  } else if (digits.length === 10 || digits.length === 11) {
    candidates.add(`55${digits}`);
    candidates.add(`55${digits}@c.us`);
  }
}

function buildAllowlistCandidates(sender: ResolvedMessageSender) {
  const candidates = new Set<string>();
  const normalizedRawFrom = normalizeChatId(sender.rawFrom);
  const normalizedChatId = normalizeChatId(sender.chatId);
  const normalizedRawAuthor = sender.rawAuthor ? normalizeChatId(sender.rawAuthor) : "";

  candidates.add(normalizedRawFrom);
  candidates.add(normalizedChatId);

  if (sender.lid) {
    candidates.add(normalizeChatId(sender.lid));
  }

  if (normalizedRawAuthor) {
    candidates.add(normalizedRawAuthor);
    addDigitsCandidates(candidates, digitsFromChatId(normalizedRawAuthor));
  }

  addDigitsCandidates(candidates, sender.phoneDigits);
  addDigitsCandidates(candidates, sender.lidDigits);
  addDigitsCandidates(candidates, digitsFromChatId(normalizedRawFrom));
  addDigitsCandidates(candidates, digitsFromChatId(normalizedChatId));

  candidates.delete("");
  return candidates;
}

export async function resolveMessageSender(
  message: Message,
  activeClient?: Client | null
): Promise<ResolvedMessageSender> {
  const rawFrom = normalizeChatId(message.from);
  const rawAuthor = message.author ? normalizeChatId(message.author) : null;
  const isGroup = isGroupChatId(rawFrom);
  const chatId = isGroup && rawAuthor ? rawAuthor : rawFrom;
  const isLid = isLidChatId(chatId);
  const isStatusBroadcast =
    isStatusBroadcastChatId(rawFrom) ||
    isStatusBroadcastChatId(rawAuthor) ||
    isStatusBroadcastChatId(chatId);
  const isNewsletter =
    isNewsletterChatId(rawFrom) ||
    isNewsletterChatId(rawAuthor) ||
    isNewsletterChatId(chatId);
  const isBroadcast =
    isBroadcastChatId(rawFrom) ||
    Boolean(rawAuthor && isBroadcastChatId(rawAuthor)) ||
    isBroadcastChatId(chatId);
  const isPrivateChat =
    !isGroup && !isStatusBroadcast && !isNewsletter && !isBroadcast;
  const base = {
    rawFrom,
    rawAuthor,
    chatId,
    lidDigits: isLid ? digitsFromChatId(chatId) : null,
    lid: isLid ? chatId : null,
    isLid,
    isGroup,
    isStatusBroadcast,
    isNewsletter,
    isBroadcast,
    isPrivateChat
  };

  if (!isLid) {
    return {
      ...base,
      phoneDigits:
        chatId &&
        !isGroupChatId(chatId) &&
        !isBroadcastChatId(chatId) &&
        !isNewsletterChatId(chatId)
          ? digitsFromChatId(chatId)
          : null,
      lidDigits: null,
      displayName: null,
      resolutionSource: rawAuthor ? "author" : "from"
    };
  }

  const cached = await getContactMapEntry(chatId);
  if (cached) {
    return resultFromCache(base, cached);
  }

  try {
    const contact = await message.getContact();
    const resolved = await resultFromContact(base, contact, "getContact");
    if (resolved.phoneDigits) {
      return resolved;
    }
  } catch {
    // Best effort: whatsapp-web.js may fail while the page context is changing.
  }

  if (activeClient) {
    try {
      const contact = await activeClient.getContactById(chatId);
      const resolved = await resultFromContact(base, contact, "getContactById");
      if (resolved.phoneDigits) {
        return resolved;
      }
    } catch {
      // Keep resolving through the cheaper message/chat fallbacks below.
    }
  }

  try {
    const chat = await message.getChat();
    if (!chat.isGroup) {
      const contact = await chat.getContact();
      const resolved = await resultFromContact(base, contact, "chat");
      if (resolved.phoneDigits) {
        return resolved;
      }
    }
  } catch {
    // No more safe sources available.
  }

  return {
    ...base,
    phoneDigits: null,
    displayName: null,
    resolutionSource: "fallback"
  };
}

export async function isAllowedSender(
  message: Message,
  settings: RuntimeSettings,
  activeClient?: Client | null
): Promise<SenderAllowCheck> {
  const sender = await resolveMessageSender(message, activeClient);
  return isResolvedSenderAllowed(sender, settings);
}

export function isResolvedSenderAllowed(
  sender: ResolvedMessageSender,
  settings: RuntimeSettings
): SenderAllowCheck {
  if (settings.autoReplyAllowedNumbers.length === 0) {
    return {
      allowed: false,
      reason: "ignored_not_in_allowlist",
      sender,
      allowedNumbersCount: 0
    };
  }

  const candidates = buildAllowlistCandidates(sender);
  const allowed = settings.autoReplyAllowedNumbers.some((allowedNumber) =>
    candidates.has(normalizeAllowedValue(allowedNumber))
  );

  return {
    allowed,
    reason: allowed ? "allowed" : "ignored_not_in_allowlist",
    sender,
    allowedNumbersCount: settings.autoReplyAllowedNumbers.length
  };
}

export async function resolveChatIdForDebug(input: string, activeClient?: Client | null) {
  const normalized = normalizeChatId(input);

  if (!normalized) {
    throw new Error("Informe um chatId para resolver.");
  }

  if (!isLidChatId(normalized)) {
    return {
      rawInput: input,
      normalized,
      cached: false,
      phoneDigits:
        !isGroupChatId(normalized) &&
        !isBroadcastChatId(normalized) &&
        !isNewsletterChatId(normalized)
          ? digitsFromChatId(normalized)
          : null,
      displayName: null,
      source: "fallback" as ContactResolutionSource
    };
  }

  const cached = await getContactMapEntry(normalized);
  if (cached) {
    return {
      rawInput: input,
      normalized,
      cached: true,
      phoneDigits: cached.phoneDigits,
      displayName: cached.displayName ?? null,
      source: "cache" as ContactResolutionSource
    };
  }

  if (!activeClient) {
    throw new Error("Sem client WhatsApp ativo para resolver LID e nenhum cache encontrado.");
  }

  const contact = await activeClient.getContactById(normalized);
  const details = await detailsFromContact(contact);

  if (!details.phoneDigits) {
    throw new Error("Nao foi possivel resolver esse LID para um numero de telefone.");
  }

  await upsertContactMapEntry({
    lid: normalized,
    phoneDigits: details.phoneDigits,
    displayName: details.displayName ?? undefined,
    source: "getContactById"
  });

  return {
    rawInput: input,
    normalized,
    cached: false,
    phoneDigits: details.phoneDigits,
    displayName: details.displayName,
    source: "getContactById" as ContactResolutionSource
  };
}
