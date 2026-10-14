"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { InvestmentData, InvestmentExchangeContext } from "@/src/types/investments";
import {
  calculateInvestmentAccountSummaries,
  calculateInvestmentPositions,
  summarizeInvestmentWealth,
} from "@/src/utils/investmentCalculations";
import {
  calculateCashReserves,
  localTodayIso,
  splitCashReservesByCurrency,
  summarizeConsolidatedWealth,
  usesMultipleCurrencies,
  type CashReserveRow,
  type CashReserveSources,
} from "@/src/utils/investmentReserves";
import {
  formatInvestmentMoney,
  InvestmentEmpty,
  InvestmentTable,
  InvestmentTd,
  investmentCard,
} from "./InvestmentUi";

/** Textos de uma linha de reserva (mesmos no cartão do celular e na tabela). */
function describeCashReserve(reserve: CashReserveRow, consolidationCurrency: string) {
  return {
    balance: reserve.currency
      ? formatInvestmentMoney(reserve.balance, reserve.currency)
      : reserve.balance.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    rate:
      reserve.rate === null || reserve.rateSource === "SAME_CURRENCY"
        ? "—"
        : `1 ${reserve.currency} = ${reserve.rate.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ${consolidationCurrency}`,
    converted:
      reserve.convertedBalance === null
        ? "Sem conversão"
        : formatInvestmentMoney(reserve.convertedBalance, consolidationCurrency),
    origin:
      reserve.issue === "currency_unconfirmed"
        ? "Confirme a moeda da conta em Contas e Cartões"
        : reserve.issue === "missing_rate"
          ? `Sem cotação ${reserve.currency}/${consolidationCurrency} disponível`
          : reserve.rateSource === "SAME_CURRENCY"
            ? "Mesma moeda"
            : `${reserve.rateSource === "MANUAL" ? "Manual" : "PTAX venda (BCB)"}${reserve.rateQuotedAt ? ` · ${new Date(reserve.rateQuotedAt).toLocaleString("pt-BR")}` : ""}`,
  };
}

function MetricCard({ label, value, tone = "default", note }: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative" | "warning";
  note?: string;
}) {
  const toneClass = {
    default: "text-white",
    positive: "text-emerald-300",
    negative: "text-red-300",
    warning: "text-amber-200",
  }[tone];
  return (
    <div className={investmentCard}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 break-words text-2xl font-black ${toneClass}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-amber-300">{note}</p>}
    </div>
  );
}

