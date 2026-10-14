"use client";

import { useState } from "react";
import { useAuth } from "@/src/hooks/useAuth";
import {
  readDistributionMode,
  writeDistributionMode,
  type DistributionGroup,
  type DistributionMode,
  type WealthDistribution as Distribution,
} from "@/src/utils/investmentDistribution";
import { formatInvestmentMoney, investmentCard } from "./InvestmentUi";

function browserStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const barColor: Record<DistributionGroup["kind"], string> = {
  asset_type: "bg-cyan-400",
  balance_unclassified: "bg-sky-400",
  foreign_reserve: "bg-violet-400",
  domestic_reserve: "bg-emerald-400",
  account: "bg-cyan-400",
};

const percentFormat = (value: number) =>
  `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Distribuição patrimonial: barras horizontais com seletor Por classe | Por conta. */
export default function WealthDistribution({
  distribution,
  currency,
}: {
  distribution: Distribution;
  currency: string;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [chosen, setChosen] = useState<DistributionMode | null>(null);
  const mode = chosen ?? readDistributionMode(browserStorage(), userId);
  const groups = mode === "class" ? distribution.byClass : distribution.byAccount;
  // Sem total positivo não há percentual; a barra passa a comparar valores absolutos.
  const scale = distribution.total > 0 ? distribution.total : Math.max(...groups.map((item) => Math.abs(item.value)), 1);

  function choose(next: DistributionMode) {
    setChosen(next);
    writeDistributionMode(browserStorage(), userId, next);
  }

  return (
    <section className={`${investmentCard} space-y-5`} aria-labelledby="distribution-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="distribution-title" className="text-lg font-black text-white">Distribuição patrimonial</h2>
          <p className="mt-1 text-sm text-slate-400">
            Mesmos valores do patrimônio consolidado, em {currency}.
          </p>
        </div>
        <div role="group" aria-label="Agrupar distribuição" className="grid shrink-0 grid-cols-2 gap-1 rounded-xl border border-white/10 bg-slate-900/60 p-1">
          {([
            ["class", "Por classe"],
            ["account", "Por conta/instituição"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => choose(value)}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition sm:text-sm ${
                mode === value ? "bg-cyan-500/15 text-cyan-300" : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-4" aria-label={mode === "class" ? "Distribuição por classe" : "Distribuição por conta ou instituição"}>
        {groups.map((item) => {
          const width = Math.min(100, (Math.abs(item.value) / scale) * 100);
          const negative = item.value < 0;
          return (
            <li key={item.key} className="space-y-1.5">
              {/* Celular: nome em uma linha, valor e percentual na seguinte (sempre alinhados). */}
              <div className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <span className="min-w-0 break-words font-semibold text-slate-200">{item.label}</span>
                <span className="flex shrink-0 items-baseline justify-between gap-2 sm:justify-end">
                  <span className={`font-black ${negative ? "text-red-300" : "text-white"}`}>
                    {formatInvestmentMoney(item.value, currency)}
                  </span>
                  <span className="w-14 text-right text-xs font-semibold text-slate-500">
                    {item.percent === null ? "—" : percentFormat(item.percent)}
                  </span>
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
                <div className={`h-full rounded-full ${negative ? "bg-red-400" : barColor[item.kind]}`} style={{ width: `${width}%` }} />
              </div>
              {item.pendingCount > 0 && (
                <p className="text-xs text-amber-300">
                  {item.pendingCount} {item.pendingCount === 1 ? "item sem cotação, fora do valor" : "itens sem cotação, fora do valor"}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/10 pt-4 text-sm">
        <span className="text-slate-400">Total considerado</span>
        <span className={`font-black ${distribution.complete ? "text-white" : "text-amber-200"}`}>
          {formatInvestmentMoney(distribution.total, currency)}
          {!distribution.complete && <span className="ml-2 text-xs font-bold uppercase tracking-wide">Parcial</span>}
        </span>
      </div>
      {!distribution.complete && (
        <p className="text-xs text-amber-300">
          {distribution.pendingCount} {distribution.pendingCount === 1 ? "item ficou" : "itens ficaram"} fora por falta de cotação; os percentuais consideram só os valores convertidos.
        </p>
      )}
    </section>
  );
}
