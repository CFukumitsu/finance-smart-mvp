"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Car,
  ChartNoAxesCombined,
  Fuel,
  Gauge,
  MapPin,
} from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { loadFuelRecords } from "@/src/services/fuelService";
import { calculateFuelCycles, formatFuelNumber } from "@/src/utils/fuelCalculations";
import type { FuelRecord } from "@/src/types/fuel";
import { getCurrentUserId, supabase } from "@/src/lib/supabase";

const moduleItems = [
  {
    title: "Abastecimentos",
    description: "Histórico dos abastecimentos dos seus veículos.",
    href: "/fuel/records",
    icon: Gauge,
  },
  {
    title: "Veículos",
    description: "Cadastro dos veículos utilizados no controle de combustível.",
    href: "/vehicles",
    icon: Car,
  },
  {
    title: "Postos",
    description: "Cadastro dos postos e respectivas localizações.",
    href: "/fuel/stations",
    icon: MapPin,
  },
  {
    title: "Indicadores",
    description: "Consumo, custo por quilômetro e rendimento por posto.",
    href: "/fuel/analytics",
    icon: ChartNoAxesCombined,
  },
];

export default function FuelPage() {
  const [records,setRecords]=useState<FuelRecord[]>([]); const [defaultVehicle,setDefaultVehicle]=useState("Nenhum veículo padrão");
  useEffect(()=>{loadFuelRecords().then(setRecords).catch(console.error);getCurrentUserId().then(owner=>supabase.from("vehicles").select("name").eq("owner_id",owner).eq("active",true).eq("is_default",true).maybeSingle()).then(({data})=>{if(data?.name)setDefaultVehicle(data.name)}).catch(console.error)},[]);
  const month=new Date().toISOString().slice(0,7); const current=useMemo(()=>records.filter(r=>(r.transaction?.due_date??r.created_at).startsWith(month)),[records,month]); const cycles=useMemo(()=>calculateFuelCycles(records),[records]); const latest=[...records].sort((a,b)=>(b.transaction?.due_date??b.created_at).localeCompare(a.transaction?.due_date??a.created_at))[0];
  const summary=[['Veículo padrão',defaultVehicle],['Último abastecimento',latest?`${latest.vehicle?.name} · ${new Date(`${latest.transaction?.due_date??latest.created_at}T12:00:00`).toLocaleDateString('pt-BR')}`:'Nenhum'],['Gasto no mês',`R$ ${formatFuelNumber(current.reduce((s,r)=>s+r.total_value,0))}`],['Litros no mês',formatFuelNumber(current.reduce((s,r)=>s+r.liters,0),3)],['Consumo médio',cycles.length?`${formatFuelNumber(cycles.reduce((s,c)=>s+c.consumptionKmPerLiter,0)/cycles.length)} km/l`:'—'],['Custo por km',cycles.length?`R$ ${formatFuelNumber(cycles.reduce((s,c)=>s+c.costPerKm,0)/cycles.length,3)}`:'—']];
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-300">
            <Fuel size={28} />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-white">
              Gestão de Combustível
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              Controle abastecimentos, veículos, postos e indicadores.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">{summary.map(([label,value])=><div key={label} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"><p className="text-sm text-slate-400">{label}</p><p className="mt-1 text-xl font-bold text-white">{value}</p></div>)}</div>

        <Link href="/transactions?new=fuel" className="inline-flex rounded-xl bg-amber-500 px-5 py-3 font-semibold text-slate-950">Novo abastecimento</Link>

        <div className="grid gap-4 md:grid-cols-2">
          {moduleItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 transition hover:border-amber-400/30 hover:bg-amber-500/[0.04]"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-amber-500/10 p-3 text-amber-300">
                    <Icon size={23} />
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-white">
                      {item.title}
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {item.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
