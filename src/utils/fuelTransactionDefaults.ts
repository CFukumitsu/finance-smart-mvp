export const DEFAULT_NEW_FUEL_TYPE = "Etanol";

export function getAutomaticVehicleSelectionPatch(
  currentVehicleId: string,
  firstVehicleId?: string
) {
  if (currentVehicleId || !firstVehicleId) return null;
  return { vehicle_id: firstVehicleId };
}

export const FUEL_TYPE_OPTIONS = [
  "Gasolina comum",
  "Gasolina aditivada",
  "Gasolina premium",
  "Etanol",
  "Diesel S10",
  "Diesel S500",
  "GNV",
  "Energia elétrica",
  "Outro",
];

export type LastFuelRecordForSuggestion = {
  vehicle_id: string | null;
  fuel_type: string | null;
  vehicle_active: boolean;
};

// Ao escolher uma descrição sugerida, reaproveita apenas o que costuma se
// repetir entre abastecimentos. Posto vem da geolocalização; odômetro, litros
// e preço mudam a cada abastecimento e nunca são copiados.
export function getSuggestedFuelFormPatch(
  lastRecord: LastFuelRecordForSuggestion | null
) {
  if (!lastRecord) return {};

  const patch: { vehicle_id?: string; fuel_type?: string } = {};
  if (lastRecord.vehicle_id && lastRecord.vehicle_active) {
    patch.vehicle_id = lastRecord.vehicle_id;
  }
  if (lastRecord.fuel_type && FUEL_TYPE_OPTIONS.includes(lastRecord.fuel_type)) {
    patch.fuel_type = lastRecord.fuel_type;
  }
  return patch;
}
