"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildBreakdown,
  buildMonthlyAnalytics,
  summarizeMonthlyValues,
} from "@/src/utils/analyticsCalculations";
import {
  buildCategoryBudgetInsights,
  calculateDailyAvailableLimit,
  calculateDailyExpensePace,
  calculateMonthlyProjection,
  calculatePercentageChange,
  countInclusiveDays,
  filterTransactionsByDate,
  findExpenseIncreaseDrivers,
  getComparisonDateRange,
  getElapsedRangeDays,
  normalizeAnalyticsDateRange,
  type BudgetStatus,
} from "@/src/utils/analyticsPredictive";
import type {
  AnalyticsBreakdown,
  AnalyticsScreenKind,
  MonthlyAnalytics,
} from "@/src/types/analytics";
import AnalyticsFilters from "./AnalyticsFilters";
import { useAnalytics } from "./AnalyticsProvider";
import {
  AnalyticsChartCard,
  AnalyticsEmptyState,
  AnalyticsHeader,
  AnalyticsSummaryCard,
  CsvExportButton,
  formatAnalyticsCurrency,
} from "./AnalyticsUi";

const screenCopy: Record<
  AnalyticsScreenKind,
  { title: string; description: string }
> = {
  overview: {
    title: "Visão Geral",
    description:
      "Acompanhe receitas, despesas e resultado do período selecionado em uma leitura única.",
  },
  income: {
    title: "Receitas",
    description:
      "Entenda a evolução das entradas e sua distribuição entre categorias e contas.",
  },
  expenses: {
    title: "Despesas",
    description:
      "Analise a evolução dos gastos sem duplicar transferências ou pagamentos de fatura.",
  },
  "cash-flow": {
    title: "Fluxo de Caixa",
    description:
      "Visualize entradas, saídas e saldo das contas pelo vencimento dos lançamentos.",
  },
};

const chartColors = {
  income: "#34d399",
  expenses: "#fb7185",
  balance: "#22d3ee",
  secondary: "#60a5fa",
};

function currencyTooltip(value: unknown) {
  const resolved = Array.isArray(value) ? value[0] : value;
  return formatAnalyticsCurrency(Number(resolved ?? 0));
}

