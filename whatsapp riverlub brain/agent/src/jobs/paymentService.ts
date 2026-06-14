import { formatSupabaseError, getSupabaseClient } from "../db/supabase";
import type { Payment } from "../db/types";

export async function listPayments(status?: string) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw new Error(formatSupabaseError(error));
  return (data ?? []) as Payment[];
}

export async function createPendingPayment(input: {
  customerId?: string | null;
  quoteId?: string | null;
  amount?: number | null;
  dueDate?: string | null;
  method?: string | null;
  notes?: string | null;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("payments")
    .insert({
      customer_id: input.customerId ?? null,
      quote_id: input.quoteId ?? null,
      amount: input.amount ?? null,
      status: "pending",
      due_date: input.dueDate ?? null,
      method: input.method ?? null,
      notes: input.notes ?? null
    })
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  return data as Payment;
}
