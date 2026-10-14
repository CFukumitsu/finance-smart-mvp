"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
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
import { buildWealthDistribution } from "@/src/utils/investmentDistribution";
import {
  formatInvestmentMoney,
  InvestmentEmpty,
  InvestmentTable,
  InvestmentTd,
  investmentCard,
} from "./InvestmentUi";
import WealthDistribution from "./WealthDistribution";

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

/** Visão geral: patrimônio consolidado, indicadores, distribuição, resumo e reservas. */
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
  const [reservesOpen, setReservesOpen] = useState(false);
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
  // Mesmos componentes do consolidado, só reagrupados (por classe e por conta).
  const distribution = buildWealthDistribution({
    positions,
    assets: data.assets,
    balanceAccounts: balanceAccountSummaries,
    reserves: cashReserves,
    consolidationCurrency: selectedCurrency,
    rates: exchangeContext.rates,
  });
  const summaryGroups = [
    {
      key: "assets",
      label: "Ativos financeiros",
      detail: `${distribution.byComponent.assets.itemCount} ${distribution.byComponent.assets.itemCount === 1 ? "posição" : "posições"} em ${summary.assetCount} ${summary.assetCount === 1 ? "ativo" : "ativos"}`,
      href: "/investments/portfolio",
      ...distribution.byComponent.assets,
    },
    {
      key: "balance",
      label: "Investimentos por saldo",
      detail: `${distribution.byComponent.balance.itemCount} ${distribution.byComponent.balance.itemCount === 1 ? "conta" : "contas"} (cofrinhos, poupança e similares)`,
      href: "/investments/portfolio",
      ...distribution.byComponent.balance,
    },
    {
      key: "reserves",
      label: "Reservas em caixa",
      detail: `${distribution.byComponent.reserves.itemCount} ${distribution.byComponent.reserves.itemCount === 1 ? "conta" : "contas"} com papel Reserva / investimento`,
      href: "#reservas-em-caixa",
      ...distribution.byComponent.reserves,
    },
  ].filter((group) => group.itemCount > 0);

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
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-5 pl-6 sm:p-7 sm:pl-8"
      >
        {/* Cor principal só como detalhe: um filete à esquerda. */}
        <span className="absolute inset-y-0 left-0 w-1 bg-cyan-400" aria-hidden="true" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 id="consolidated-wealth-title" className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">
              Patrimônio consolidado
            </h2>
            <p className={`mt-2 break-words text-3xl font-black tracking-tight sm:text-5xl ${consolidated.complete ? "text-white" : "text-amber-200"}`}>
              {formatInvestmentMoney(consolidated.total, selectedCurrency)}
            </p>
            {!consolidated.complete && (
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-amber-300">Valor parcial</p>
            )}
            <p className="mt-2 text-sm text-slate-400">
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

      {/* 4. Distribuição patrimonial: gráfico único, Por classe | Por conta. */}
      {distribution.byClass.length > 0 && (
        <WealthDistribution distribution={distribution} currency={selectedCurrency} />
      )}

      {/* 5. Resumo por grupo; o detalhe fica na Carteira. */}
      {summaryGroups.length > 0 && (
        <section className="space-y-3" aria-labelledby="investment-summary-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="investment-summary-title" className="text-lg font-black text-white">Resumo dos investimentos</h2>
            <Link href="/investments/portfolio" className="text-sm font-bold text-cyan-300 hover:underline">Ver carteira →</Link>
          </div>
          <div className={`grid gap-3 ${summaryGroups.length > 1 ? "sm:grid-cols-2" : ""} ${summaryGroups.length > 2 ? "lg:grid-cols-3" : ""}`}>
            {summaryGroups.map((group) => (
              <Link
                key={group.key}
                href={group.href}
                onClick={group.key === "reserves" ? () => setReservesOpen(true) : undefined}
                className={`${investmentCard} block transition hover:border-cyan-400/40`}
              >
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{group.label}</p>
                <p className={`mt-2 break-words text-xl font-black ${group.pendingCount > 0 ? "text-amber-200" : "text-white"}`}>
                  {formatInvestmentMoney(group.value, selectedCurrency)}
                </p>
                <p className="mt-1 text-xs text-slate-400">{group.detail}</p>
                {group.pendingCount > 0 && (
                  <p className="mt-1 text-xs text-amber-300">
                    {group.pendingCount} sem cotação (fora do valor)
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 6. Reservas em caixa: acessíveis, recolhidas por padrão (sem mais destaque que os demais grupos). */}
      {cashReserves.length > 0 && (
        <details
          id="reservas-em-caixa"
          open={reservesOpen}
          onToggle={(event) => setReservesOpen(event.currentTarget.open)}
          className={`${investmentCard} scroll-mt-20 space-y-4 [&[open]>summary_svg]:rotate-180`}
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="block text-lg font-black text-white">Reservas em caixa</span>
              <span className="mt-1 block text-sm text-slate-400">
                Saldo atual pelos lançamentos da conta, na moeda original. Transferências para reservas não são rendimento.
              </span>
            </span>
            <ChevronDown size={20} className="mt-1 shrink-0 text-slate-400 transition-transform" aria-hidden="true" />
          </summary>
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
        </details>
      )}
    </div>
  );
}
