"use client";

import { useMemo } from "react";
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
      "Acompanhe receitas, despesas e resultado das últimas 12 competências em uma leitura única.",
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
    openingBalance,
    filters,
    includePendingCashFlow,
    isLoading,
    error,
  } = useAnalytics();
  const copy = screenCopy[kind];

  const monthly = useMemo(
    () =>
      buildMonthlyAnalytics({
        competences: selectedCompetences,
        transactions,
        filters,
        openingBalance,
        includePendingCashFlow,
      }),
    [selectedCompetences, transactions, filters, openingBalance, includePendingCashFlow]
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
    () => buildBreakdown(transactions, "Receita", "category"),
    [transactions]
  );
  const incomeAccounts = useMemo(
    () => buildBreakdown(transactions, "Receita", "account"),
    [transactions]
  );
  const expenseCategories = useMemo(
    () => buildBreakdown(transactions, "Despesa", "category"),
    [transactions]
  );
  const expenseAccounts = useMemo(
    () => buildBreakdown(transactions, "Despesa", "account"),
    [transactions]
  );
  const expenseCards = useMemo(
    () => buildBreakdown(transactions, "Despesa", "card"),
    [transactions]
  );

  const totalCashIn = monthly.reduce((sum, item) => sum + item.cashIn, 0);
  const totalCashOut = monthly.reduce((sum, item) => sum + item.cashOut, 0);
  const finalCashBalance = openingBalance + totalCashIn - totalCashOut;
  const netResult = incomeSummary.total - expenseSummary.total;
  const averageSavings = monthly.length > 0 ? netResult / monthly.length : 0;

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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kind === "overview" && (
          <>
            <AnalyticsSummaryCard label="Receitas · 12 meses" value={formatAnalyticsCurrency(incomeSummary.total)} tone="positive" />
            <AnalyticsSummaryCard label="Despesas · 12 meses" value={formatAnalyticsCurrency(expenseSummary.total)} tone="negative" />
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
            <AnalyticsChartCard title="Receitas x Despesas" description="Evolução das últimas 12 competências.">
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
