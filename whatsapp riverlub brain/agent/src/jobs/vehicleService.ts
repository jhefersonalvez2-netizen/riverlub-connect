import { formatSupabaseError, getSupabaseClient } from "../db/supabase";
import type { Vehicle } from "../db/types";

function normalizeVehiclePlate(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 7);
}

export async function createVehicle(input: {
  customerId?: string | null;
  plate?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  engine?: string | null;
  source?: string | null;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      customer_id: input.customerId ?? null,
      plate: input.plate ? normalizeVehiclePlate(input.plate) : null,
      make: input.make ?? null,
      model: input.model ?? null,
      year: input.year ?? null,
      engine: input.engine ?? null,
      source: input.source ?? "manual"
    })
    .select("*")
    .single();

  if (error) throw new Error(formatSupabaseError(error));
  return data as Vehicle;
}

export async function getVehicleByPlate(plate: string) {
  const normalizedPlate = normalizeVehiclePlate(plate);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("plate", normalizedPlate)
    .maybeSingle();

  if (error) throw new Error(formatSupabaseError(error));
  return (data ?? null) as Vehicle | null;
}

export async function listVehicles() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(formatSupabaseError(error));
  return (data ?? []) as Vehicle[];
}
