import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";

let cachedClient: SupabaseClient | null = null;

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase nao configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env do agent."
    );
    this.name = "SupabaseNotConfiguredError";
  }
}

export function isSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export function getSupabaseStatus() {
  return {
    configured: isSupabaseConfigured(),
    hasUrl: Boolean(env.supabaseUrl),
    hasServiceRoleKey: Boolean(env.supabaseServiceRoleKey),
    hasAnonKey: Boolean(env.supabaseAnonKey)
  };
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new SupabaseNotConfiguredError();
  }

  if (!cachedClient) {
    cachedClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return cachedClient;
}

export function formatSupabaseError(error: unknown) {
  if (!error) {
    return "Erro desconhecido do Supabase.";
  }

  if (typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }

  return String(error);
}
