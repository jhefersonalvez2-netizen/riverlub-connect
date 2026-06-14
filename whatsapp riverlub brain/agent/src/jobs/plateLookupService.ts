import { addLog } from "../storage/logStore";
import { getVehicleByPlate } from "./vehicleService";

export function normalizePlate(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 7);
}

export function extractPlateFromText(text: string) {
  const compact = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
  const match = compact.match(/\b[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}\b/);
  return match ? normalizePlate(match[0]) : null;
}

export async function lookupPlate(plate: string) {
  const normalizedPlate = normalizePlate(plate);

  if (normalizedPlate.length !== 7) {
    return {
      found: false,
      plate: normalizedPlate,
      vehicle: null,
      message: "Placa invalida para consulta no banco de teste."
    };
  }

  const vehicle = await getVehicleByPlate(normalizedPlate);

  if (!vehicle) {
    await addLog("plate_lookup_not_found", { plate: normalizedPlate });
    return {
      found: false,
      plate: normalizedPlate,
      vehicle: null,
      message:
        "Nao encontrei essa placa no banco de teste. Posso encaminhar para a recepcao verificar?"
    };
  }

  await addLog("plate_lookup_success", {
    plate: normalizedPlate,
    vehicleId: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year
  });

  return {
    found: true,
    plate: normalizedPlate,
    vehicle,
    message: `Encontrei aqui: ${vehicle.make ?? ""} ${vehicle.model ?? ""} ${vehicle.year ?? ""}. E esse veiculo mesmo?`.trim()
  };
}
