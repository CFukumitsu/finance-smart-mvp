export const DEFAULT_NEW_FUEL_TYPE = "Etanol";

export function getAutomaticVehicleSelectionPatch(
  currentVehicleId: string,
  firstVehicleId?: string
) {
  if (currentVehicleId || !firstVehicleId) return null;
  return { vehicle_id: firstVehicleId };
}
