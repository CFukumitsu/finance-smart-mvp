// Raio base cobre o terreno do posto e a diferença entre o pino do Google
// (normalmente na loja) e as bombas. A precisão reportada pelo GPS é somada
// para que um posto real não seja descartado apenas pela incerteza da leitura.
export const FUEL_STATION_MATCH_BASE_RADIUS_METERS = 150;
export const FUEL_STATION_MATCH_MAXIMUM_RADIUS_METERS = 400;
// Acima desta imprecisão a posição não identifica um posto com segurança.
export const FUEL_STATION_MATCH_MAXIMUM_ACCURACY_METERS = 250;
export const PREFERRED_NEARBY_LOCATION_ACCURACY_METERS = 100;
export const MAXIMUM_NEARBY_FUEL_STATION_RADIUS_METERS = 5_000;
export const NEARBY_HIGH_ACCURACY_TIMEOUT_MS = 60_000;
export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type StationWithCoordinates = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  station_type: "registered" | "generic";
};

export function sortFuelStationsByDistance<T extends { distanceMeters: number | null }>(
  stations: T[]
) {
  return [...stations].sort((first, second) => {
    if (first.distanceMeters === null) return 1;
    if (second.distanceMeters === null) return -1;
    return first.distanceMeters - second.distanceMeters;
  });
}

