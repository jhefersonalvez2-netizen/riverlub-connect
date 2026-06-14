import fs from "node:fs/promises";
import { z } from "zod";
import { contactPoliciesFilePath, ensureDataDir } from "../storage/paths";

const contactPolicySchema = z.object({
  contactId: z.string(),
  optIn: z.boolean().default(false),
  optOut: z.boolean().default(false),
  optOutAt: z.string().nullable().default(null),
  optOutReason: z.string().nullable().default(null),
  lastPolicyDecisionAt: z.string().nullable().default(null),
  notes: z.string().default(""),
  updatedAt: z.string()
});

const contactPoliciesSchema = z.object({
  items: z.array(contactPolicySchema).default([])
});

export type ContactPolicy = z.infer<typeof contactPolicySchema>;

let contactPolicyWriteQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function createDefaultPolicy(contactId: string): ContactPolicy {
  return {
    contactId,
    optIn: false,
    optOut: false,
    optOutAt: null,
    optOutReason: null,
    lastPolicyDecisionAt: null,
    notes: "",
    updatedAt: nowIso()
  };
}

async function writePolicies(items: ContactPolicy[]) {
  await ensureDataDir();
  await fs.writeFile(
    contactPoliciesFilePath,
    `${JSON.stringify({ items }, null, 2)}\n`,
    "utf8"
  );
}

async function backupCorruptedPolicies() {
  const backupPath = `${contactPoliciesFilePath}.corrupt-${Date.now()}.bak`;

  try {
    await fs.rename(contactPoliciesFilePath, backupPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

async function readPoliciesUnsafe(): Promise<ContactPolicy[]> {
  await ensureDataDir();

  try {
    const raw = await fs.readFile(contactPoliciesFilePath, "utf8");
    return contactPoliciesSchema.parse(JSON.parse(raw)).items;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT") {
      await writePolicies([]);
      return [];
    }

    await backupCorruptedPolicies();
    await writePolicies([]);
    return [];
  }
}

export async function ensureContactPolicyStore() {
  await readPoliciesUnsafe();
}

export async function getContactPolicy(contactId: string) {
  const items = await readPoliciesUnsafe();
  return items.find((item) => item.contactId === contactId) ?? createDefaultPolicy(contactId);
}

export function updateContactPolicy(contactId: string, partial: Partial<ContactPolicy>) {
  const writeTask = contactPolicyWriteQueue.then(async () => {
    const items = await readPoliciesUnsafe();
    const current = items.find((item) => item.contactId === contactId) ?? createDefaultPolicy(contactId);
    let optIn = partial.optIn ?? current.optIn;
    let optOut = partial.optOut ?? current.optOut;

    if (partial.optIn === true) {
      optOut = false;
      optIn = true;
    } else if (partial.optOut === true) {
      optOut = true;
      optIn = false;
    }

    const updated: ContactPolicy = contactPolicySchema.parse({
      ...current,
      ...partial,
      contactId,
      optIn,
      optOut,
      optOutAt: !optOut ? null : partial.optOut === true ? nowIso() : current.optOutAt,
      optOutReason: !optOut ? null : partial.optOutReason ?? current.optOutReason,
      notes: typeof partial.notes === "string" ? partial.notes.slice(0, 1000) : current.notes,
      updatedAt: nowIso()
    });
    const nextItems = items.some((item) => item.contactId === contactId)
      ? items.map((item) => (item.contactId === contactId ? updated : item))
      : [...items, updated];

    await writePolicies(nextItems.slice(-1000));
    return updated;
  });

  contactPolicyWriteQueue = writeTask.then(
    () => undefined,
    () => undefined
  );

  return writeTask;
}

export function setOptOut(contactId: string, reason?: string) {
  return updateContactPolicy(contactId, {
    optIn: false,
    optOut: true,
    optOutAt: nowIso(),
    optOutReason: reason?.slice(0, 500) ?? null
  });
}

export function setOptIn(contactId: string) {
  return updateContactPolicy(contactId, {
    optIn: true,
    optOut: false,
    optOutAt: null,
    optOutReason: null
  });
}

export async function isOptedOut(contactId: string) {
  return (await getContactPolicy(contactId)).optOut;
}

export function markPolicyDecision(contactId: string, createdAt: string) {
  return updateContactPolicy(contactId, {
    lastPolicyDecisionAt: createdAt
  });
}

export async function getContactPolicyStats() {
  const items = await readPoliciesUnsafe();
  const lastPolicyDecisionAt = items.reduce<string | null>((latest, item) => {
    if (!item.lastPolicyDecisionAt) {
      return latest;
    }

    if (!latest || item.lastPolicyDecisionAt > latest) {
      return item.lastPolicyDecisionAt;
    }

    return latest;
  }, null);

  return {
    contactPoliciesCount: items.length,
    lastPolicyDecisionAt
  };
}
