import { formatSupabaseError, getSupabaseClient } from "../db/supabase";
import type { ReturnReminder } from "../db/types";

export async function listReminders(status?: string) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("return_reminders")
    .select("*")
    .order("reminder_at", { ascending: true })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw new Error(formatSupabaseError(error));
  return (data ?? []) as ReturnReminder[];
}

export async function createReturnReminder(input: {
  customerId?: string | null;
  vehicleId?: string | null;
  conversationContactId?: string | null;
  reminderAt: string;
  reason?: string | null;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("return_reminders")
    .insert({
      customer_id: input.customerId ?? null,
      vehicle_id: input.vehicleId ?? null,
      conversation_contact_id: input.conversationContactId ?? null,
      reminder_at: new Date(input.reminderAt).toISOString(),
      reason: input.reason ?? null,
      status: "scheduled"
    })
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  return data as ReturnReminder;
}
