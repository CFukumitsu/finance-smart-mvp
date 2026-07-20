const isDevelopment = process.env.NODE_ENV === "development";

export type FuelGeolocationDiagnosticDetails = Record<string, unknown>;

export function logFuelGeolocationDev(
  event: string,
  details: FuelGeolocationDiagnosticDetails = {}
) {
  if (!isDevelopment) return;

  console.debug("[fuel-geolocation]", {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });
}
