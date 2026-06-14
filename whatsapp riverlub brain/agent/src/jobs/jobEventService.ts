import { formatSupabaseError, getSupabaseClient } from "../db/supabase";
import type { JobEvent, Json } from "../db/types";

export async function listJobEvents(status?: string) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("job_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw new Error(formatSupabaseError(error));
  return (data ?? []) as JobEvent[];
}

export async function createJobEvent(input: {
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  conversationContactId?: string | null;
  payload?: Json | null;
  status?: string;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("job_events")
    .insert({
      event_type: input.eventType,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      conversation_contact_id: input.conversationContactId ?? null,
      payload: input.payload ?? null,
      status: input.status ?? "pending"
    })
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  return data as JobEvent;
}

export async function processJobEvent(id: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("job_events")
    .update({
      status: "processed",
      processed_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  return data as JobEvent;
}
