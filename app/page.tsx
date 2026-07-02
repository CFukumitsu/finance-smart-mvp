"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "./components/layout/AppShell";
import { supabase } from "@/src/lib/supabase";
import { updateOverduePaymentStatusesOncePerDay } from "@/src/services/paymentStatusService";
import {
  calculateCardRealizedValue,
  calculateCashFlowTotals,
  calculateCategoryRealizedValue,
  calculateComparisonPending,
} from "@/src/utils/balanceCalculations";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Transaction = {
  id: string;
  description: string;
  due_date: string;
  type: string;
  value: number;
  status: string | null;
  account_id: string | null;
  category_id: string | null;
  account:
  | { name?: string | null; type?: string | null; limit_amount?: number | null }
  | null;
  category:
  | {
    name?: string | null;
    monthly_limit?: number | null;
    monthly_goal?: number | null;
    show_on_dashboard?: boolean | null;
    dashboard_order?: number | null;
    active?: boolean | null;
  }
  | null;
  competence: { name: string } | null;
};

type Competence = {
  id: string;
  name: string;
  month: number;
  year: number;
  status: string;
};

type ComparisonItem = {
  name: string;
  planned: number;
  realized: number;
  pending: number;
};

type FinancialTarget = {
  target_type: "account" | "category";
  target_id: string;
  planned_value: number;
};

