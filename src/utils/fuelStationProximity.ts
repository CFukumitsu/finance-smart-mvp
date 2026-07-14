export const NEARBY_REGISTERED_STATION_RADIUS_METERS = 100;

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

function isValidCoordinate(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
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
  maximumDistanceMeters = NEARBY_REGISTERED_STATION_RADIUS_METERS
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
