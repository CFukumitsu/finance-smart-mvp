"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { loadInvestmentData } from "@/src/services/investmentService";
import { loadInvestmentExchangeContext } from "@/src/services/exchangeRateService";
import { loadCashReserveSources } from "@/src/services/investmentReserveService";
import type { InvestmentData, InvestmentExchangeContext } from "@/src/types/investments";
import { listCashReserveCurrencies, localTodayIso, type CashReserveSources } from "@/src/utils/investmentReserves";
import { investmentCard } from "./InvestmentUi";
import InvestmentDashboard from "./InvestmentDashboard";
import InvestmentPortfolio from "./InvestmentPortfolio";
import InvestmentExchangeSettings from "./InvestmentExchangeSettings";
import InvestmentOperations from "./InvestmentOperations";
import InvestmentAccountEvents from "./InvestmentAccountEvents";
import InvestmentAssets from "./InvestmentAssets";

export type InvestmentView = "dashboard" | "portfolio" | "operations" | "assets" | "settings";

const emptyData: InvestmentData = {
  assets: [],
  operations: [],
  valuations: [],
  accounts: [],
  accountEvents: [],
};

const emptyExchangeContext: InvestmentExchangeContext = {
  consolidationCurrency: "BRL",
  rates: [],
  warning: null,
};

const viewTitles: Record<InvestmentView, string> = {
  dashboard: "Visão geral",
  portfolio: "Carteira",
  operations: "Operações",
  assets: "Ativos cadastrados",
  settings: "Configurações",
};

const viewDescriptions: Record<InvestmentView, string> = {
  dashboard: "Patrimônio consolidado, distribuição, indicadores e reservas.",
  portfolio: "Contas por saldo, posições e valorizações.",
  operations: "Compras, vendas, aplicações, resgates e seus históricos.",
  assets: "Cadastro dos ativos usados nas operações e valorizações.",
  settings: "Moeda de consolidação e cotações.",
};

const emptyReserveSources: CashReserveSources = {
  accounts: [],
  competences: [],
  closures: [],
  transactions: [],
};

// Reservas em caixa só aparecem na Visão geral; as outras telas não as carregam.
async function loadInvestmentScreenData(view: InvestmentView) {
  const [investmentData, reserveSources] = await Promise.all([
    loadInvestmentData(),
    view === "dashboard" ? loadCashReserveSources(localTodayIso()) : Promise.resolve(emptyReserveSources),
  ]);
  const exchange = await loadInvestmentExchangeContext(
    [
      ...new Set([
        ...investmentData.assets.map((asset) => asset.currency),
        ...investmentData.accounts
          .filter((account) => account.investment_account_kind === "BALANCE")
          .flatMap((account) => (account.currency ? [account.currency] : [])),
        ...listCashReserveCurrencies(reserveSources.accounts, investmentData.operations),
      ]),
    ],
  );
  return { data: investmentData, reserveSources, exchange };
}

export default function InvestmentScreen({ view }: { view: InvestmentView }) {
  const [data, setData] = useState<InvestmentData>(emptyData);
  const [reserveSources, setReserveSources] = useState<CashReserveSources>(emptyReserveSources);
  const [exchangeContext, setExchangeContext] = useState<InvestmentExchangeContext>(emptyExchangeContext);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const value = await loadInvestmentScreenData(view);
      setData(value.data);
      setReserveSources(value.reserveSources);
      setExchangeContext(value.exchange);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Não foi possível carregar os investimentos.",
      );
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    let active = true;

    void loadInvestmentScreenData(view)
      .then((value) => {
        if (active) {
          setData(value.data);
          setReserveSources(value.reserveSources);
          setExchangeContext(value.exchange);
        }
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
  }, [view]);

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
        <p className="mt-1 text-sm text-slate-400">{viewDescriptions[view]}</p>
      </header>

      {/* Celular: 2 colunas (a última área ocupa a linha inteira); md+: as cinco lado a lado. */}
      <nav aria-label="Áreas de Investimentos" className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-slate-900/50 p-2 md:grid-cols-5 [&>a:last-child]:col-span-2 md:[&>a:last-child]:col-span-1">
        {[
          ["dashboard", "/investments", "Visão geral"],
          ["portfolio", "/investments/portfolio", "Carteira"],
          ["operations", "/investments/operations", "Operações"],
          ["assets", "/investments/assets", "Ativos cadastrados"],
          ["settings", "/investments/settings", "Configurações"],
        ].map(([key, href, label]) => (
          <Link
            key={key}
            href={href}
            aria-current={view === key ? "page" : undefined}
            className={`flex items-center justify-center rounded-xl px-3 py-2.5 text-center text-sm font-bold leading-tight transition ${
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
        <InvestmentDashboard data={data} reserveSources={reserveSources} exchangeContext={exchangeContext} />
      ) : view === "portfolio" ? (
        <InvestmentPortfolio data={data} exchangeContext={exchangeContext} reload={reload} />
      ) : view === "assets" ? (
        <InvestmentAssets data={data} reload={reload} />
      ) : view === "settings" ? (
        <InvestmentExchangeSettings data={data} exchangeContext={exchangeContext} reload={reload} />
      ) : (
        <div className="space-y-10">
          <InvestmentAccountEvents data={data} reload={reload} />
          <InvestmentOperations data={data} reload={reload} />
        </div>
      )}
    </div>
  );
}
