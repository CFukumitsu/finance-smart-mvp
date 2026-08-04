"use client";

import { useState } from "react";
import {
  refreshUsdBrlRate,
  saveInvestmentConsolidationCurrency,
  saveManualExchangeRate,
} from "@/src/services/exchangeRateService";
import type { InvestmentData, InvestmentExchangeContext } from "@/src/types/investments";
import { isExchangeRateStale } from "@/src/utils/exchangeRateCalculations";
import { formatInvestmentMoney, investmentCard, investmentField, parseInvestmentDecimal } from "./InvestmentUi";

export default function InvestmentExchangeSettings({ data, exchangeContext, reload }: {
  data: InvestmentData;
  exchangeContext: InvestmentExchangeContext;
  reload: () => Promise<void>;
}) {
  const [manualRate, setManualRate] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const currencies = [...new Set(["BRL", "USD", ...data.assets.map((asset) => asset.currency)])].sort();
  const usdBrl = exchangeContext.rates.find(
    (rate) => rate.base_currency === "USD" && rate.quote_currency === "BRL",
  );
  const stale = usdBrl ? isExchangeRateStale(usdBrl) : false;

  async function run(action: () => Promise<unknown>) {
    try {
      setSaving(true);
      await action();
      setEditing(false);
      setManualRate("");
      await reload();
    } catch (value) {
      alert(value instanceof Error ? value.message : "Não foi possível atualizar a cotação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`${investmentCard} space-y-4`} aria-label="Configuração de câmbio">
      <div>
        <h2 className="font-black text-white">Consolidação por moeda</h2>
        <p className="mt-1 text-sm text-slate-400">
          Os valores originais são preservados; somente os totais do dashboard são convertidos.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(180px,240px)_1fr]">
        <label className="text-sm font-semibold text-slate-300">
          Moeda de consolidação
          <select
            className={`${investmentField} mt-2`}
            value={exchangeContext.consolidationCurrency}
            disabled={saving}
            onChange={(event) => void run(() => saveInvestmentConsolidationCurrency(event.target.value))}
          >
            {currencies.map((currency) => <option key={currency}>{currency}</option>)}
          </select>
        </label>
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Cotação USD/BRL</p>
              <p className="mt-1 text-xl font-black text-white">
                {usdBrl ? formatInvestmentMoney(usdBrl.rate, "BRL") : "Não disponível"}
              </p>
              <p className={`mt-1 text-xs ${stale ? "text-amber-300" : "text-slate-500"}`}>
                {usdBrl
                  ? `${usdBrl.source === "MANUAL" ? "Manual" : "PTAX venda"} · atualizada em ${new Date(usdBrl.updated_at).toLocaleString("pt-BR")}${stale ? " · desatualizada" : ""}`
                  : "Nenhuma cotação foi salva."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={saving} onClick={() => void run(refreshUsdBrlRate)} className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">
                Atualizar cotação
              </button>
              <button type="button" disabled={saving} onClick={() => { setEditing((value) => !value); setManualRate(usdBrl ? String(usdBrl.rate).replace(".", ",") : ""); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-50">
                Editar manualmente
              </button>
            </div>
          </div>
          {editing && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input aria-label="Cotação manual USD/BRL" inputMode="decimal" className={investmentField} value={manualRate} onChange={(event) => setManualRate(event.target.value)} placeholder="5,43" />
              <button type="button" disabled={saving} onClick={() => {
                const rate = parseInvestmentDecimal(manualRate);
                void run(() => saveManualExchangeRate(rate));
              }} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Salvar</button>
            </div>
          )}
        </div>
      </div>
      {exchangeContext.warning && <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">{exchangeContext.warning}</p>}
    </section>
  );
}
