import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "agent", ".env"),
  path.resolve(process.cwd(), "..", ".env")
];

for (const envPath of envCandidates) {
  dotenv.config({ path: envPath, override: false });
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(47852),
  AGENT_AUTH_TOKEN: z.string().trim().default(""),
  FRONTEND_ORIGIN: z.string().trim().default("http://localhost:1420"),
  OPENAI_MODEL: z.string().trim().default("gpt-4o-mini"),
  AUTO_REPLY: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => value === "true" || value === "1" || value === "yes")
    .default("false"),
  AUTO_SUGGEST: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => value === "true" || value === "1" || value === "yes")
    .default("false"),
  ALLOW_GROUPS: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => value === "true" || value === "1" || value === "yes")
    .default("false"),
  AUTO_REPLY_ALLOWED_NUMBERS: z.string().trim().default(""),
  SUPABASE_URL: z.string().trim().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().default(""),
  SUPABASE_ANON_KEY: z.string().trim().default(""),
  RECEPTION_NOTIFY_TO: z.string().trim().default(""),
  RECEPTION_NOTIFY_ENABLED: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => value !== "false" && value !== "0" && value !== "no")
    .default("true"),
  IGNORE_OLD_MESSAGES_ON_START: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => value !== "false" && value !== "0" && value !== "no")
    .default("true"),
  OLD_MESSAGE_MAX_AGE_SECONDS: z.coerce.number().int().min(0).max(86400).default(120)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = {
  port: parsed.data.PORT,
  agentAuthToken: parsed.data.AGENT_AUTH_TOKEN,
  frontendOrigin: parsed.data.FRONTEND_ORIGIN,
  openAiKey:
    process.env.OPENAI_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "",
  openAiModel: parsed.data.OPENAI_MODEL,
  supabaseUrl: parsed.data.SUPABASE_URL,
  supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  supabaseAnonKey: parsed.data.SUPABASE_ANON_KEY,
  receptionNotifyTo: parsed.data.RECEPTION_NOTIFY_TO,
  receptionNotifyEnabled: parsed.data.RECEPTION_NOTIFY_ENABLED,
  autoReply: parsed.data.AUTO_REPLY,
  autoSuggest: parsed.data.AUTO_SUGGEST,
  allowGroups: parsed.data.ALLOW_GROUPS,
  ignoreOldMessagesOnStart: parsed.data.IGNORE_OLD_MESSAGES_ON_START,
  oldMessageMaxAgeSeconds: parsed.data.OLD_MESSAGE_MAX_AGE_SECONDS,
  autoReplyAllowedNumbers: parsed.data.AUTO_REPLY_ALLOWED_NUMBERS.split(",")
    .map((number) => number.trim().toLowerCase())
    .map((number) => (number.includes("@") ? number.replace(/\s/g, "") : number.replace(/\D/g, "")))
    .filter(Boolean)
};