export default function DashboardPage() {
  const [currentCompetence, setCurrentCompetence] = useState<Competence | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [cashFlowTransactions, setCashFlowTransactions] = useState<Transaction[]>([]);
  const [previousCardTransactions, setPreviousCardTransactions] = useState<Transaction[]>([]);
  const [accountTargets, setAccountTargets] = useState<Record<string, number>>({});
  const [categoryTargets, setCategoryTargets] = useState<Record<string, number>>({});

  function getPreviousMonth(month: number, year: number) {
    if (month === 1) {
      return { month: 12, year: year - 1 };
    }

    return { month: month - 1, year };
  }

  async function loadDashboardData(targetMonth?: number, targetYear?: number) {
    setIsLoading(true);

    const today = new Date();
    const currentMonth = targetMonth ?? today.getMonth() + 1;
    const currentYear = targetYear ?? today.getFullYear();

    const { data: competenceData, error: competenceError } = await supabase
      .from("competences")
      .select("id, name, month, year, status")
      .eq("month", currentMonth)
      .eq("year", currentYear)
      .single();

    if (competenceError || !competenceData) {
      console.error("Erro ao carregar competência atual:", competenceError);
      setCurrentCompetence(null);
      setIsLoading(false);
      return;
    }

    setCurrentCompetence(competenceData as Competence);

    const { data: targetData, error: targetError } = await supabase
      .from("financial_targets")
      .select("target_type, target_id, planned_value")
      .eq("competence_id", competenceData.id)
      .in("target_type", ["account", "category"]);

    if (targetError) {
      console.error("Erro ao carregar metas financeiras:", targetError);
      setAccountTargets({});
      setCategoryTargets({});
    } else {
      const targets = (targetData ?? []) as FinancialTarget[];

      const accountTargetMap = targets
        .filter((target) => target.target_type === "account")
        .reduce<Record<string, number>>((acc, target) => {
          acc[target.target_id] = Number(target.planned_value ?? 0);
          return acc;
        }, {});

      const categoryTargetMap = targets
        .filter((target) => target.target_type === "category")
        .reduce<Record<string, number>>((acc, target) => {
          acc[target.target_id] = Number(target.planned_value ?? 0);
          return acc;
        }, {});

      setAccountTargets(accountTargetMap);
      setCategoryTargets(categoryTargetMap);
    }

    const previousMonth = getPreviousMonth(currentMonth, currentYear);

    const { data: previousCompetenceData } = await supabase
      .from("competences")
      .select("id, name, month, year, status")
      .eq("month", previousMonth.month)
      .eq("year", previousMonth.year)
      .single();

    const { data: cashFlowData, error: cashFlowError } = await supabase
      .from("transactions")
      .select(`
    id,
    description,
    due_date,
    type,
    value,
    status,
    account_id,
    category_id,
    account:accounts!transactions_account_id_fkey(name, type, limit_amount),
    category:categories!transactions_category_id_fkey(name, monthly_limit, monthly_goal, show_on_dashboard, dashboard_order, active),
    competence:competences!transactions_competence_id_fkey(name)
  `)
      .eq("competence_id", competenceData.id);

    if (cashFlowError) {
      console.error("Erro ao carregar fluxo de caixa:", cashFlowError);
      setCashFlowTransactions([]);
    } else {
      setCashFlowTransactions((cashFlowData ?? []) as unknown as Transaction[]);
    }

    if (previousCompetenceData) {
      const { data: previousCardData, error: previousCardError } = await supabase
        .from("transactions")
        .select(`
      id,
      description,
      due_date,
      type,
      value,
      status,
      account_id,
      category_id,
      account:accounts!transactions_account_id_fkey(name, type, limit_amount),
      category:categories!transactions_category_id_fkey(name, monthly_limit, monthly_goal, show_on_dashboard, dashboard_order, active),
      competence:competences!transactions_competence_id_fkey(name)
    `)
        .eq("competence_id", previousCompetenceData.id);

      if (previousCardError) {
        console.error("Erro ao carregar faturas do mês anterior:", previousCardError);
        setPreviousCardTransactions([]);
      } else {
        setPreviousCardTransactions(
          ((previousCardData ?? []) as unknown as Transaction[]).filter(
            (transaction) => transaction.account?.type === "Cartão"
          )
        );
      }
    } else {
      setPreviousCardTransactions([]);
    }

    setIsLoading(false);
  }

  useEffect(() => {
    async function initDashboard() {
      await updateOverduePaymentStatusesOncePerDay();
      await loadDashboardData();
    }

    initDashboard();
  }, []);
  
  const cashFlowTotals = useMemo(
    () => calculateCashFlowTotals(cashFlowTransactions, previousCardTransactions),
    [cashFlowTransactions, previousCardTransactions]
  );

  const cardComparisonData = useMemo<ComparisonItem[]>(() => {
    const grouped = previousCardTransactions.reduce<
      Record<string, ComparisonItem>
    >((acc, transaction) => {
      const cardName = transaction.account?.name ?? "Cartão sem nome";

      if (!acc[cardName]) {
        acc[cardName] = {
          name: cardName,
          planned: Number(accountTargets[transaction.account_id ?? ""] ?? 0),
          realized: 0,
          pending: 0,
        };
      }
      acc[cardName].realized = calculateCardRealizedValue(
        previousCardTransactions.filter(
          (item) => item.account_id === transaction.account_id
        )
      );

      return acc;
    }, {});

    return Object.values(grouped)
      .map((item) => ({
        ...item,
        pending: calculateComparisonPending(item.planned, item.realized),
      }))
      .filter((item) => item.planned !== 0 || item.realized !== 0)
      .sort((a, b) => b.planned - a.planned);
  }, [previousCardTransactions, accountTargets]);

  const categoryComparisonData = useMemo<ComparisonItem[]>(() => {
    const grouped = cashFlowTransactions
      .filter(
        (transaction) =>
          transaction.type === "Despesa" &&
          transaction.category?.active !== false &&
          transaction.category?.show_on_dashboard !== false
      )
      .reduce<Record<string, ComparisonItem>>((acc, transaction) => {
        const categoryName = transaction.category?.name ?? "Sem categoria";

        if (!acc[categoryName]) {
          acc[categoryName] = {
            name: categoryName,
            planned: Number(categoryTargets[transaction.category_id ?? ""] ?? 0),
            realized: 0,
            pending: 0,
          };
        }

        acc[categoryName].realized = calculateCategoryRealizedValue(
          cashFlowTransactions.filter(
            (item) => item.category_id === transaction.category_id
          )
        );

        return acc;
      }, {});

    return Object.values(grouped)
      .map((item) => ({
        ...item,
        pending: calculateComparisonPending(item.planned, item.realized),
      }))
      .filter((item) => item.planned !== 0 || item.realized !== 0)
      .sort((a, b) => {
        const categoryA = cashFlowTransactions.find(
          (transaction) => transaction.category?.name === a.name
        )?.category;

        const categoryB = cashFlowTransactions.find(
          (transaction) => transaction.category?.name === b.name
        )?.category;

        const orderA = categoryA?.dashboard_order ?? 9999;
        const orderB = categoryB?.dashboard_order ?? 9999;

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        return b.planned - a.planned;
      });
  }, [cashFlowTransactions, categoryTargets]);


  function goToPreviousCompetence() {
    if (!currentCompetence || isLoading) return;

    const previous = getPreviousMonth(
      currentCompetence.month,
      currentCompetence.year
    );

    loadDashboardData(previous.month, previous.year);
  }

  function goToNextCompetence() {
    if (!currentCompetence || isLoading) return;

    const next =
      currentCompetence.month === 12
        ? { month: 1, year: currentCompetence.year + 1 }
        : { month: currentCompetence.month + 1, year: currentCompetence.year };

    loadDashboardData(next.month, next.year);
  }

  function formatCurrency(value: number) {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-400">
              Visão executiva do fluxo de caixa por competência.
              {currentCompetence ? `: ${currentCompetence.name}` : "."}
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-2">
            <button
              type="button"
              onClick={goToPreviousCompetence}
              disabled={isLoading || !currentCompetence}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Anterior
            </button>

            <div className="min-w-32 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Competência
              </p>
              <p className="text-sm font-bold text-white">
                {currentCompetence?.name ?? "Carregando..."}
              </p>
            </div>

            <button
              type="button"
              onClick={goToNextCompetence}
              disabled={isLoading || !currentCompetence}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próxima →
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <p className="text-sm text-slate-400">Entradas previstas</p>
            <p className="mt-2 text-2xl font-bold text-emerald-300">
              {formatCurrency(cashFlowTotals.income)}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <p className="text-sm text-slate-400">Despesas da competência</p>
            <p className="mt-2 text-2xl font-bold text-red-300">
              {formatCurrency(cashFlowTotals.accountExpenses)}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <p className="text-sm text-slate-400">Faturas do mês anterior</p>
            <p className="mt-2 text-2xl font-bold text-orange-300">
              {formatCurrency(cashFlowTotals.creditCardInvoices)}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <p className="text-sm text-slate-400">Saldo projetado</p>
            <p
              className={`mt-2 text-2xl font-bold ${cashFlowTotals.projectedBalance >= 0
                ? "text-emerald-300"
                : "text-red-300"
                }`}
            >
              {formatCurrency(cashFlowTotals.projectedBalance)}
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <ComparisonBarChart
            title="Previsto x Realizado por Cartão"
            description="Faturas do mês anterior que impactam o fluxo de caixa."
            data={cardComparisonData}
            formatCurrency={formatCurrency}
            emptyMessage="Nenhuma fatura encontrada."
          />

          <ComparisonBarChart
            title="Previsto x Realizado por Categoria"
            description="Despesas da competência atual."
            data={categoryComparisonData}
            formatCurrency={formatCurrency}
            emptyMessage="Nenhuma categoria encontrada."
          />
        </div>
      </div>
    </AppShell>
  );
}