function MonthlyLines({
  data,
  lines,
}: {
  data: MonthlyAnalytics[];
  lines: Array<{ key: keyof MonthlyAnalytics; name: string; color: string }>;
}) {
  if (data.length === 0) {
    return <AnalyticsEmptyState message="Nenhum dado encontrado para o período." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="monthLabel"
          stroke="#94a3b8"
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="#94a3b8"
          tick={{ fontSize: 11 }}
          tickFormatter={(value) =>
            Number(value).toLocaleString("pt-BR", { notation: "compact" })
          }
        />
        <Tooltip
          formatter={(value, name) => [currencyTooltip(value), String(name)]}
          contentStyle={{
            backgroundColor: "#020617",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((line) => (
          <Line
            key={String(line.key)}
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={line.color}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function MonthlyBars({
  data,
  bars,
}: {
  data: MonthlyAnalytics[];
  bars: Array<{ key: keyof MonthlyAnalytics; name: string; color: string }>;
}) {
  if (data.length === 0) {
    return <AnalyticsEmptyState message="Nenhum dado encontrado para o período." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="monthLabel"
          stroke="#94a3b8"
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="#94a3b8"
          tick={{ fontSize: 11 }}
          tickFormatter={(value) =>
            Number(value).toLocaleString("pt-BR", { notation: "compact" })
          }
        />
        <Tooltip
          formatter={(value, name) => [currencyTooltip(value), String(name)]}
          contentStyle={{
            backgroundColor: "#020617",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {bars.map((bar) => (
          <Bar
            key={String(bar.key)}
            dataKey={bar.key}
            name={bar.name}
            fill={bar.color}
            radius={[5, 5, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function BreakdownBars({ data }: { data: AnalyticsBreakdown[] }) {
  const visible = data.slice(0, 8);
  if (visible.length === 0) {
    return <AnalyticsEmptyState message="Nenhum agrupamento disponível." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={visible}
        layout="vertical"
        margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          type="number"
          stroke="#94a3b8"
          tick={{ fontSize: 11 }}
          tickFormatter={(value) =>
            Number(value).toLocaleString("pt-BR", { notation: "compact" })
          }
        />
        <YAxis
          type="category"
          dataKey="name"
          width={92}
          stroke="#94a3b8"
          tick={{ fontSize: 10 }}
          tickFormatter={(value) =>
            String(value).length > 15
              ? `${String(value).slice(0, 14)}…`
              : String(value)
          }
        />
        <Tooltip
          formatter={(value) => [currencyTooltip(value), "Total"]}
          contentStyle={{
            backgroundColor: "#020617",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 12,
          }}
        />
        <Bar dataKey="value" name="Total" fill={chartColors.secondary} radius={[0, 5, 5, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function csvNumber(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function formatAnalyticsDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

const budgetStatusClass: Record<BudgetStatus, string> = {
  Normal: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
  Atenção: "border-amber-400/25 bg-amber-500/10 text-amber-200",
  Risco: "border-orange-400/25 bg-orange-500/10 text-orange-200",
  Estourado: "border-rose-400/25 bg-rose-500/10 text-rose-200",
};

function MonthlyTable({
  kind,
  monthly,
  includePendingCashFlow,
}: {
  kind: AnalyticsScreenKind;
  monthly: MonthlyAnalytics[];
  includePendingCashFlow: boolean;
}) {
  const columns =
    kind === "income"
      ? ["Competência", "Receitas"]
      : kind === "expenses"
        ? ["Competência", "Despesas"]
        : kind === "cash-flow"
          ? includePendingCashFlow
            ? ["Competência", "Entradas realizadas e previstas", "Saídas realizadas e previstas", "Saldo projetado"]
            : ["Competência", "Entradas realizadas", "Saídas realizadas", "Saldo realizado"]
          : ["Competência", "Receitas", "Despesas", "Saldo"];

  const rowValues = (item: MonthlyAnalytics) => {
    if (kind === "income") return [item.income];
    if (kind === "expenses") return [item.expenses];
    if (kind === "cash-flow") {
      return [item.cashIn, item.cashOut, item.cumulativeCashBalance];
    }
    return [item.income, item.expenses, item.balance];
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
      <h2 className="font-semibold text-white">Resumo por competência</h2>
      <p className="mt-1 text-xs text-slate-500">
        Valores consolidados conforme os filtros selecionados.
      </p>

      <div className="mt-4 grid gap-3 md:hidden">
        {monthly.map((item) => (
          <article key={item.competenceId} className="rounded-xl bg-white/[0.03] p-4">
            <p className="font-semibold text-white">{item.competenceName}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {rowValues(item).map((value, index) => (
                <div key={columns[index + 1]}>
                  <p className="text-xs text-slate-500">{columns[index + 1]}</p>
                  <p className="mt-1 break-words text-sm font-medium text-slate-200">
                    {formatAnalyticsCurrency(value)}
                  </p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 hidden md:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-white/10 text-slate-400">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={column}
                  className={`px-3 py-3 font-medium ${index === 0 ? "text-left" : "text-right"}`}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {monthly.map((item) => (
              <tr key={item.competenceId}>
                <td className="px-3 py-3 font-medium text-white">{item.competenceName}</td>
                {rowValues(item).map((value, index) => (
                  <td key={columns[index + 1]} className="px-3 py-3 text-right text-slate-300">
                    {formatAnalyticsCurrency(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AnalyticsScreen({ kind }: { kind: AnalyticsScreenKind }) {
  const {
    selectedCompetences,
    transactions,
    financialTargets,
    categories,
    openingBalance,
    filters,
    includePendingCashFlow,
    isLoading,
    error,
  } = useAnalytics();
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const copy = screenCopy[kind];

  const dateRange = useMemo(() => {
    try {
      return normalizeAnalyticsDateRange(filters.startDate, filters.endDate);
    } catch {
      return null;
    }
  }, [filters.endDate, filters.startDate]);
  const comparisonRange = useMemo(() => dateRange ? getComparisonDateRange(dateRange) : null, [dateRange]);
  const currentTransactions = useMemo(
    () => dateRange ? filterTransactionsByDate(transactions, dateRange) : [],
    [dateRange, transactions]
  );
  const previousTransactions = useMemo(
    () => comparisonRange ? filterTransactionsByDate(transactions, comparisonRange) : [],
    [comparisonRange, transactions]
  );

  const monthly = useMemo(
    () =>
      buildMonthlyAnalytics({
        competences: selectedCompetences,
        transactions: currentTransactions,
        filters,
        openingBalance,
        includePendingCashFlow,
      }),
    [selectedCompetences, currentTransactions, filters, openingBalance, includePendingCashFlow]
  );
  const incomeSummary = useMemo(
    () => summarizeMonthlyValues(monthly, "income"),
    [monthly]
  );
  const expenseSummary = useMemo(
    () => summarizeMonthlyValues(monthly, "expenses"),
    [monthly]
  );
  const incomeCategories = useMemo(
    () => buildBreakdown(currentTransactions, "Receita", "category"),
    [currentTransactions]
  );
  const incomeAccounts = useMemo(
    () => buildBreakdown(currentTransactions, "Receita", "account"),
    [currentTransactions]
  );
  const expenseCategories = useMemo(
    () => buildBreakdown(currentTransactions, "Despesa", "category"),
    [currentTransactions]
  );
  const expenseAccounts = useMemo(
    () => buildBreakdown(currentTransactions, "Despesa", "account"),
    [currentTransactions]
  );
  const expenseCards = useMemo(
    () => buildBreakdown(currentTransactions, "Despesa", "card"),
    [currentTransactions]
  );

  const totalCashIn = monthly.reduce((sum, item) => sum + item.cashIn, 0);
  const totalCashOut = monthly.reduce((sum, item) => sum + item.cashOut, 0);
  const finalCashBalance = openingBalance + totalCashIn - totalCashOut;
  const netResult = incomeSummary.total - expenseSummary.total;
  const averageSavings = monthly.length > 0 ? netResult / monthly.length : 0;

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const consideredDays = dateRange ? getElapsedRangeDays(dateRange, today) : 0;
  const previousDays = comparisonRange ? countInclusiveDays(comparisonRange) : 0;
  const previousExpenses = previousTransactions
    .filter((transaction) => transaction.type === "Despesa")
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.value ?? 0)), 0);
  const dailyExpensePace = calculateDailyExpensePace(expenseSummary.total, consideredDays);
  const previousDailyPace = calculateDailyExpensePace(previousExpenses, previousDays);
  const dailyPaceChange = calculatePercentageChange(dailyExpensePace, previousDailyPace);
  const monthlyProjection = dateRange ? calculateMonthlyProjection(expenseSummary.total, dateRange, today) : null;
  const budgetInsights = useMemo(
    () => dateRange ? buildCategoryBudgetInsights({
      transactions: currentTransactions,
      targets: financialTargets,
      categories,
      range: dateRange,
      today,
    }) : [],
    [categories, currentTransactions, dateRange, financialTargets, today]
  );
  const alerts = budgetInsights.filter((item) => item.status !== "Normal");
  const visibleAlerts = showAllAlerts ? alerts : alerts.slice(0, 3);
  const increaseDrivers = useMemo(
    () => findExpenseIncreaseDrivers({ currentTransactions, previousTransactions, categories }),
    [categories, currentTransactions, previousTransactions]
  );
  const totalPlanned = budgetInsights.reduce((sum, item) => sum + item.planned, 0);
  const totalBudgetRealized = budgetInsights.reduce((sum, item) => sum + item.realized, 0);
  const remainingDays = budgetInsights[0]?.remainingDays ?? 0;
  const dailyAvailable = calculateDailyAvailableLimit(totalPlanned, totalBudgetRealized, remainingDays);

  const csvHeaders =
    kind === "income"
      ? ["Competência", "Receitas"]
      : kind === "expenses"
        ? ["Competência", "Despesas"]
        : kind === "cash-flow"
          ? includePendingCashFlow
            ? ["Competência", "Entradas realizadas e previstas", "Saídas realizadas e previstas", "Saldo projetado"]
            : ["Competência", "Entradas realizadas", "Saídas realizadas", "Saldo realizado"]
          : ["Competência", "Receitas", "Despesas", "Saldo"];
  const csvRows = monthly.map((item) => {
    if (kind === "income") return [item.competenceName, csvNumber(item.income)];
    if (kind === "expenses") return [item.competenceName, csvNumber(item.expenses)];
    if (kind === "cash-flow") {
      return [
        item.competenceName,
        csvNumber(item.cashIn),
        csvNumber(item.cashOut),
        csvNumber(item.cumulativeCashBalance),
      ];
    }
    return [
      item.competenceName,
      csvNumber(item.income),
      csvNumber(item.expenses),
      csvNumber(item.balance),
    ];
  });

  return (
    <div className="min-w-0 space-y-6">
      <AnalyticsHeader title={copy.title} description={copy.description} />
      <AnalyticsFilters
        showCategory={kind !== "cash-flow"}
        showStatus={kind !== "cash-flow"}
        cashFlowMode={kind === "cash-flow"}
      />

      {kind === "cash-flow" && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100">
          <span className="font-semibold">
            {includePendingCashFlow ? "Fluxo realizado e previsto" : "Fluxo realizado"}
          </span>
          <span className="ml-2 text-cyan-100/70">
            {includePendingCashFlow
              ? "Inclui lançamentos efetivados e pendentes."
              : "Considera somente recebimentos e pagamentos efetivados."}
          </span>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </p>
      )}

      {isLoading && (
        <p className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-4 text-sm text-cyan-200">
          Atualizando análises…
        </p>
      )}

      {(kind === "overview" || kind === "expenses") && dateRange && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores preditivos do período">
            <AnalyticsSummaryCard label="Ritmo médio diário" value={formatAnalyticsCurrency(dailyExpensePace)} detail={`${consideredDays} ${consideredDays === 1 ? "dia considerado" : "dias considerados"}${dailyPaceChange === null ? " · sem base comparável" : ` · ${Math.abs(dailyPaceChange).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% ${dailyPaceChange >= 0 ? "acima" : "abaixo"} do anterior`}`} tone={dailyPaceChange !== null && dailyPaceChange > 0 ? "negative" : "info"} />
            <AnalyticsSummaryCard label={monthlyProjection === null ? "Despesas realizadas" : "Projeção até o fim do mês"} value={formatAnalyticsCurrency(monthlyProjection ?? expenseSummary.total)} detail={monthlyProjection === null ? "Sem projeção para período histórico ou com mais de um mês." : `Divisor: ${consideredDays} dias decorridos; sem incluir dias futuros.`} tone="negative" />
            <AnalyticsSummaryCard label="Limite diário disponível" value={dailyAvailable === null ? "Sem orçamento" : formatAnalyticsCurrency(dailyAvailable)} detail={dailyAvailable === null ? "Configure planejamento mensal por categoria." : `${remainingDays} ${remainingDays === 1 ? "dia restante" : "dias restantes"} considerados${totalBudgetRealized > totalPlanned ? " · Estourado" : ""}.`} tone={dailyAvailable === 0 && totalPlanned > 0 ? "negative" : "info"} />
            <AnalyticsSummaryCard label="Período comparativo" value={`${formatAnalyticsDate(comparisonRange!.startDate)} a ${formatAnalyticsDate(comparisonRange!.endDate)}`} detail="Intervalo imediatamente anterior; mês completo usa o mês anterior completo." />
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold text-white">Alertas inteligentes</h2><p className="mt-1 text-xs text-slate-500">Regras determinísticas, ordenadas por gravidade e calculadas sobre os filtros selecionados.</p></div>
              {alerts.length > 3 && <button type="button" onClick={() => setShowAllAlerts((current) => !current)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/10">{showAllAlerts ? "Mostrar principais" : `Ver todos (${alerts.length})`}</button>}
            </div>
            {budgetInsights.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-400">Não há planejamento de categoria configurado para esta competência. Intervalos com mais de um mês não recebem alertas mensais.</p>
            ) : alerts.length === 0 ? (
              <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">Nenhuma categoria exige atenção com os filtros atuais.</p>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {visibleAlerts.map((alert) => <article key={alert.categoryId} className={`rounded-xl border p-4 ${budgetStatusClass[alert.status]}`}>
                  <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{alert.status} em {alert.categoryName}</h3><span className="text-xs font-bold">{alert.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span></div>
                  <p className="mt-2 text-sm opacity-90">Você gastou {formatAnalyticsCurrency(alert.realized)} de {formatAnalyticsCurrency(alert.planned)}.</p>
                  {alert.projected !== null && <p className="mt-1 text-sm opacity-80">No ritmo atual, a categoria deve encerrar em {formatAnalyticsCurrency(alert.projected)}.</p>}
                  {alert.probableOverrunDate && <p className="mt-1 text-sm font-medium">Possível estouro em {formatAnalyticsDate(alert.probableOverrunDate)}.</p>}
                </article>)}
              </div>
            )}
          </section>

          {budgetInsights.length > 0 && <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
            <h2 className="font-semibold text-white">Orçamento consumido por categoria</h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">{budgetInsights.map((item) => <article key={item.categoryId} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium text-white">{item.categoryName}</h3><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${budgetStatusClass[item.status]}`}>{item.status}</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min(100, item.percentage)}%` }} /></div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-400 sm:grid-cols-4">
                <div><span className="block">Realizado</span><strong className="mt-1 block text-slate-200">{formatAnalyticsCurrency(item.realized)}</strong></div><div><span className="block">Planejado</span><strong className="mt-1 block text-slate-200">{formatAnalyticsCurrency(item.planned)}</strong></div><div><span className="block">Utilizado</span><strong className="mt-1 block text-slate-200">{item.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong></div><div><span className="block">Restante</span><strong className="mt-1 block text-slate-200">{formatAnalyticsCurrency(item.remaining)}</strong></div>
              </div>
            </article>)}</div>
          </section>}

          <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
            <h2 className="font-semibold text-white">Principais responsáveis pelo aumento</h2><p className="mt-1 text-xs text-slate-500">Até três categorias com maior aumento absoluto contra o período comparativo.</p>
            {increaseDrivers.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-400">Nenhuma categoria aumentou no período selecionado.</p> : <div className="mt-4 grid gap-3 lg:grid-cols-3">{increaseDrivers.map((item) => <article key={item.categoryId} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <h3 className="font-medium text-white">{item.categoryName}</h3><p className="mt-3 text-lg font-semibold text-rose-300">+ {formatAnalyticsCurrency(item.difference)}</p><p className="mt-1 text-xs text-slate-400">Atual {formatAnalyticsCurrency(item.current)} · anterior {formatAnalyticsCurrency(item.previous)}</p><p className="mt-2 text-xs font-medium text-slate-300">{item.percentageChange === null ? "Período anterior sem base; percentual não calculado." : `${item.percentageChange.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de variação`}</p>
            </article>)}</div>}
          </section>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kind === "overview" && (
          <>
            <AnalyticsSummaryCard label="Receitas · período" value={formatAnalyticsCurrency(incomeSummary.total)} tone="positive" />
            <AnalyticsSummaryCard label="Despesas · período" value={formatAnalyticsCurrency(expenseSummary.total)} tone="negative" />
            <AnalyticsSummaryCard label="Resultado do período" value={formatAnalyticsCurrency(netResult)} tone={netResult >= 0 ? "positive" : "negative"} />
            <AnalyticsSummaryCard label="Resultado médio mensal" value={formatAnalyticsCurrency(averageSavings)} tone={averageSavings >= 0 ? "info" : "negative"} />
          </>
        )}

        {kind === "income" && (
          <>
            <AnalyticsSummaryCard label="Total" value={formatAnalyticsCurrency(incomeSummary.total)} tone="positive" />
            <AnalyticsSummaryCard label="Média mensal" value={formatAnalyticsCurrency(incomeSummary.average)} />
            <AnalyticsSummaryCard label="Maior mês" value={formatAnalyticsCurrency(incomeSummary.highest?.income ?? 0)} detail={incomeSummary.highest?.competenceName ?? "Sem dados"} tone="positive" />
            <AnalyticsSummaryCard label="Menor mês" value={formatAnalyticsCurrency(incomeSummary.lowest?.income ?? 0)} detail={incomeSummary.lowest?.competenceName ?? "Sem dados"} />
          </>
        )}

        {kind === "expenses" && (
          <>
            <AnalyticsSummaryCard label="Total" value={formatAnalyticsCurrency(expenseSummary.total)} tone="negative" />
            <AnalyticsSummaryCard label="Média mensal" value={formatAnalyticsCurrency(expenseSummary.average)} />
            <AnalyticsSummaryCard label="Maior mês" value={formatAnalyticsCurrency(expenseSummary.highest?.expenses ?? 0)} detail={expenseSummary.highest?.competenceName ?? "Sem dados"} tone="negative" />
            <AnalyticsSummaryCard label="Menor mês" value={formatAnalyticsCurrency(expenseSummary.lowest?.expenses ?? 0)} detail={expenseSummary.lowest?.competenceName ?? "Sem dados"} />
          </>
        )}

        {kind === "cash-flow" && (
          <>
            <AnalyticsSummaryCard label="Saldo inicial" value={formatAnalyticsCurrency(openingBalance)} />
            <AnalyticsSummaryCard label={includePendingCashFlow ? "Entradas realizadas e previstas" : "Entradas realizadas"} value={formatAnalyticsCurrency(totalCashIn)} tone="positive" />
            <AnalyticsSummaryCard label={includePendingCashFlow ? "Saídas realizadas e previstas" : "Saídas realizadas"} value={formatAnalyticsCurrency(totalCashOut)} tone="negative" />
            <AnalyticsSummaryCard label={includePendingCashFlow ? "Saldo projetado" : "Saldo realizado"} value={formatAnalyticsCurrency(finalCashBalance)} tone={finalCashBalance >= 0 ? "info" : "negative"} />
          </>
        )}
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        {kind === "overview" && (
          <>
            <AnalyticsChartCard title="Receitas x Despesas" description="Evolução das competências abrangidas pelo período.">
              <MonthlyLines data={monthly} lines={[{ key: "income", name: "Receitas", color: chartColors.income }, { key: "expenses", name: "Despesas", color: chartColors.expenses }]} />
            </AnalyticsChartCard>
            <AnalyticsChartCard title="Resultado mensal" description="Resultado entre receitas e despesas em cada competência.">
              <MonthlyBars data={monthly} bars={[{ key: "balance", name: "Saldo", color: chartColors.balance }]} />
            </AnalyticsChartCard>
            <AnalyticsChartCard title="Top categorias" description="Categorias com maior volume de despesas no período.">
              <BreakdownBars data={expenseCategories} />
            </AnalyticsChartCard>
            <section className="min-h-72 rounded-2xl border border-dashed border-cyan-400/20 bg-cyan-500/[0.03] p-5">
              <h2 className="font-semibold text-cyan-200">Últimos Insights</h2>
              <div className="flex min-h-60 items-center justify-center text-center text-sm text-slate-400">
                Insights serão disponibilizados na próxima fase.
              </div>
            </section>
          </>
        )}

        {kind === "income" && (
          <>
            <AnalyticsChartCard title="Evolução mensal" description="Receitas agrupadas por competência.">
              <MonthlyLines data={monthly} lines={[{ key: "income", name: "Receitas", color: chartColors.income }]} />
            </AnalyticsChartCard>
            <AnalyticsChartCard title="Receitas por categoria" description="Principais categorias do período.">
              <BreakdownBars data={incomeCategories} />
            </AnalyticsChartCard>
            <AnalyticsChartCard title="Receitas por conta" description="Contas que receberam as receitas.">
              <BreakdownBars data={incomeAccounts} />
            </AnalyticsChartCard>
          </>
        )}

        {kind === "expenses" && (
          <>
            <AnalyticsChartCard title="Evolução mensal" description="Despesas agrupadas por competência.">
              <MonthlyLines data={monthly} lines={[{ key: "expenses", name: "Despesas", color: chartColors.expenses }]} />
            </AnalyticsChartCard>
            <AnalyticsChartCard title="Categorias" description="Categorias com maior volume de despesas.">
              <BreakdownBars data={expenseCategories} />
            </AnalyticsChartCard>
            <AnalyticsChartCard title="Contas" description="Despesas distribuídas por conta e cartão.">
              <BreakdownBars data={expenseAccounts} />
            </AnalyticsChartCard>
            <AnalyticsChartCard title="Cartões" description="Compras concentradas em cartões.">
              <BreakdownBars data={expenseCards} />
            </AnalyticsChartCard>
          </>
        )}

        {kind === "cash-flow" && (
          <>
            <AnalyticsChartCard title={includePendingCashFlow ? "Fluxo realizado e previsto" : "Fluxo realizado"} description="Entradas e saídas de contas por vencimento.">
              <MonthlyBars data={monthly} bars={[{ key: "cashIn", name: "Entradas", color: chartColors.income }, { key: "cashOut", name: "Saídas", color: chartColors.expenses }]} />
            </AnalyticsChartCard>
            <AnalyticsChartCard title="Saldo acumulado das contas" description="Saldo inicial somado aos movimentos mensais.">
              <MonthlyLines data={monthly} lines={[{ key: "cumulativeCashBalance", name: "Saldo", color: chartColors.balance }]} />
            </AnalyticsChartCard>
          </>
        )}
      </div>

      <MonthlyTable
        kind={kind}
        monthly={monthly}
        includePendingCashFlow={includePendingCashFlow}
      />

      <div className="flex justify-end">
        <CsvExportButton
          filename={`finance-smart-${kind}-${filters.competenceId || "periodo"}`}
          headers={csvHeaders}
          rows={csvRows}
        />
      </div>
    </div>
  );
}
