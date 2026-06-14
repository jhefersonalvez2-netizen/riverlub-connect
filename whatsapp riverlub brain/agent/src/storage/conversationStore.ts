import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { z } from "zod";
import { conversationsFilePath, ensureDataDir } from "./paths";

const MAX_CONTACTS = 100;
const MAX_MESSAGES_PER_CONTACT = 100;

export type ConversationStatus = "open" | "human" | "paused" | "resolved" | "archived";
export type ConversationMessageDirection = "inbound" | "outbound";
export type ConversationMessageSource = "whatsapp" | "manual" | "auto_reply" | "template";

const messageSchema = z.object({
  id: z.string(),
  whatsappMessageId: z.string().nullable(),
  direction: z.enum(["inbound", "outbound"]),
  source: z.enum(["whatsapp", "manual", "auto_reply", "template"]),
  from: z.string(),
  to: z.string(),
  body: z.string(),
  timestamp: z.string(),
  isAutoReply: z.boolean().default(false),
  isManual: z.boolean().default(false),
  policyReason: z.string().nullable().default(null)
});

const draftSuggestionSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    createdAt: z.string(),
    model: z.string(),
    basedOnMessageId: z.string().nullable()
  })
  .nullable();

const contactSchema = z.object({
  contactId: z.string(),
  chatId: z.string(),
  phoneDigits: z.string().nullable(),
  lid: z.string().nullable(),
  displayName: z.string().nullable(),
  status: z.enum(["open", "human", "paused", "resolved", "archived"]).default("open"),
  aiPaused: z.boolean().default(false),
  humanTakeover: z.boolean().default(false),
  unreadCount: z.number().int().min(0).default(0),
  lastInboundAt: z.string().nullable(),
  lastOutboundAt: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(messageSchema).default([]),
  draftSuggestion: draftSuggestionSchema.default(null)
});

const conversationsSchema = z.object({
  contacts: z.array(contactSchema).default([])
});

export type ConversationMessage = z.infer<typeof messageSchema>;
export type DraftSuggestion = NonNullable<z.infer<typeof draftSuggestionSchema>>;
export type ConversationContact = z.infer<typeof contactSchema>;
export type ConversationRecord = ConversationContact;

export interface ConversationSummary {
  contactId: string;
  chatId: string;
  phoneDigits: string | null;
  lid: string | null;
  displayName: string | null;
  status: ConversationStatus;
  aiPaused: boolean;
  humanTakeover: boolean;
  unreadCount: number;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  hasDraftSuggestion: boolean;
}

interface UpsertMessageInput {
  contactId: string;
  chatId: string;
  phoneDigits?: string | null;
  lid?: string | null;
  displayName?: string | null;
  whatsappMessageId?: string | null;
  direction: ConversationMessageDirection;
  source: ConversationMessageSource;
  from: string;
  to: string;
  body: string;
  timestamp?: string;
  isAutoReply?: boolean;
  isManual?: boolean;
  policyReason?: string | null;
  markRead?: boolean;
}

let conversationWriteQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function sanitizeText(value: string) {
  return value.trim().slice(0, 4000);
}

function sortContacts(contacts: ConversationRecord[]) {
  return [...contacts].sort((left, right) => {
    const leftAt = left.lastMessageAt ?? left.updatedAt;
    const rightAt = right.lastMessageAt ?? right.updatedAt;
    return rightAt.localeCompare(leftAt);
  });
}

function isAlwaysIgnoredConversation(conversation: ConversationRecord) {
  const ids = [conversation.contactId, conversation.chatId, conversation.lid ?? ""].map((id) =>
    id.toLowerCase()
  );

  return ids.some(
    (id) =>
      id.endsWith("@newsletter") ||
      id.includes("status@broadcast") ||
      id.includes("@broadcast")
  );
}

function trimContacts(contacts: ConversationRecord[]) {
  return sortContacts(contacts).slice(0, MAX_CONTACTS);
}

function trimMessages(messages: ConversationMessage[]) {
  return messages.slice(-MAX_MESSAGES_PER_CONTACT);
}

async function writeConversations(contacts: ConversationRecord[]) {
  await ensureDataDir();
  await fs.writeFile(
    conversationsFilePath,
    `${JSON.stringify({ contacts: trimContacts(contacts) }, null, 2)}\n`,
    "utf8"
  );
}

