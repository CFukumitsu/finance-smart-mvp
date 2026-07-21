import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildNearbyFuelStationSearchParams, calculateDistanceMeters, calculateNearbyFuelStationSearchRadius, findNearestRegisteredStation, MAXIMUM_NEARBY_FUEL_STATION_RADIUS_METERS, NEARBY_REGISTERED_STATION_RADIUS_METERS, sortFuelStationsByDistance, type StationWithCoordinates } from "./fuelStationProximity.ts";

const origin = { latitude: -23.55052, longitude: -46.633308 };

function station(
  id: string,
  latitude: number | null,
  longitude: number | null,
  overrides: Partial<StationWithCoordinates> = {}
): StationWithCoordinates {
  return {
    id,
    latitude,
    longitude,
    active: true,
    station_type: "registered",
    ...overrides,
  };
}

test("calcula distância em metros com Haversine", () => {
  const distance = calculateDistanceMeters(origin, {
    latitude: -23.549621,
    longitude: -46.633308,
  });

  assert.ok(distance > 99 && distance < 101);
});

test("seleciona o posto válido realmente mais próximo", () => {
  const nearest = findNearestRegisteredStation(origin, [
    station("farther", -23.55007, -46.633308),
    station("nearest", -23.55034, -46.633308),
  ]);

  assert.equal(nearest?.station.id, "nearest");
  assert.ok((nearest?.distanceMeters ?? 0) < 25);
});

test("não seleciona posto além do raio máximo", () => {
  const nearest = findNearestRegisteredStation(origin, [
    station("outside", -23.54961, -46.633308),
  ]);

  assert.equal(NEARBY_REGISTERED_STATION_RADIUS_METERS, 100);
  assert.equal(nearest, null);
});

test("ignora genérico, inativo e coordenadas inválidas", () => {
  const nearest = findNearestRegisteredStation(origin, [
    station("generic", origin.latitude, origin.longitude, {
      station_type: "generic",
    }),
    station("inactive", origin.latitude, origin.longitude, { active: false }),
    station("missing", null, null),
    station("invalid", 200, origin.longitude),
  ]);

  assert.equal(nearest, null);
});

test("ordena resultados da busca por proximidade e deixa distância ausente por último", () => {
  const sorted = sortFuelStationsByDistance([
    { id: "far", distanceMeters: 900 },
    { id: "unknown", distanceMeters: null },
    { id: "near", distanceMeters: 120 },
  ]);

  assert.deepEqual(sorted.map((item) => item.id), ["near", "far", "unknown"]);
});

test("não prepara consulta de postos antes de existir coordenada válida", () => {
  assert.equal(buildNearbyFuelStationSearchParams({ latitude: Number.NaN, longitude: origin.longitude }, 1500), null);
  assert.equal(buildNearbyFuelStationSearchParams({ latitude: origin.latitude, longitude: 181 }, 1500), null);
});

test("prepara a consulta somente com coordenada validada", () => {
  const params = buildNearbyFuelStationSearchParams(origin, 1500);
  assert.equal(params?.get("lat"), String(origin.latitude));
  assert.equal(params?.get("lng"), String(origin.longitude));
  assert.equal(params?.get("radius"), "1500");
});

test("amplia o raio da busca para compensar a imprecisão da localização", () => {
  assert.equal(calculateNearbyFuelStationSearchRadius(2_000, 1_500), 3_500);
  assert.equal(
    calculateNearbyFuelStationSearchRadius(9_000, 1_500),
    MAXIMUM_NEARBY_FUEL_STATION_RADIUS_METERS
  );
});

test("rejeita valores inválidos ao calcular o raio da busca", () => {
  assert.equal(calculateNearbyFuelStationSearchRadius(Number.NaN, 1_500), null);
  assert.equal(calculateNearbyFuelStationSearchRadius(100, 0), null);
});
