export type FuelSpecialType = "fuel" | "vehicle_maintenance" | "parking" | "toll" | "vehicle_insurance";

export type FuelRecord = {
  id: string; transaction_id: string; vehicle_id: string; station_id: string; fuel_type: string;
  odometer: number; liters: number; price_per_liter: number; total_value: number; full_tank: boolean;
  latitude: number | null; longitude: number | null; notes: string | null; created_at: string;
  transaction?: { due_date: string; description: string } | null;
  vehicle?: { name: string } | null;
  station?: { name: string; google_rating?: number | null } | null;
};

export type FuelCycle = {
  vehicleId: string; startRecordId: string; endRecordId: string; distance: number; liters: number;
  totalValue: number; consumptionKmPerLiter: number; costPerKm: number; stationId: string;
};

