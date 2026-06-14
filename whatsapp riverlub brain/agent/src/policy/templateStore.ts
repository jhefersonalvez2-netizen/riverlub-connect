import fs from "node:fs/promises";
import { z } from "zod";
import { ensureDataDir, templatesFilePath } from "../storage/paths";

const templateSchema = z.object({
  name: z.string().min(1),
  category: z.string().default("utility"),
  status: z.string().default("approved_internal"),
  enabled: z.boolean().default(true),
  text: z.string().min(1),
  updatedAt: z.string()
});

const templatesSchema = z.object({
  templates: z.array(templateSchema).default([])
});

export type InternalTemplate = z.infer<typeof templateSchema>;

let templateWriteQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

async function writeTemplates(templates: InternalTemplate[]) {
  await ensureDataDir();
  await fs.writeFile(
    templatesFilePath,
    `${JSON.stringify({ templates }, null, 2)}\n`,
    "utf8"
  );
}

async function backupCorruptedTemplates() {
  const backupPath = `${templatesFilePath}.corrupt-${Date.now()}.bak`;

  try {
    await fs.rename(templatesFilePath, backupPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

async function readTemplatesUnsafe(): Promise<InternalTemplate[]> {
  await ensureDataDir();

  try {
    const raw = await fs.readFile(templatesFilePath, "utf8");
    return templatesSchema.parse(JSON.parse(raw)).templates;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT") {
      await writeTemplates([]);
      return [];
    }

    await backupCorruptedTemplates();
    await writeTemplates([]);
    return [];
  }
}

export async function ensureTemplateStore() {
  await readTemplatesUnsafe();
}

export async function listTemplates() {
  return readTemplatesUnsafe();
}

export async function getTemplate(name: string) {
  const templates = await readTemplatesUnsafe();
  return templates.find((template) => template.name === name) ?? null;
}

export function upsertTemplate(input: {
  name: string;
  category?: string;
  status?: string;
  enabled?: boolean;
  text: string;
}) {
  const writeTask = templateWriteQueue.then(async () => {
    const templates = await readTemplatesUnsafe();
    const current = templates.find((template) => template.name === input.name);
    const next: InternalTemplate = templateSchema.parse({
      name: input.name,
      category: input.category ?? current?.category ?? "utility",
      status: input.status ?? current?.status ?? "approved_internal",
      enabled: input.enabled ?? current?.enabled ?? true,
      text: input.text,
      updatedAt: nowIso()
    });
    const nextTemplates = templates.some((template) => template.name === input.name)
      ? templates.map((template) => (template.name === input.name ? next : template))
      : [...templates, next];

    await writeTemplates(nextTemplates);
    return next;
  });

  templateWriteQueue = writeTask.then(
    () => undefined,
    () => undefined
  );

  return writeTask;
}

export async function disableTemplate(name: string) {
  const template = await getTemplate(name);

  if (!template) {
    throw new Error("Template nao encontrado.");
  }

  return upsertTemplate({
    ...template,
    enabled: false
  });
}

export function renderTemplate(text: string, variables: Record<string, unknown>) {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export async function getTemplateStats() {
  const templates = await readTemplatesUnsafe();

  return {
    templatesCount: templates.length
  };
}
