"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/app/components/layout/AppShell";
import { loadFuelRecords } from "@/src/services/fuelService";
import { calculateFuelCycles, formatFuelNumber } from "@/src/utils/fuelCalculations";
import type { FuelRecord } from "@/src/types/fuel";

export default function FuelRecordsPage() {
  const [records, setRecords] = useState<FuelRecord[]>([]); const [error, setError] = useState("");
  const [search, setSearch] = useState(""); const [vehicle, setVehicle] = useState(""); const [station, setStation] = useState("");
  const [fuel, setFuel] = useState(""); const [fullTank, setFullTank] = useState(""); const [month, setMonth] = useState("");
  useEffect(() => { loadFuelRecords().then(setRecords).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erro ao carregar.")); }, []);
  const cyclesByEnd = useMemo(() => new Map(calculateFuelCycles(records).map((cycle) => [cycle.endRecordId, cycle])), [records]);
  const filtered = useMemo(() => records.filter((r) => {
    const date = r.transaction?.due_date ?? r.created_at; const text = `${r.vehicle?.name} ${r.station?.name} ${r.fuel_type} ${r.transaction?.description}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (!vehicle || r.vehicle_id === vehicle) && (!station || r.station_id === station) && (!fuel || r.fuel_type === fuel) && (!fullTank || String(r.full_tank) === fullTank) && (!month || date.startsWith(month));
  }).sort((a,b) => (b.transaction?.due_date ?? b.created_at).localeCompare(a.transaction?.due_date ?? a.created_at)), [records, search, vehicle, station, fuel, fullTank, month]);
  const unique = <T extends string>(values: T[]) => [...new Set(values)];
  return <AppShell><div className="space-y-6"><div className="flex items-center justify-between"><div><h1 className="text-3xl font-bold text-white">Abastecimentos</h1><p className="text-sm text-slate-400">Histórico integrado aos lançamentos financeiros.</p></div><Link href="/transactions?new=fuel" className="rounded-xl bg-amber-500 px-4 py-3 font-semibold text-slate-950">Novo abastecimento</Link></div>
    {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</p>}
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 md:grid-cols-3 lg:grid-cols-6"><input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="rounded-lg bg-slate-950 p-3 text-white"/><input placeholder="Buscar" value={search} onChange={e=>setSearch(e.target.value)} className="rounded-lg bg-slate-950 p-3 text-white"/>
    <select value={vehicle} onChange={e=>setVehicle(e.target.value)} className="rounded-lg bg-slate-950 p-3 text-white"><option value="">Todos os veículos</option>{unique(records.map(r=>r.vehicle_id)).map(id=><option key={id} value={id}>{records.find(r=>r.vehicle_id===id)?.vehicle?.name}</option>)}</select>
    <select value={station} onChange={e=>setStation(e.target.value)} className="rounded-lg bg-slate-950 p-3 text-white"><option value="">Todos os postos</option>{unique(records.map(r=>r.station_id)).map(id=><option key={id} value={id}>{records.find(r=>r.station_id===id)?.station?.name}</option>)}</select>
    <select value={fuel} onChange={e=>setFuel(e.target.value)} className="rounded-lg bg-slate-950 p-3 text-white"><option value="">Combustíveis</option>{unique(records.map(r=>r.fuel_type)).map(v=><option key={v}>{v}</option>)}</select><select value={fullTank} onChange={e=>setFullTank(e.target.value)} className="rounded-lg bg-slate-950 p-3 text-white"><option value="">Tanque cheio?</option><option value="true">Sim</option><option value="false">Não</option></select></div>
    <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="min-w-full text-sm text-slate-300"><thead className="bg-slate-900 text-left"><tr>{["Data","Veículo","Posto","Combustível","Odômetro","Litros","Preço/L","Total","Cheio","km/l","Custo/km",""].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{filtered.map(r=>{const c=cyclesByEnd.get(r.id);return <tr key={r.id} className="border-t border-white/10"><td className="p-3">{new Date(`${r.transaction?.due_date ?? r.created_at}T12:00:00`).toLocaleDateString("pt-BR")}</td><td className="p-3">{r.vehicle?.name}</td><td className="p-3">{r.station?.name}</td><td className="p-3">{r.fuel_type}</td><td className="p-3">{formatFuelNumber(r.odometer,1)}</td><td className="p-3">{formatFuelNumber(r.liters,3)}</td><td className="p-3">R$ {formatFuelNumber(r.price_per_liter,3)}</td><td className="p-3">R$ {formatFuelNumber(r.total_value)}</td><td className="p-3">{r.full_tank?"Sim":"Não"}</td><td className="p-3">{c?formatFuelNumber(c.consumptionKmPerLiter):"—"}</td><td className="p-3">{c?`R$ ${formatFuelNumber(c.costPerKm,3)}`:"—"}</td><td className="p-3"><Link className="text-cyan-300" href={`/transactions?edit=${r.transaction_id}`}>Editar</Link></td></tr>})}</tbody></table>{!filtered.length&&<p className="p-8 text-center text-slate-500">Nenhum abastecimento encontrado.</p>}</div></div></AppShell>;
}

