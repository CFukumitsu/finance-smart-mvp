import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildNearbyFuelStationSearchParams, calculateDistanceMeters, calculateNearbyFuelStationSearchRadius, calculateStationMatchRadius, findNearestRegisteredStation, FUEL_STATION_MATCH_BASE_RADIUS_METERS, FUEL_STATION_MATCH_MAXIMUM_ACCURACY_METERS, FUEL_STATION_MATCH_MAXIMUM_RADIUS_METERS, MAXIMUM_NEARBY_FUEL_STATION_RADIUS_METERS, NEARBY_HIGH_ACCURACY_TIMEOUT_MS, PREFERRED_NEARBY_LOCATION_ACCURACY_METERS, sortFuelStationsByDistance, suggestNearestFuelStation, toCoordinate, type StationWithCoordinates } from "./fuelStationProximity.ts";

const origin = { latitude: -23.55052, longitude: -46.633308 };

test("mantém uma janela real para o GPS refinar a localização de postos", () => {
  assert.equal(PREFERRED_NEARBY_LOCATION_ACCURACY_METERS, 100);
  assert.equal(NEARBY_HIGH_ACCURACY_TIMEOUT_MS, 60_000);
});

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
  ], 90);

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

// 1 grau de latitude no raio médio usado pelo Haversine (6.371 km).
const METERS_PER_LATITUDE_DEGREE = (6_371_000 * Math.PI) / 180;

function stationNorthOf(id: string, meters: number, overrides: Partial<StationWithCoordinates> = {}) {
  return station(id, origin.latitude + meters / METERS_PER_LATITUDE_DEGREE, origin.longitude, overrides);
}

test("sugere o posto quando o usuário está exatamente nele", () => {
  const suggestion = suggestNearestFuelStation(origin, 10, [stationNorthOf("here", 0)]);

  assert.equal(suggestion.status, "matched");
  assert.equal(suggestion.status === "matched" && suggestion.station.id, "here");
  assert.ok(suggestion.status === "matched" && suggestion.distanceMeters < 1);
});

test("sugere o posto próximo e ignora os distantes (exemplo 120 m / 850 m / 2,4 km)", () => {
  const suggestion = suggestNearestFuelStation(origin, 20, [
    stationNorthOf("C", 2_400),
    stationNorthOf("B", 850),
    stationNorthOf("A", 120),
  ]);

  assert.equal(suggestion.status, "matched");
  assert.equal(suggestion.status === "matched" && suggestion.station.id, "A");
  assert.ok(suggestion.status === "matched" && Math.round(suggestion.distanceMeters) === 120);
});

test("com dois postos próximos escolhe o mais perto", () => {
  const suggestion = suggestNearestFuelStation(origin, 15, [
    stationNorthOf("second", 90),
    stationNorthOf("first", 40),
  ]);

  assert.equal(suggestion.status === "matched" && suggestion.station.id, "first");
});

test("não sugere nada quando nenhum posto está dentro do raio", () => {
  const suggestion = suggestNearestFuelStation(origin, 20, [
    stationNorthOf("B", 850),
    stationNorthOf("C", 2_400),
  ]);

  assert.deepEqual(suggestion, { status: "none-nearby", radiusMeters: 170 });
});

test("a precisão do GPS amplia o raio: posto real não é perdido por leitura de ±200 m", () => {
  // Antes o raio era fixo em 100 m e este posto era descartado.
  const suggestion = suggestNearestFuelStation(origin, 200, [stationNorthOf("real", 280)]);

  assert.equal(suggestion.status === "matched" && suggestion.station.id, "real");
  assert.equal(suggestion.status === "matched" && suggestion.radiusMeters, 350);
});

test("o raio de sugestão nunca ultrapassa o teto configurado", () => {
  assert.equal(calculateStationMatchRadius(0), FUEL_STATION_MATCH_BASE_RADIUS_METERS);
  assert.equal(calculateStationMatchRadius(FUEL_STATION_MATCH_MAXIMUM_ACCURACY_METERS), FUEL_STATION_MATCH_MAXIMUM_RADIUS_METERS);
  assert.ok(FUEL_STATION_MATCH_MAXIMUM_RADIUS_METERS < 850);
});

test("localização imprecisa demais não sugere posto", () => {
  const suggestion = suggestNearestFuelStation(origin, 900, [stationNorthOf("here", 0)]);

  assert.deepEqual(suggestion, { status: "inaccurate", accuracyMeters: 900 });
  assert.equal(calculateStationMatchRadius(Number.NaN), null);
  assert.equal(calculateStationMatchRadius(-1), null);
});

test("postos sem latitude/longitude são ignorados e o motivo é informado", () => {
  assert.deepEqual(
    suggestNearestFuelStation(origin, 10, [station("missing", null, null), station("half", origin.latitude, null)]),
    { status: "no-stations-with-location" }
  );

  const suggestion = suggestNearestFuelStation(origin, 10, [station("missing", null, null), stationNorthOf("located", 60)]);
  assert.equal(suggestion.status === "matched" && suggestion.station.id, "located");
});

test("coordenadas de origem inválidas não sugerem posto", () => {
  const stations = [stationNorthOf("here", 0)];

  assert.deepEqual(suggestNearestFuelStation({ latitude: Number.NaN, longitude: origin.longitude }, 10, stations), { status: "invalid-origin" });
  assert.deepEqual(suggestNearestFuelStation({ latitude: 91, longitude: origin.longitude }, 10, stations), { status: "invalid-origin" });
  assert.deepEqual(suggestNearestFuelStation({ latitude: origin.latitude, longitude: -181 }, 10, stations), { status: "invalid-origin" });
});

test("normaliza coordenadas vindas do banco como number ou string", () => {
  assert.equal(toCoordinate(-23.5505), -23.5505);
  assert.equal(toCoordinate("-23.5505200"), -23.55052);
  assert.equal(toCoordinate("-46,6333"), -46.6333);
  assert.equal(toCoordinate(null), null);
  assert.equal(toCoordinate(""), null);
  assert.equal(toCoordinate("abc"), null);
  assert.equal(toCoordinate(Number.POSITIVE_INFINITY), null);
});

test("posto com coordenada em string não normalizada é ignorado com segurança", () => {
  const raw = { ...stationNorthOf("raw", 0), latitude: String(origin.latitude) as unknown as number };

  assert.deepEqual(suggestNearestFuelStation(origin, 10, [raw]), { status: "no-stations-with-location" });
});