async function backupCorruptedConversations() {
  const backupPath = `${conversationsFilePath}.corrupt-${Date.now()}.bak`;

  try {
    await fs.rename(conversationsFilePath, backupPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

async function readConversationsUnsafe(): Promise<ConversationRecord[]> {
  await ensureDataDir();

  try {
    const raw = await fs.readFile(conversationsFilePath, "utf8");
    const parsed = conversationsSchema.parse(JSON.parse(raw));
    return parsed.contacts.map((contact) => ({
      ...contact,
      messages: trimMessages(contact.messages)
    }));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT") {
      await writeConversations([]);
      return [];
    }

    await backupCorruptedConversations();
    await writeConversations([]);
    return [];
  }
}

function updateConversationMetadata(
  conversation: ConversationRecord,
  input: Pick<UpsertMessageInput, "chatId" | "phoneDigits" | "lid" | "displayName">
) {
  conversation.chatId = input.chatId || conversation.chatId;
  conversation.phoneDigits = input.phoneDigits ?? conversation.phoneDigits ?? null;
  conversation.lid = input.lid ?? conversation.lid ?? null;
  conversation.displayName = input.displayName ?? conversation.displayName ?? null;
}

function createConversation(input: UpsertMessageInput, timestamp: string): ConversationRecord {
  return {
    contactId: input.contactId,
    chatId: input.chatId,
    phoneDigits: input.phoneDigits ?? null,
    lid: input.lid ?? null,
    displayName: input.displayName ?? null,
    status: "open",
    aiPaused: false,
    humanTakeover: false,
    unreadCount: 0,
    lastInboundAt: null,
    lastOutboundAt: null,
    lastMessageAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
    draftSuggestion: null
  };
}

function toSummary(conversation: ConversationRecord): ConversationSummary {
  const lastMessage = conversation.messages.at(-1);

  return {
    contactId: conversation.contactId,
    chatId: conversation.chatId,
    phoneDigits: conversation.phoneDigits,
    lid: conversation.lid,
    displayName: conversation.displayName,
    status: conversation.status,
    aiPaused: conversation.aiPaused,
    humanTakeover: conversation.humanTakeover,
    unreadCount: conversation.unreadCount,
    lastMessagePreview: lastMessage?.body ?? "",
    lastMessageAt: conversation.lastMessageAt,
    lastInboundAt: conversation.lastInboundAt,
    lastOutboundAt: conversation.lastOutboundAt,
    hasDraftSuggestion: Boolean(conversation.draftSuggestion)
  };
}

export async function ensureConversationStore() {
  await readConversationsUnsafe();
}

export async function listConversationSummaries(includeArchived = false) {
  const contacts = await readConversationsUnsafe();
  return sortContacts(contacts)
    .filter((contact) => !isAlwaysIgnoredConversation(contact))
    .filter((contact) => includeArchived || contact.status !== "archived")
    .map(toSummary);
}

export async function getConversation(contactId: string) {
  const contacts = await readConversationsUnsafe();
  return contacts.find((contact) => contact.contactId === contactId) ?? null;
}

export async function getConversationStats() {
  const contacts = await readConversationsUnsafe();

  return {
    contactsCount: contacts.length,
    totalMessages: contacts.reduce((sum, contact) => sum + contact.messages.length, 0),
    ignoredSystemContactsCount: contacts.filter(isAlwaysIgnoredConversation).length,
    openCount: contacts.filter((contact) => contact.status === "open").length,
    humanTakeoverCount: contacts.filter((contact) => contact.humanTakeover).length,
    aiPausedCount: contacts.filter((contact) => contact.aiPaused).length,
    unreadTotal: contacts.reduce((sum, contact) => sum + contact.unreadCount, 0)
  };
}

export function upsertConversationMessage(input: UpsertMessageInput) {
  const writeTask = conversationWriteQueue.then(async () => {
    const contacts = await readConversationsUnsafe();
    const timestamp = input.timestamp ?? nowIso();
    const body = sanitizeText(input.body);
    const existingIndex = contacts.findIndex(
      (contact) => contact.contactId === input.contactId
    );
    const created = existingIndex === -1;
    const conversation = created
      ? createConversation(input, timestamp)
      : { ...contacts[existingIndex], messages: [...contacts[existingIndex].messages] };

    updateConversationMetadata(conversation, input);

    const message: ConversationMessage = {
      id: randomUUID(),
      whatsappMessageId: input.whatsappMessageId ?? null,
      direction: input.direction,
      source: input.source,
      from: input.from,
      to: input.to,
      body,
      timestamp,
      isAutoReply: input.isAutoReply ?? input.source === "auto_reply",
      isManual: input.isManual ?? (input.source === "manual" || input.source === "template"),
      policyReason: input.policyReason ?? null
    };

    conversation.messages = trimMessages([...conversation.messages, message]);

    if (input.direction === "inbound") {
      conversation.unreadCount += 1;
      conversation.lastInboundAt = timestamp;
    } else {
      conversation.lastOutboundAt = timestamp;
      if (input.markRead) {
        conversation.unreadCount = 0;
      }
    }

    conversation.lastMessageAt = timestamp;
    conversation.updatedAt = timestamp;

    const nextContacts = created
      ? [...contacts, conversation]
      : contacts.map((contact, index) => (index === existingIndex ? conversation : contact));
    await writeConversations(nextContacts);

    return {
      created,
      conversation,
      message,
      summary: toSummary(conversation)
    };
  });

  conversationWriteQueue = writeTask.then(
    () => undefined,
    () => undefined
  );

  return writeTask;
}

export function updateConversation(contactId: string, updater: (conversation: ConversationRecord) => ConversationRecord) {
  const writeTask = conversationWriteQueue.then(async () => {
    const contacts = await readConversationsUnsafe();
    const existing = contacts.find((contact) => contact.contactId === contactId);

    if (!existing) {
      throw new Error("Conversa nao encontrada.");
    }

    const updated = {
      ...updater({ ...existing, messages: [...existing.messages] }),
      updatedAt: nowIso()
    };
    const nextContacts = contacts.map((contact) =>
      contact.contactId === contactId ? updated : contact
    );
    await writeConversations(nextContacts);

    return {
      conversation: updated,
      summary: toSummary(updated)
    };
  });

  conversationWriteQueue = writeTask.then(
    () => undefined,
    () => undefined
  );

  return writeTask;
}

export async function markConversationRead(contactId: string) {
  return updateConversation(contactId, (conversation) => ({
    ...conversation,
    unreadCount: 0
  }));
}

export async function setConversationHumanTakeover(contactId: string, enabled: boolean) {
  return updateConversation(contactId, (conversation) => ({
    ...conversation,
    humanTakeover: enabled,
    status: enabled
      ? "human"
      : conversation.aiPaused
        ? "paused"
        : conversation.status === "human"
          ? "open"
          : conversation.status
  }));
}

export async function setConversationAiPaused(contactId: string, enabled: boolean) {
  return updateConversation(contactId, (conversation) => ({
    ...conversation,
    aiPaused: enabled,
    status: enabled
      ? "paused"
      : conversation.humanTakeover
        ? "human"
        : conversation.status === "paused"
          ? "open"
          : conversation.status
  }));
}

export async function setConversationStatus(contactId: string, status: ConversationStatus) {
  return updateConversation(contactId, (conversation) => ({
    ...conversation,
    status
  }));
}

export async function clearConversationDraft(contactId: string) {
  return updateConversation(contactId, (conversation) => ({
    ...conversation,
    draftSuggestion: null
  }));
}

export async function saveConversationDraftSuggestion(input: {
  contactId: string;
  text: string;
  model: string;
  basedOnMessageId: string | null;
}) {
  const draftSuggestion: DraftSuggestion = {
    id: randomUUID(),
    text: sanitizeText(input.text),
    createdAt: nowIso(),
    model: input.model,
    basedOnMessageId: input.basedOnMessageId
  };

  const result = await updateConversation(input.contactId, (conversation) => ({
    ...conversation,
    draftSuggestion
  }));

  return {
    ...result,
    draftSuggestion
  };
}

export function serializeConversation(conversation: ConversationRecord) {
  const { messages, draftSuggestion, ...contact } = conversation;

  return {
    contact,
    messages,
    draftSuggestion
  };
}
