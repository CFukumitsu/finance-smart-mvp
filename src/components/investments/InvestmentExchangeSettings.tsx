"use client";

import { useMutation } from "@/src/hooks/useMutation";
import { ProcessingButton } from "@/src/components/ui/Mutation";
import { useState } from "react";
import {
  refreshPtaxRate,
  saveInvestmentConsolidationCurrency,
  saveManualExchangeRate,
} from "@/src/services/exchangeRateService";
import type { InvestmentData, InvestmentExchangeContext } from "@/src/types/investments";
import { isExchangeRateStale, PTAX_CURRENCIES } from "@/src/utils/exchangeRateCalculations";
import { formatInvestmentMoney, investmentCard, investmentField, parseInvestmentDecimal } from "./InvestmentUi";
import { notify } from "@/src/components/ui/feedback/feedbackStore";

const CURRENCY_NAMES: Record<string, string> = { USD: "Dólar", EUR: "Euro", GBP: "Libra esterlina" };

export default function InvestmentExchangeSettings({ data, exchangeContext, reload }: {
  data: InvestmentData;
  exchangeContext: InvestmentExchangeContext;
  reload: () => Promise<void>;
}) {
  const mutation = useMutation();
  const [manualRate, setManualRate] = useState("");
  const [editingCurrency, setEditingCurrency] = useState<string | null>(null);
  const currencies = [...new Set(["BRL", "USD", ...data.assets.map((asset) => asset.currency)])].sort();
  // USD sempre (como antes); EUR/GBP quando alguma conta, ativo ou cotação salva usa a moeda.
  const usedCurrencies = new Set(
    [
      ...data.accounts.map((account) => account.currency),
      ...data.assets.map((asset) => asset.currency),
      ...exchangeContext.rates.map((rate) => rate.base_currency),
    ].flatMap((currency) => (currency ? [currency.toUpperCase()] : [])),
  );
  const rateCurrencies = PTAX_CURRENCIES.filter((currency) => currency === "USD" || usedCurrencies.has(currency));

  async function run(key: string, action: () => Promise<unknown>) {
    return mutation.run(key, async () => {
      try {
        await action();
        setEditingCurrency(null);
        setManualRate("");
        await reload();
      } catch (value) {
        notify.error(value instanceof Error ? value.message : "Não foi possível atualizar a cotação.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className={`${investmentCard} space-y-4`} aria-label="Moeda de consolidação">
        <div>
          <h2 className="font-black text-white">Moeda de consolidação</h2>
          <p className="mt-1 text-sm text-slate-400">
            Os valores originais são preservados; somente os totais do dashboard são convertidos.
          </p>
        </div>
        <label className="block max-w-xs text-sm font-semibold text-slate-300">
          Moeda
          <select
            className={`${investmentField} mt-2`}
            value={exchangeContext.consolidationCurrency}
            disabled={mutation.isPending}
            onChange={(event) => void run("consolidation", () => saveInvestmentConsolidationCurrency(event.target.value))}
          >
            {currencies.map((currency) => <option key={currency}>{currency}</option>)}
          </select>
        </label>
      </section>

      <section className="space-y-4" aria-labelledby="exchange-rates-title">
        <div>
          <h2 id="exchange-rates-title" className="text-xl font-black text-white">Cotações</h2>
          <p className="mt-1 text-sm text-slate-400">
            PTAX venda do Banco Central, atualizada automaticamente quando tem mais de 12 horas. A edição manual substitui a cotação atual do par; valores históricos não mudam.
          </p>
        </div>
        {exchangeContext.warning && (
          <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">{exchangeContext.warning}</p>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {rateCurrencies.map((currency) => {
            const rate = exchangeContext.rates.find(
              (item) => item.base_currency === currency && item.quote_currency === "BRL",
            );
            const stale = rate ? isExchangeRateStale(rate) : false;
            const editing = editingCurrency === currency;
            return (
              <div key={currency} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Cotação {currency}/BRL · {CURRENCY_NAMES[currency]}
                    </p>
                    <p className="mt-1 text-xl font-black text-white">
                      {rate ? formatInvestmentMoney(rate.rate, "BRL") : "Não disponível"}
                    </p>
                    <p className={`mt-1 text-xs ${stale ? "text-amber-300" : "text-slate-500"}`}>
                      {rate
                        ? `${rate.source === "MANUAL" ? "Manual" : "PTAX venda"} · cotação de ${new Date(rate.quoted_at).toLocaleString("pt-BR")} · atualizada em ${new Date(rate.updated_at).toLocaleString("pt-BR")}${stale ? " · desatualizada" : ""}`
                        : "Nenhuma cotação foi salva."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ProcessingButton
                      busy={mutation.pending === `refresh:${currency}`}
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => void run(`refresh:${currency}`, () => refreshPtaxRate(currency))}
                      className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50"
                    >
                      Atualizar cotação
                    </ProcessingButton>
                    <button
                      type="button"
                      disabled={mutation.isPending}
                      aria-expanded={editing}
                      onClick={() => {
                        setEditingCurrency(editing ? null : currency);
                        setManualRate(rate ? String(rate.rate).replace(".", ",") : "");
                      }}
                      className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-50"
                    >
                      Editar manualmente
                    </button>
                  </div>
                </div>
                {editing && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      disabled={mutation.isPending}
                      aria-label={`Cotação manual ${currency}/BRL`}
                      inputMode="decimal"
                      className={investmentField}
                      value={manualRate}
                      onChange={(event) => setManualRate(event.target.value)}
                      placeholder="5,43"
                    />
                    <ProcessingButton
                      busy={mutation.pending === `manual:${currency}`}
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => {
                        const value = parseInvestmentDecimal(manualRate);
                        void run(`manual:${currency}`, () => saveManualExchangeRate(value, currency));
                      }}
                      className="rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      Salvar
                    </ProcessingButton>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
