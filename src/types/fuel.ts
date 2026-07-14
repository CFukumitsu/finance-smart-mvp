export type FuelSpecialType = "fuel" | "vehicle_maintenance" | "parking" | "toll" | "vehicle_insurance";

export type FuelStationType = "registered" | "generic";

export type FuelStationOption = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  station_type: FuelStationType;
};

export type FuelRecord = {
  id: string; transaction_id: string; vehicle_id: string; fuel_station_id: string | null; fuel_type: string;
  odometer: number; liters: number; price_per_liter: number; total_value: number; full_tank: boolean;
  latitude: number | null; longitude: number | null; recorded_at: string; created_at: string;
  transaction?: { due_date: string; description: string } | null;
  vehicle?: { name: string } | null;
  station?: { name: string; google_rating?: number | null } | null;
};

export type FuelCycle = {
  vehicleId: string; startRecordId: string; endRecordId: string; distance: number; liters: number;
  totalValue: number; consumptionKmPerLiter: number; costPerKm: number; fuelStationId: string | null;
};

export type NearbyFuelStation = {
  googlePlaceId: string;
  name: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  rating: number | null;
  userRatingCount: number;
  businessStatus: string | null;
  primaryType: string | null;
  googleMapsUri: string | null;
};

export type GoogleFuelStationDetails = Omit<
  NearbyFuelStation,
  "distanceMeters"
> & {
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string | null;
  website: string | null;
};
