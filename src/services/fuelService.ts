import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import type {
  FuelRecord,
  FuelStationOption,
  GoogleFuelStationDetails,
  NearbyFuelStation,
} from "@/src/types/fuel";
import {
  isMissingFuelStationTypeColumn,
  isMissingGenericFuelStationFunction,
  withCompatibleFuelStationType,
} from "@/src/utils/fuelStationCompatibility";
import {
  buildNearbyFuelStationSearchParams,
  sortFuelStationsByDistance,
  toCoordinate,
} from "@/src/utils/fuelStationProximity";
import { logFuelGeolocationDev } from "@/src/utils/fuelGeolocationDiagnostics";
import { getSuggestedFuelFormPatch } from "@/src/utils/fuelTransactionDefaults";

export const INITIAL_NEARBY_FUEL_STATION_RADIUS_METERS = 1500;

export async function loadActiveFuelStations(): Promise<FuelStationOption[]> {
  const ownerId = await getCurrentUserId();
  let { data, error } = await supabase
    .from("fuel_stations")
    .select("id,name,latitude,longitude,active,station_type,google_place_id")
    .eq("owner_id", ownerId)
    .eq("active", true)
    .order("station_type", { ascending: false })
    .order("name", { ascending: true });

  if (isMissingFuelStationTypeColumn(error)) {
    const legacyResponse = await supabase
      .from("fuel_stations")
      .select("id,name,latitude,longitude,active,google_place_id")
      .eq("owner_id", ownerId)
      .eq("active", true)
      .order("name", { ascending: true });

    data = legacyResponse.data as typeof data;
    error = legacyResponse.error;
  }

  if (error) throw new Error(error.message);
  return (data ?? []).map((station) => ({
    ...withCompatibleFuelStationType(station),
    latitude: toCoordinate(station.latitude),
    longitude: toCoordinate(station.longitude),
  })) as FuelStationOption[];
}

// O posto genérico "Outros postos" é um recurso opcional: sem a migration que
// cria a RPC, o abastecimento segue funcionando com "Sem posto" ou escolha manual.
export async function ensureGenericFuelStation(): Promise<FuelStationOption | null> {
  const { data, error } = await supabase.rpc("ensure_generic_fuel_station");

  if (isMissingGenericFuelStationFunction(error)) {
    logFuelGeolocationDev("generic_station_unavailable", {
      reason: "rpc-missing",
      code: error?.code,
    });
    return null;
  }

  if (error) throw new Error(error.message);

  const station = Array.isArray(data) ? data[0] : data;

  if (!station?.id) {
    throw new Error("Não foi possível preparar o posto genérico.");
  }

  return station as FuelStationOption;
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || "Não foi possível consultar o Google Places.");
  }

  return data;
}

export async function searchNearbyFuelStations(
  latitude: number,
  longitude: number,
  radius = INITIAL_NEARBY_FUEL_STATION_RADIUS_METERS
): Promise<NearbyFuelStation[]> {
  const searchParams = buildNearbyFuelStationSearchParams(
    { latitude, longitude },
    radius
  );

  if (!searchParams) {
    throw new Error("A localização precisa estar pronta antes de buscar postos próximos.");
  }

  const endpoint = `/api/maps/nearby-fuel-stations?${searchParams.toString()}`;
  const startedAt = Date.now();
  logFuelGeolocationDev("nearby_stations_request_started", {
    endpoint,
    latitude,
    longitude,
    radius,
  });

  const response = await fetch(
    endpoint,
    { cache: "no-store" }
  );
  logFuelGeolocationDev("nearby_stations_endpoint_response", {
    endpoint,
    status: response.status,
    ok: response.ok,
    elapsedMs: Date.now() - startedAt,
  });
  const data = await readApiResponse<{ places?: NearbyFuelStation[] }>(
    response
  );

  const places = sortFuelStationsByDistance(data.places ?? []);
  logFuelGeolocationDev("nearby_stations_request_completed", {
    endpoint,
    count: places.length,
    elapsedMs: Date.now() - startedAt,
  });
  return places;
}

export async function loadGoogleFuelStationDetails(
  googlePlaceId: string
): Promise<GoogleFuelStationDetails> {
  const response = await fetch(
    `/api/maps/place-details?placeId=${encodeURIComponent(googlePlaceId)}`,
    { cache: "no-store" }
  );

  return readApiResponse<GoogleFuelStationDetails>(response);
}

