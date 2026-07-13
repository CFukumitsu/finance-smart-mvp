import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import type {
  FuelRecord,
  GoogleFuelStationDetails,
  NearbyFuelStation,
} from "@/src/types/fuel";

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
  radius = 3000
): Promise<NearbyFuelStation[]> {
  const searchParams = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude),
    radius: String(radius),
  });

  const response = await fetch(
    `/api/maps/nearby-fuel-stations?${searchParams.toString()}`,
    { cache: "no-store" }
  );
  const data = await readApiResponse<{ places?: NearbyFuelStation[] }>(
    response
  );

  return data.places ?? [];
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

export async function loadFuelRecords(): Promise<FuelRecord[]> {
  const ownerId = await getCurrentUserId();
  const { data, error } = await supabase.from("fuel_records").select(`id, transaction_id, vehicle_id, fuel_station_id, fuel_type, odometer, liters, price_per_liter, total_value, full_tank, latitude, longitude, recorded_at, created_at, transaction:transactions!fuel_records_transaction_id_fkey(due_date, description), vehicle:vehicles!fuel_records_vehicle_id_fkey(name), station:fuel_stations!fuel_records_fuel_station_id_fkey(name, google_rating)`).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FuelRecord[];
}

export async function removeFuelRecordForTransaction(transactionId: string) {
  const ownerId = await getCurrentUserId();
  const { error } = await supabase.from("fuel_records").delete().eq("transaction_id", transactionId).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
}
