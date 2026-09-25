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

// A RPC ensure_generic_fuel_station vem de uma migration opcional. Sem ela o
// PostgREST responde PGRST202 (fora do schema cache) ou o Postgres 42883.
export function isMissingGenericFuelStationFunction(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const { code, message } = error as DatabaseError;
  return (
    (code === "PGRST202" || code === "42883") &&
    typeof message === "string" &&
    message.includes("ensure_generic_fuel_station")
  );
}
