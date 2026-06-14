import { formatSupabaseError, getSupabaseClient } from "../db/supabase";
import type { Customer } from "../db/types";

function cleanPhone(value?: string | null) {
  return value ? value.replace(/\D/g, "") || null : null;
}

export async function listCustomers() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(formatSupabaseError(error));
  return (data ?? []) as Customer[];
}

export async function createCustomer(input: {
  name?: string | null;
  phone?: string | null;
  whatsappChatId?: string | null;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: input.name ?? null,
      phone: cleanPhone(input.phone),
      whatsapp_chat_id: input.whatsappChatId ?? null
    })
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  return data as Customer;
}

export async function ensureCustomerForConversation(input: {
  conversationContactId: string;
  name?: string | null;
  phone?: string | null;
}) {
  const supabase = getSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("customers")
    .select("*")
    .eq("whatsapp_chat_id", input.conversationContactId)
    .maybeSingle();

  if (existingError) throw new Error(formatSupabaseError(existingError));
  if (existing) return existing as Customer;

  return createCustomer({
    name: input.name ?? null,
    phone: input.phone ?? null,
    whatsappChatId: input.conversationContactId
  });
}
