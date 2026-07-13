"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/components/layout/AppShell";
import { loadFuelRecords } from "@/src/services/fuelService";
import { calculateFuelCycles, formatFuelNumber, getConfidence } from "@/src/utils/fuelCalculations";
import type { FuelRecord } from "@/src/types/fuel";

const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

export default function FuelAnalyticsPage() {
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  useEffect(() => { loadFuelRecords().then(setRecords).catch(console.error); }, []);

  const filtered = useMemo(() => records.filter((record) => record.recorded_at.startsWith(month)), [records, month]);
  const cycles = useMemo(() => calculateFuelCycles(records).filter((cycle) => filtered.some((record) => record.id === cycle.endRecordId)), [records, filtered]);
  const cards = [
    ["Gasto", `R$ ${formatFuelNumber(filtered.reduce((sum, record) => sum + record.total_value, 0))}`],
    ["Litros", formatFuelNumber(filtered.reduce((sum, record) => sum + record.liters, 0), 3)],
    ["Preço médio/L", `R$ ${formatFuelNumber(avg(filtered.map((record) => record.price_per_liter)), 3)}`],
    ["Consumo médio", cycles.length ? `${formatFuelNumber(avg(cycles.map((cycle) => cycle.consumptionKmPerLiter)))} km/l` : "—"],
    ["Custo médio/km", cycles.length ? `R$ ${formatFuelNumber(avg(cycles.map((cycle) => cycle.costPerKm)), 3)}` : "—"],
    ["Abastecimentos", String(filtered.length)],
  ];
  const vehicleIds = [...new Set(filtered.map((record) => record.vehicle_id))];
  const stationIds = [...new Set(filtered.map((record) => record.fuel_station_id).filter((id): id is string => id !== null))];

  return <AppShell><div className="space-y-6">
    <div className="flex items-end justify-between"><div><h1 className="text-3xl font-bold text-white">Indicadores de combustível</h1><p className="text-slate-400">Confiança geral: {getConfidence(cycles.length)} ({cycles.length} ciclos válidos)</p></div><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-xl bg-slate-900 p-3 text-white" /></div>
    <div className="grid gap-4 md:grid-cols-3">{cards.map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-slate-900 p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value}</p></div>)}</div>
    <section><h2 className="mb-3 text-xl font-bold text-white">Por veículo</h2><div className="grid gap-3 md:grid-cols-2">{vehicleIds.map((id) => { const vehicleRecords = filtered.filter((record) => record.vehicle_id === id); const vehicleCycles = cycles.filter((cycle) => cycle.vehicleId === id); return <div key={id} className="rounded-xl border border-white/10 p-4 text-slate-300"><b className="text-white">{vehicleRecords[0]?.vehicle?.name}</b><p>Gasto: R$ {formatFuelNumber(vehicleRecords.reduce((sum, record) => sum + record.total_value, 0))} · Litros: {formatFuelNumber(vehicleRecords.reduce((sum, record) => sum + record.liters, 0), 3)}</p><p>Consumo: {vehicleCycles.length ? formatFuelNumber(avg(vehicleCycles.map((cycle) => cycle.consumptionKmPerLiter))) : "—"} km/l · Confiança: {getConfidence(vehicleCycles.length)}</p><p>Último hodômetro: {formatFuelNumber(Math.max(...vehicleRecords.map((record) => record.odometer)), 1)}</p></div>; })}</div></section>
    <section><h2 className="mb-3 text-xl font-bold text-white">Por posto</h2><div className="grid gap-3 md:grid-cols-2">{stationIds.map((id) => { const stationRecords = filtered.filter((record) => record.fuel_station_id === id); const stationCycles = cycles.filter((cycle) => cycle.fuelStationId === id); return <div key={id} className="rounded-xl border border-white/10 p-4 text-slate-300"><b className="text-white">{stationRecords[0]?.station?.name}</b><p>{stationRecords.length} abastecimentos · R$ {formatFuelNumber(avg(stationRecords.map((record) => record.price_per_liter)), 3)}/l</p><p>Consumo: {stationCycles.length ? formatFuelNumber(avg(stationCycles.map((cycle) => cycle.consumptionKmPerLiter))) : "—"} km/l · Confiança: {getConfidence(stationCycles.length)}</p>{stationRecords[0]?.station?.google_rating && <p>Google: {formatFuelNumber(stationRecords[0].station.google_rating, 1)}</p>}</div>; })}</div></section>
  </div></AppShell>;
}