function isValidCoordinate(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

// Colunas numeric podem chegar como string conforme o cliente/serialização.
export function toCoordinate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;

  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasValidCoordinates(
  value: { latitude: number | null; longitude: number | null }
): value is Coordinates {
  return (
    value.latitude !== null &&
    value.longitude !== null &&
    isValidCoordinate(value.latitude, -90, 90) &&
    isValidCoordinate(value.longitude, -180, 180)
  );
}

export function buildNearbyFuelStationSearchParams(
  coordinates: Coordinates,
  radius: number
) {
  if (!hasValidCoordinates(coordinates) || !Number.isFinite(radius) || radius <= 0) {
    return null;
  }

  return new URLSearchParams({
    lat: String(coordinates.latitude),
    lng: String(coordinates.longitude),
    radius: String(radius),
  });
}

export function calculateNearbyFuelStationSearchRadius(
  accuracyMeters: number,
  baseRadiusMeters: number
) {
  if (
    !Number.isFinite(accuracyMeters) ||
    accuracyMeters < 0 ||
    !Number.isFinite(baseRadiusMeters) ||
    baseRadiusMeters <= 0
  ) {
    return null;
  }

  return Math.min(
    Math.ceil(baseRadiusMeters + accuracyMeters),
    MAXIMUM_NEARBY_FUEL_STATION_RADIUS_METERS
  );
}

export function calculateDistanceMeters(
  origin: Coordinates,
  destination: Coordinates
) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    earthRadiusMeters *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function findNearestRegisteredStation<T extends StationWithCoordinates>(
  origin: Coordinates,
  stations: T[],
  maximumDistanceMeters = FUEL_STATION_MATCH_BASE_RADIUS_METERS
) {
  if (!hasValidCoordinates(origin) || maximumDistanceMeters < 0) {
    return null;
  }

  let nearest: { station: T; distanceMeters: number } | null = null;

  for (const station of stations) {
    if (
      !station.active ||
      station.station_type !== "registered" ||
      !hasValidCoordinates(station)
    ) {
      continue;
    }

    const distanceMeters = calculateDistanceMeters(origin, station);

    if (
      distanceMeters <= maximumDistanceMeters &&
      (!nearest || distanceMeters < nearest.distanceMeters)
    ) {
      nearest = { station, distanceMeters };
    }
  }

  return nearest;
}

export function calculateStationMatchRadius(accuracyMeters: number) {
  if (
    !Number.isFinite(accuracyMeters) ||
    accuracyMeters < 0 ||
    accuracyMeters > FUEL_STATION_MATCH_MAXIMUM_ACCURACY_METERS
  ) {
    return null;
  }

  return Math.min(
    Math.ceil(FUEL_STATION_MATCH_BASE_RADIUS_METERS + accuracyMeters),
    FUEL_STATION_MATCH_MAXIMUM_RADIUS_METERS
  );
}

export type FuelStationSuggestion<T> =
  | { status: "matched"; station: T; distanceMeters: number; radiusMeters: number }
  | { status: "none-nearby"; radiusMeters: number }
  | { status: "no-stations-with-location" }
  | { status: "inaccurate"; accuracyMeters: number }
  | { status: "invalid-origin" };

export function suggestNearestFuelStation<T extends StationWithCoordinates>(
  origin: Coordinates,
  accuracyMeters: number,
  stations: T[]
): FuelStationSuggestion<T> {
  if (!hasValidCoordinates(origin)) return { status: "invalid-origin" };

  const radiusMeters = calculateStationMatchRadius(accuracyMeters);
  if (radiusMeters === null) {
    return { status: "inaccurate", accuracyMeters: Math.round(accuracyMeters) };
  }

  const hasLocatableStation = stations.some(
    (station) =>
      station.active &&
      station.station_type === "registered" &&
      hasValidCoordinates(station)
  );
  if (!hasLocatableStation) return { status: "no-stations-with-location" };

  const nearest = findNearestRegisteredStation(origin, stations, radiusMeters);
  return nearest
    ? { status: "matched", ...nearest, radiusMeters }
    : { status: "none-nearby", radiusMeters };
}

// Busca no Google quando nenhum posto cadastrado serve: o raio cobre o
// terreno do posto somado à incerteza da leitura (limitado pela API a 5 km).
export const GOOGLE_STATION_SEARCH_BASE_RADIUS_METERS = 300;
export const GOOGLE_STATION_SUGGESTION_LIMIT = 5;

export type GoogleStationSearchDecision =
  | { search: true; radiusMeters: number }
  | { search: false; reason: "matched" | "manual-selection" | "invalid-origin" };

export function decideGoogleStationSearch(
  suggestionStatus: FuelStationSuggestion<unknown>["status"],
  accuracyMeters: number,
  hasManualSelection: boolean
): GoogleStationSearchDecision {
  if (hasManualSelection) return { search: false, reason: "manual-selection" };
  if (suggestionStatus === "matched") return { search: false, reason: "matched" };
  if (suggestionStatus === "invalid-origin") {
    return { search: false, reason: "invalid-origin" };
  }

  const radiusMeters = calculateNearbyFuelStationSearchRadius(
    accuracyMeters,
    GOOGLE_STATION_SEARCH_BASE_RADIUS_METERS
  );
  return radiusMeters === null
    ? { search: false, reason: "invalid-origin" }
    : { search: true, radiusMeters };
}

export function markRegisteredGooglePlaces<
  T extends { googlePlaceId: string },
>(
  places: T[],
  stations: { id: string; google_place_id?: string | null }[],
  limit = GOOGLE_STATION_SUGGESTION_LIMIT
) {
  const stationIdByPlaceId = new Map(
    stations.flatMap((station) =>
      station.google_place_id ? [[station.google_place_id, station.id] as const] : []
    )
  );

  return places.slice(0, limit).map((place) => ({
    ...place,
    registeredStationId: stationIdByPlaceId.get(place.googlePlaceId) ?? null,
  }));
}

// Deve acompanhar o maxResultCount usado em /api/maps/nearby-fuel-stations.
export const NEARBY_FUEL_STATION_RESULT_LIMIT = 10;
const MINIMUM_NEARBY_FUEL_STATION_RADIUS_METERS = 50;

// Área circular pesquisada/visível no mapa: centro + raio em metros.
export type FuelStationSearchArea = Coordinates & { radiusMeters: number };

export function clampNearbyFuelStationSearchRadius(radiusMeters: number) {
  return Math.min(
    Math.max(Math.ceil(radiusMeters), MINIMUM_NEARBY_FUEL_STATION_RADIUS_METERS),
    MAXIMUM_NEARBY_FUEL_STATION_RADIUS_METERS
  );
}

// O Nearby Search aceita apenas círculo: o raio é a distância do centro até o
// canto do mapa, para que o círculo cubra toda a área visível (limitado a 5 km).
export function calculateViewportSearchArea(
  center: Coordinates,
  northEast: Coordinates
): FuelStationSearchArea | null {
  if (!hasValidCoordinates(center) || !hasValidCoordinates(northEast)) {
    return null;
  }

  return {
    ...center,
    radiusMeters: clampNearbyFuelStationSearchRadius(
      calculateDistanceMeters(center, northEast)
    ),
  };
}

// Com o limite de resultados atingido, só é garantido que não existem outros
// postos até a distância do resultado mais distante; abaixo do limite, o raio
// pesquisado inteiro está coberto.
export function calculateCoveredSearchArea(
  requested: FuelStationSearchArea,
  places: { distanceMeters: number | null }[],
  resultLimit = NEARBY_FUEL_STATION_RESULT_LIMIT
): FuelStationSearchArea {
  if (places.length < resultLimit) return requested;

  const farthest = places.reduce(
    (maximum, place) => Math.max(maximum, place.distanceMeters ?? 0),
    0
  );
  return { ...requested, radiusMeters: Math.min(farthest, requested.radiusMeters) };
}

export function isSearchAreaCovered(
  area: FuelStationSearchArea,
  coveredAreas: FuelStationSearchArea[]
) {
  return coveredAreas.some(
    (covered) =>
      calculateDistanceMeters(covered, area) + area.radiusMeters <=
      covered.radiusMeters
  );
}

// Pequenos ajustes de enquadramento não justificam nova consulta: exige
// deslocamento de 25% do raio visível ou zoom que mude o raio em 50%.
export function hasSearchAreaChangedRelevantly(
  previous: FuelStationSearchArea,
  next: FuelStationSearchArea
) {
  const radiusRatio = next.radiusMeters / previous.radiusMeters;
  return (
    calculateDistanceMeters(previous, next) >
      0.25 * Math.min(previous.radiusMeters, next.radiusMeters) ||
    radiusRatio > 1.5 ||
    radiusRatio < 1 / 1.5
  );
}

// Junta resultados de buscas diferentes sem duplicar o mesmo Place ID e
// recalcula a distância a partir do centro da busca mais recente.
export function mergeNearbyFuelStations<
  T extends {
    googlePlaceId: string;
    latitude: number | null;
    longitude: number | null;
    distanceMeters: number | null;
  },
>(existing: T[], incoming: T[], reference: Coordinates) {
  const byPlaceId = new Map<string, T>();

  for (const place of [...existing, ...incoming]) {
    byPlaceId.set(place.googlePlaceId, place);
  }

  return sortFuelStationsByDistance(
    [...byPlaceId.values()].map((place) => ({
      ...place,
      distanceMeters: hasValidCoordinates(place)
        ? Math.round(calculateDistanceMeters(reference, place))
        : null,
    }))
  );
}
