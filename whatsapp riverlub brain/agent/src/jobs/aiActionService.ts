import { formatSupabaseError, getSupabaseClient } from "../db/supabase";
import type { AiAction, Json } from "../db/types";
import { addLog } from "../storage/logStore";

export async function listAiActions() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ai_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(formatSupabaseError(error));
  return (data ?? []) as AiAction[];
}

export async function createAiAction(input: {
  conversationContactId?: string | null;
  actionType: string;
  status?: string;
  input?: Json | null;
  result?: Json | null;
  requiresConfirmation?: boolean;
  confirmedByCustomer?: boolean;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ai_actions")
    .insert({
      conversation_contact_id: input.conversationContactId ?? null,
      action_type: input.actionType,
      status: input.status ?? "pending",
      input: input.input ?? null,
      result: input.result ?? null,
      requires_confirmation: input.requiresConfirmation ?? false,
      confirmed_by_customer: input.confirmedByCustomer ?? false,
      completed_at: input.status === "completed" ? new Date().toISOString() : null
    })
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  const action = data as AiAction;
  await addLog("ai_action_detected", {
    aiActionId: action.id,
    actionType: action.action_type,
    conversationContactId: action.conversation_contact_id
  });
  return action;
}

export async function completeAiAction(id: string, result?: Json | null) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ai_actions")
    .update({
      status: "completed",
      result: result ?? null,
      completed_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  const action = data as AiAction;
  await addLog("ai_action_completed", {
    aiActionId: action.id,
    actionType: action.action_type
  });
  return action;
}
