import type { FuelStationType } from "@/src/types/fuel";

type DatabaseError = {
  code?: unknown;
  message?: unknown;
};

export function isMissingFuelStationTypeColumn(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const { code, message } = error as DatabaseError;
  return (
    code === "42703" &&
    typeof message === "string" &&
    message.includes("fuel_stations.station_type")
  );
}

export function withCompatibleFuelStationType<T extends object>(station: T) {
  const stationType = (station as { station_type?: unknown }).station_type;
  const normalizedType: FuelStationType =
    stationType === "generic" ? "generic" : "registered";

  return {
    ...station,
    station_type: normalizedType,
  };
}
