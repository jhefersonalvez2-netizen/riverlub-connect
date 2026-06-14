import { formatSupabaseError, getSupabaseClient } from "./supabase";

export async function seedJobsLabData() {
  const supabase = getSupabaseClient();
  const { error: customerError } = await supabase.from("customers").insert({
    name: "Cliente Teste",
    phone: "5587999999999",
    whatsapp_chat_id: "test@lid"
  });

  if (customerError && customerError.code !== "23505") {
    throw new Error(formatSupabaseError(customerError));
  }

  const { error: vehicleError } = await supabase.from("vehicles").upsert(
    {
      plate: "AAA1234",
      make: "Toyota",
      model: "Corolla",
      year: 2018,
      engine: "2.0",
      source: "seed"
    },
    { onConflict: "plate" }
  );

  if (vehicleError) {
    throw new Error(formatSupabaseError(vehicleError));
  }

  return { ok: true };
}