function ComparisonBarChart({
  title,
  description,
  data,
  formatCurrency,
  emptyMessage,
}: {
  title: string;
  description: string;
  data: ComparisonItem[];
  formatCurrency: (value: number) => string;
  emptyMessage: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6">
      <div className="mb-6">
        <p className="text-sm font-semibold text-blue-300">{title}</p>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>

      {data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />

              <XAxis
                dataKey="name"
                stroke="#94a3b8"
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-90}
                textAnchor="end"
                height={130}
              />

              <YAxis
                stroke="#94a3b8"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  Number(value).toLocaleString("pt-BR", {
                    notation: "compact",
                    compactDisplay: "short",
                  })
                }
              />

              <Tooltip
                cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                contentStyle={{
                  backgroundColor: "#020617",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "12px",
                  color: "#ffffff",
                }}
                labelStyle={{
                  color: "#ffffff",
                  fontWeight: 700,
                }}
                itemStyle={{
                  color: "#ffffff",
                }}
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  String(name),
                ]}
              />

              <Legend content={() => null} />

              <Bar
                dataKey="planned"
                name="Previsto"
                fill="#3b82f6"
                radius={[6, 6, 0, 0]}
              />

              <Bar
                dataKey="realized"
                name="Realizado"
                radius={[6, 6, 0, 0]}
              >
                {data.map((item) => (
                  <Cell
                    key={`realized-${item.name}`}
                    fill={
                      item.realized > item.planned
                        ? "#ef4444" // vermelho
                        : item.realized >= item.planned * 0.8
                          ? "#facc15" // amarelo
                          : "#10b981" // verde
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-500" />
              <span className="text-slate-300">Planejado</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-emerald-500" />
              <span className="text-slate-300">Dentro do previsto</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-slate-300">Acima do previsto</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}