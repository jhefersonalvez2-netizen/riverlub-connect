import { formatSupabaseError, getSupabaseClient } from "../db/supabase";
import type { Quote } from "../db/types";

export async function listQuotes() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(formatSupabaseError(error));
  return (data ?? []) as Quote[];
}

export async function createQuoteDraft(input: {
  customerId?: string | null;
  vehicleId?: string | null;
  serviceRequestId?: string | null;
  totalEstimated?: number | null;
  notes?: string | null;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("quotes")
    .insert({
      customer_id: input.customerId ?? null,
      vehicle_id: input.vehicleId ?? null,
      service_request_id: input.serviceRequestId ?? null,
      status: "draft",
      total_estimated: input.totalEstimated ?? null,
      notes: input.notes ?? null
    })
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  return data as Quote;
}
