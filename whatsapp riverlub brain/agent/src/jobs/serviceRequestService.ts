import { formatSupabaseError, getSupabaseClient } from "../db/supabase";
import type { ServiceRequest } from "../db/types";

export async function listServiceRequests(status?: string) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("service_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw new Error(formatSupabaseError(error));
  return (data ?? []) as ServiceRequest[];
}

export async function createServiceRequest(input: {
  customerId?: string | null;
  vehicleId?: string | null;
  conversationContactId?: string | null;
  type?: string | null;
  description?: string | null;
  priority?: string;
  createdBy?: string;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("service_requests")
    .insert({
      customer_id: input.customerId ?? null,
      vehicle_id: input.vehicleId ?? null,
      conversation_contact_id: input.conversationContactId ?? null,
      type: input.type ?? null,
      description: input.description ?? null,
      priority: input.priority ?? "normal",
      created_by: input.createdBy ?? "ai"
    })
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  return data as ServiceRequest;
}