// Cadastra (ou reaproveita) um posto encontrado pelo Google a partir do
// lançamento, com os mesmos dados que o cadastro de postos grava.
export async function registerFuelStationFromGoogle(
  googlePlaceId: string
): Promise<{ id: string; name: string; created: boolean }> {
  const ownerId = await getCurrentUserId();

  const findExisting = async () => {
    const { data, error } = await supabase
      .from("fuel_stations")
      .select("id,name,active")
      .eq("owner_id", ownerId)
      .eq("google_place_id", googlePlaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  };

  const existing = await findExisting();
  if (existing) {
    if (!existing.active) {
      const { error } = await supabase
        .from("fuel_stations")
        .update({ active: true })
        .eq("id", existing.id)
        .eq("owner_id", ownerId);
      if (error) throw new Error(error.message);
    }
    return { id: existing.id, name: existing.name, created: false };
  }

  const details = await loadGoogleFuelStationDetails(googlePlaceId);
  const postalDigits = details.postalCode.replace(/\D/g, "").slice(0, 8);
  const { data, error } = await supabase
    .from("fuel_stations")
    .insert({
      owner_id: ownerId,
      name: details.name,
      brand: null,
      address: details.address || details.formattedAddress || null,
      neighborhood: details.neighborhood || null,
      city: details.city || null,
      state: details.state.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || null,
      postal_code:
        postalDigits.length > 5
          ? `${postalDigits.slice(0, 5)}-${postalDigits.slice(5)}`
          : postalDigits || null,
      latitude: details.latitude,
      longitude: details.longitude,
      google_place_id: details.googlePlaceId,
      google_maps_uri: details.googleMapsUri,
      google_rating: details.rating,
      google_user_rating_count: details.userRatingCount,
      google_business_status: details.businessStatus,
      google_primary_type: details.primaryType,
      google_display_name: details.name,
      google_formatted_address: details.formattedAddress || null,
      google_last_synced_at: new Date().toISOString(),
      active: true,
    })
    .select("id,name")
    .single();

  if (error) {
    // Cadastro concorrente do mesmo Place ID: reaproveita o existente.
    if (error.code === "23505") {
      const concurrent = await findExisting();
      if (concurrent) return { id: concurrent.id, name: concurrent.name, created: false };
    }
    throw new Error(error.message);
  }

  return { id: data.id, name: data.name, created: true };
}

export async function loadFuelRecords(): Promise<FuelRecord[]> {
  const ownerId = await getCurrentUserId();
  const { data, error } = await supabase.from("fuel_records").select(`id, transaction_id, vehicle_id, fuel_station_id, fuel_type, odometer, liters, price_per_liter, total_value, full_tank, latitude, longitude, recorded_at, created_at, transaction:transactions!fuel_records_transaction_id_fkey(due_date, description), vehicle:vehicles!fuel_records_vehicle_id_fkey(name), station:fuel_stations!fuel_records_fuel_station_id_fkey(name, google_rating)`).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FuelRecord[];
}

// Base para preencher um novo abastecimento a partir de uma descrição sugerida.
// É apenas uma conveniência: qualquer falha resulta em nenhum preenchimento.
export async function loadSuggestedFuelFormPatch(
  transactionId: string,
  ownerId: string
) {
  const { data, error } = await supabase
    .from("fuel_records")
    .select("vehicle_id, fuel_type, vehicle:vehicles!fuel_records_vehicle_id_fkey(active)")
    .eq("transaction_id", transactionId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    console.warn("Não foi possível reaproveitar o último abastecimento:", error);
    return {};
  }
  if (!data) return {};

  const vehicle = Array.isArray(data.vehicle) ? data.vehicle[0] : data.vehicle;
  return getSuggestedFuelFormPatch({
    vehicle_id: data.vehicle_id,
    fuel_type: data.fuel_type,
    vehicle_active: vehicle?.active === true,
  });
}

export async function removeFuelRecordForTransaction(transactionId: string) {
  const ownerId = await getCurrentUserId();
  const { error } = await supabase.from("fuel_records").delete().eq("transaction_id", transactionId).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
}
