import fs from "node:fs/promises";
import { z } from "zod";
import { contactMapFilePath, ensureDataDir } from "./paths";

const MAX_CONTACT_MAP_ITEMS = 1000;

const contactMapItemSchema = z.object({
  lid: z.string().min(1),
  phoneDigits: z.string().regex(/^\d+$/),
  displayName: z.string().optional(),
  updatedAt: z.string(),
  source: z.string().min(1)
});

const contactMapSchema = z.object({
  items: z.array(contactMapItemSchema).default([])
});

export type ContactMapItem = z.infer<typeof contactMapItemSchema>;

let contactMapWriteQueue = Promise.resolve();

function normalizeLid(lid: string) {
  return lid.trim().toLowerCase();
}

function normalizePhoneDigits(phoneDigits: string) {
  return phoneDigits.replace(/\D/g, "");
}

async function writeContactMap(items: ContactMapItem[]) {
  await ensureDataDir();
  const normalizedItems = items
    .filter((item) => item.lid.endsWith("@lid") && item.phoneDigits)
    .slice(-MAX_CONTACT_MAP_ITEMS);

  await fs.writeFile(
    contactMapFilePath,
    `${JSON.stringify({ items: normalizedItems }, null, 2)}\n`,
    "utf8"
  );

  return normalizedItems;
}

async function backupCorruptedContactMap() {
  const backupPath = `${contactMapFilePath}.corrupt-${Date.now()}.bak`;

  try {
    await fs.rename(contactMapFilePath, backupPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

async function readContactMapUnsafe(): Promise<ContactMapItem[]> {
  await ensureDataDir();

  try {
    const raw = await fs.readFile(contactMapFilePath, "utf8");
    const parsed = contactMapSchema.parse(JSON.parse(raw));
    return parsed.items.map((item) => ({
      ...item,
      lid: normalizeLid(item.lid),
      phoneDigits: normalizePhoneDigits(item.phoneDigits)
    }));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT") {
      await writeContactMap([]);
      return [];
    }

    await backupCorruptedContactMap();
    await writeContactMap([]);
    return [];
  }
}

export async function ensureContactMapStore() {
  await readContactMapUnsafe();
}

export async function getContactMapEntry(lid: string) {
  const normalizedLid = normalizeLid(lid);
  const items = await readContactMapUnsafe();
  return items.find((item) => item.lid === normalizedLid) ?? null;
}

export function upsertContactMapEntry(entry: {
  lid: string;
  phoneDigits: string;
  displayName?: string;
  source: string;
}) {
  const normalizedLid = normalizeLid(entry.lid);
  const phoneDigits = normalizePhoneDigits(entry.phoneDigits);

  if (!normalizedLid.endsWith("@lid") || !phoneDigits) {
    return Promise.resolve(null);
  }

  const writeTask = contactMapWriteQueue.then(async () => {
    const currentItems = await readContactMapUnsafe();
    const nextItem: ContactMapItem = {
      lid: normalizedLid,
      phoneDigits,
      displayName: entry.displayName,
      source: entry.source,
      updatedAt: new Date().toISOString()
    };
    const withoutCurrent = currentItems.filter((item) => item.lid !== normalizedLid);
    await writeContactMap([...withoutCurrent, nextItem]);
    return nextItem;
  });

  contactMapWriteQueue = writeTask.then(
    () => undefined,
    () => undefined
  );

  return writeTask;
}

export async function getContactMapStats() {
  const items = await readContactMapUnsafe();
  const lastUpdatedAt = items.reduce<string | null>((latest, item) => {
    if (!latest || item.updatedAt > latest) {
      return item.updatedAt;
    }

    return latest;
  }, null);

  return {
    count: items.length,
    lastUpdatedAt
  };
}
