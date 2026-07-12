import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import type { FuelRecord } from "@/src/types/fuel";

export async function loadFuelRecords(): Promise<FuelRecord[]> {
  const ownerId = await getCurrentUserId();
  const { data, error } = await supabase.from("fuel_records").select(`id, transaction_id, vehicle_id, station_id, fuel_type, odometer, liters, price_per_liter, total_value, full_tank, latitude, longitude, notes, created_at, transaction:transactions!fuel_records_transaction_id_fkey(due_date, description), vehicle:vehicles!fuel_records_vehicle_id_fkey(name), station:fuel_stations!fuel_records_station_id_fkey(name, google_rating)`).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FuelRecord[];
}

export async function removeFuelRecordForTransaction(transactionId: string) {
  const ownerId = await getCurrentUserId();
  const { error } = await supabase.from("fuel_records").delete().eq("transaction_id", transactionId).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
}

