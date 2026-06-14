import fs from "node:fs/promises";
import { ensureDataDir, promptFilePath } from "../storage/paths";

export const DEFAULT_PROMPT =
  "Você é o assistente virtual da RiverLub, uma super troca de óleo e centro automotivo em Petrolina. Responda com educação, clareza e objetividade. Não invente preços, prazos ou disponibilidade. Quando não souber, diga que vai encaminhar para um atendente. Nunca prometa serviço que não foi confirmado.";

interface PromptFile {
  prompt: string;
  updated_at: string;
}

async function writePromptFile(prompt: string) {
  const payload: PromptFile = {
    prompt,
    updated_at: new Date().toISOString()
  };

  await ensureDataDir();
  await fs.writeFile(promptFilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export async function ensurePromptStore() {
  await ensureDataDir();

  try {
    await fs.access(promptFilePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      await writePromptFile(DEFAULT_PROMPT);
      return;
    }

    throw error;
  }
}

export async function promptExists() {
  try {
    await fs.access(promptFilePath);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function getPrompt() {
  await ensurePromptStore();
  const raw = await fs.readFile(promptFilePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<PromptFile>;

  if (!parsed.prompt || typeof parsed.prompt !== "string") {
    return writePromptFile(DEFAULT_PROMPT);
  }

  return {
    prompt: parsed.prompt,
    updated_at: parsed.updated_at ?? null
  };
}

export async function savePrompt(prompt: string) {
  return writePromptFile(prompt);
}
