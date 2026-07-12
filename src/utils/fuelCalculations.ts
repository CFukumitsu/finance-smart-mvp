import type { FuelCycle, FuelRecord } from "@/src/types/fuel";

export function calculateFuelCycles(records: FuelRecord[]): FuelCycle[] {
  const cycles: FuelCycle[] = [];
  const byVehicle = new Map<string, FuelRecord[]>();
  records.forEach((record) => byVehicle.set(record.vehicle_id, [...(byVehicle.get(record.vehicle_id) ?? []), record]));

  byVehicle.forEach((vehicleRecords, vehicleId) => {
    const ordered = [...vehicleRecords].sort((a, b) => {
      const dateA = a.transaction?.due_date ?? a.created_at;
      const dateB = b.transaction?.due_date ?? b.created_at;
      return dateA.localeCompare(dateB) || a.created_at.localeCompare(b.created_at);
    });
    let start: FuelRecord | null = null;
    let liters = 0;
    let totalValue = 0;
    for (const record of ordered) {
      if (!Number.isFinite(record.odometer) || !Number.isFinite(record.liters) || record.liters <= 0) {
        start = null; liters = 0; totalValue = 0; continue;
      }
      if (!start) { if (record.full_tank) start = record; continue; }
      liters += record.liters;
      totalValue += record.total_value;
      if (!record.full_tank) continue;
      const distance = record.odometer - start.odometer;
      if (distance > 0 && liters > 0) {
        cycles.push({ vehicleId, startRecordId: start.id, endRecordId: record.id, distance, liters,
          totalValue, consumptionKmPerLiter: distance / liters, costPerKm: totalValue / distance,
          stationId: record.station_id });
      }
      start = record; liters = 0; totalValue = 0;
    }
  });
  return cycles;
}

export function getConfidence(validCycles: number) {
  if (validCycles >= 5) return "Alta" as const;
  if (validCycles >= 2) return "Média" as const;
  if (validCycles === 1) return "Baixa" as const;
  return "Sem amostra" as const;
}

export const formatFuelNumber = (value: number, digits = 2) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

export function parsePtBrNumber(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