/** Visão geral: patrimônio consolidado, indicadores, composição e reservas. */
export default function InvestmentDashboard({
  data,
  reserveSources,
  exchangeContext,
}: {
  data: InvestmentData;
  reserveSources: CashReserveSources;
  exchangeContext: InvestmentExchangeContext;
}) {
  const positions = useMemo(
    () =>
      calculateInvestmentPositions({
        assets: data.assets,
        accounts: data.accounts,
        operations: data.operations,
        valuations: data.valuations,
      }),
    [data],
  );
  const selectedCurrency = exchangeContext.consolidationCurrency;
  const balanceAccountSummaries = calculateInvestmentAccountSummaries({
    accounts: data.accounts,
    events: data.accountEvents,
  });
  const summary = summarizeInvestmentWealth({
    positions,
    balanceAccounts: balanceAccountSummaries,
    currency: selectedCurrency,
    rates: exchangeContext.rates,
  });
  const cashReserves = calculateCashReserves({
    ...reserveSources,
    operations: data.operations,
    today: localTodayIso(),
    consolidationCurrency: selectedCurrency,
    rates: exchangeContext.rates,
  });
  const consolidated = summarizeConsolidatedWealth({
    investmentsCurrentValue: summary.currentValue,
    investmentsMissingRateCount: summary.missingRateAssetCount + summary.missingRateAccountCount,
    reserves: cashReserves,
  });
  const reservesByCurrency = splitCashReservesByCurrency(cashReserves, selectedCurrency);
  // Detecção automática pelo cadastro de contas (inclui inativas e zeradas).
  const multiCurrency = usesMultipleCurrencies(data.accounts, selectedCurrency);

  // Composição: só as parcelas existentes; com uma parcela só, não há o que compor.
  const compositionParts = [
    { key: "investments", label: "Investimentos financeiros", value: consolidated.investmentsValue, color: "bg-cyan-400" },
    ...(reservesByCurrency.foreign.count > 0
      ? [{ key: "foreign", label: "Reservas em moedas estrangeiras", value: reservesByCurrency.foreign.value, color: "bg-violet-400" }]
      : []),
    ...(reservesByCurrency.domestic.count > 0
      ? [{ key: "domestic", label: `Reservas em ${selectedCurrency}`, value: reservesByCurrency.domestic.value, color: "bg-emerald-400" }]
      : []),
  ];
  const compositionTotal = compositionParts.reduce((sum, part) => sum + Math.max(part.value, 0), 0);

  if (!data.assets.length && !balanceAccountSummaries.length && !cashReserves.length) {
    return (
      <InvestmentEmpty
        title="Comece cadastrando um ativo"
        text="Cadastre um ativo unitizado ou classifique uma conta como investimento por saldo."
        href="/accounts"
        actionLabel="Gerenciar contas"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Patrimônio consolidado: destaque, largura total. */}
      <section
        aria-labelledby="consolidated-wealth-title"
        className="rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/15 via-slate-950/80 to-slate-950 p-5 shadow-2xl sm:p-7"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 id="consolidated-wealth-title" className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">
              Patrimônio consolidado
            </h2>
            <p className={`mt-2 break-words text-3xl font-black sm:text-4xl ${consolidated.complete ? "text-white" : "text-amber-200"}`}>
              {formatInvestmentMoney(consolidated.total, selectedCurrency)}
            </p>
            {!consolidated.complete && (
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-amber-300">Valor parcial</p>
            )}
            <p className="mt-2 text-sm text-cyan-100/70">
              Investimentos + reservas em caixa (contas com papel Reserva / investimento), em {selectedCurrency}.
            </p>
          </div>
          <Link
            href="/investments/operations"
            className="rounded-xl bg-cyan-500 px-4 py-2.5 text-center text-sm font-black text-slate-950"
          >
            Registrar operação
          </Link>
        </div>
        {!consolidated.complete && (
          <p role="status" className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">
            Patrimônio consolidado incompleto:{" "}
            {[
              consolidated.pendingReserveCount > 0 &&
                `${consolidated.pendingReserveCount} ${consolidated.pendingReserveCount === 1 ? "reserva sem conversão" : "reservas sem conversão"}`,
              consolidated.pendingInvestmentCount > 0 &&
                `${consolidated.pendingInvestmentCount} ${consolidated.pendingInvestmentCount === 1 ? "investimento sem cotação" : "investimentos sem cotação"}`,
            ].filter(Boolean).join(" e ")}
            . O total acima soma só os valores convertidos para {selectedCurrency}.
          </p>
        )}
      </section>

      {exchangeContext.warning && (
        <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">
          {exchangeContext.warning}{" "}
          <Link href="/investments/settings" className="font-bold underline">Ver cotações</Link>
        </p>
      )}

      {/* 2. Multimoeda: investimentos e reservas estrangeiras lado a lado. */}
      {multiCurrency && (
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="Investimentos financeiros"
            value={formatInvestmentMoney(consolidated.investmentsValue, selectedCurrency)}
            tone={consolidated.pendingInvestmentCount > 0 ? "warning" : "default"}
            note={consolidated.pendingInvestmentCount > 0 ? "Parcial: há investimentos sem cotação" : undefined}
          />
          <MetricCard
            label="Reservas em moedas estrangeiras"
            value={formatInvestmentMoney(reservesByCurrency.foreign.value, selectedCurrency)}
            tone={reservesByCurrency.foreign.pendingCount > 0 ? "warning" : "default"}
            note={reservesByCurrency.foreign.pendingCount > 0 ? "Parcial: há reservas sem conversão" : undefined}
          />
        </div>
      )}

      {/* 3. Indicadores financeiros (mesmos cálculos de antes). */}
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Capital investido" value={formatInvestmentMoney(summary.totalInvested, selectedCurrency)} />
        <MetricCard
          label="Resultado financeiro"
          value={formatInvestmentMoney(summary.result, selectedCurrency)}
          tone={summary.result >= 0 ? "positive" : "negative"}
        />
      </div>

      {summary.missingRateAssetCount > 0 && (
        <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">
          {summary.missingRateAssetCount} {summary.missingRateAssetCount === 1 ? "ativo não foi considerado" : "ativos não foram considerados"} por falta de cotação.
        </p>
      )}
      {summary.missingRateAccountCount > 0 && (
        <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">
          {summary.missingRateAccountCount} {summary.missingRateAccountCount === 1 ? "conta por saldo não foi considerada" : "contas por saldo não foram consideradas"} por falta de cotação.
        </p>
      )}

      {/* 4. Composição patrimonial: só quando há mais de uma parcela. */}
      {compositionParts.length > 1 && (
        <section className={`${investmentCard} space-y-4`} aria-labelledby="composition-title">
          <h2 id="composition-title" className="text-lg font-black text-white">Composição patrimonial</h2>
          {compositionTotal > 0 && (
            <div className="flex h-3 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
              {compositionParts.map((part) => (
                <div key={part.key} className={part.color} style={{ width: `${(Math.max(part.value, 0) / compositionTotal) * 100}%` }} />
              ))}
            </div>
          )}
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            {compositionParts.map((part) => (
              <div key={part.key} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 sm:flex-col sm:items-start sm:justify-start">
                <dt className="flex items-center gap-2 text-slate-400">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${part.color}`} aria-hidden="true" />
                  {part.label}
                </dt>
                <dd className="text-right font-bold text-white sm:text-left">
                  {formatInvestmentMoney(part.value, selectedCurrency)}
                  {compositionTotal > 0 && (
                    <span className="ml-1 text-xs font-semibold text-slate-500">
                      {((Math.max(part.value, 0) / compositionTotal) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* 5. Resumo das reservas. */}
      {cashReserves.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-black text-white">Reservas em caixa</h2>
            <p className="mt-1 text-sm text-slate-400">
              Saldo atual pelos lançamentos da conta, na moeda original. Transferências para reservas não são rendimento.
            </p>
          </div>
          {/* Celular: cartões (todas as colunas visíveis sem rolagem lateral). */}
          <div className="grid gap-3 md:hidden">
            {cashReserves.map((reserve) => {
              const view = describeCashReserve(reserve, selectedCurrency);
              return (
                <div key={reserve.accountId} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words font-bold text-white">{reserve.accountName}</p>
                    <span className="shrink-0 rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-xs font-bold text-cyan-300">
                      {reserve.currency ?? "Moeda não confirmada"}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-xs text-slate-500">Saldo atual</dt>
                      <dd className="mt-0.5 font-semibold text-white">{view.balance}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Equivalente ({selectedCurrency})</dt>
                      <dd className={`mt-0.5 font-semibold ${reserve.convertedBalance === null ? "text-amber-200" : "text-white"}`}>{view.converted}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs text-slate-400">
                    {view.rate !== "—" && <>{view.rate} · </>}
                    <span className={reserve.issue ? "text-amber-200" : undefined}>{view.origin}</span>
                  </p>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block">
            <InvestmentTable
              headers={["Conta", "Moeda", "Saldo atual", "Cotação", `Equivalente (${selectedCurrency})`, "Cotação: origem e data"]}
              minWidth="880px"
            >
              {cashReserves.map((reserve) => {
                const view = describeCashReserve(reserve, selectedCurrency);
                return (
                  <tr key={reserve.accountId} className="border-t border-white/10">
                    <InvestmentTd strong>{reserve.accountName}</InvestmentTd>
                    <InvestmentTd>{reserve.currency ?? "Não confirmada"}</InvestmentTd>
                    <InvestmentTd>{view.balance}</InvestmentTd>
                    <InvestmentTd>{view.rate}</InvestmentTd>
                    <InvestmentTd>
                      <span className={reserve.convertedBalance === null ? "text-amber-200" : undefined}>{view.converted}</span>
                    </InvestmentTd>
                    <InvestmentTd>
                      <span className={reserve.issue ? "text-amber-200" : undefined}>{view.origin}</span>
                    </InvestmentTd>
                  </tr>
                );
              })}
            </InvestmentTable>
          </div>
        </section>
      )}

      {/* 6. Resumo dos investimentos: o detalhe fica na Carteira. */}
      <Link
        href="/investments/portfolio"
        className={`${investmentCard} flex items-center justify-between gap-4 transition hover:border-cyan-400/40 hover:bg-white/[0.03]`}
      >
        <div className="min-w-0">
          <p className="font-black text-white">Carteira de investimentos</p>
          <p className="mt-1 text-sm text-slate-400">
            {summary.assetCount} {summary.assetCount === 1 ? "ativo" : "ativos"} · {balanceAccountSummaries.length}{" "}
            {balanceAccountSummaries.length === 1 ? "conta por saldo" : "contas por saldo"} · posições e valorizações
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold text-cyan-300" aria-hidden="true">Ver carteira →</span>
      </Link>
    </div>
  );
}
