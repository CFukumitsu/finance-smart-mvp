"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { loadInvestmentData } from "@/src/services/investmentService";
import type { InvestmentData } from "@/src/types/investments";
import { investmentCard } from "./InvestmentUi";
import InvestmentDashboard from "./InvestmentDashboard";
import InvestmentAssets from "./InvestmentAssets";
import InvestmentOperations from "./InvestmentOperations";

export type InvestmentView = "dashboard" | "assets" | "operations";

const emptyData: InvestmentData = {
  assets: [],
  operations: [],
  valuations: [],
  accounts: [],
};

const viewTitles: Record<InvestmentView, string> = {
  dashboard: "Visão geral",
  assets: "Ativos",
  operations: "Operações",
};

export default function InvestmentScreen({ view }: { view: InvestmentView }) {
  const [data, setData] = useState<InvestmentData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setData(await loadInvestmentData());
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Não foi possível carregar os investimentos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void loadInvestmentData()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((value: unknown) => {
        if (active) {
          setError(
            value instanceof Error
              ? value.message
              : "Não foi possível carregar os investimentos.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-cyan-300">
          <ChartNoAxesCombined size={20} />
          <span className="text-xs font-black uppercase tracking-[.2em]">
            Investimentos
          </span>
        </div>
        <h1 className="text-3xl font-black text-white">{viewTitles[view]}</h1>
        <p className="mt-1 text-sm text-slate-400">
          Posições e patrimônio derivados exclusivamente do histórico de
          operações.
        </p>
      </header>

      <nav className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-slate-900/50 p-2">
        {[
          ["dashboard", "/investments", "Visão geral"],
          ["assets", "/investments/assets", "Ativos"],
          ["operations", "/investments/operations", "Operações"],
        ].map(([key, href, label]) => (
          <Link
            key={key}
            href={href}
            className={`rounded-xl px-3 py-2.5 text-center text-sm font-bold transition ${
              view === key
                ? "bg-cyan-500/15 text-cyan-200"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className={`${investmentCard} text-center text-slate-400`}>
          Carregando investimentos...
        </div>
      ) : view === "dashboard" ? (
        <InvestmentDashboard data={data} reload={reload} />
      ) : view === "assets" ? (
        <InvestmentAssets data={data} reload={reload} />
      ) : (
        <InvestmentOperations data={data} reload={reload} />
      )}
    </div>
  );
}
