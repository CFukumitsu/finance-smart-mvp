"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "./components/layout/AppShell";
import { supabase } from "@/src/lib/supabase";
import { updateOverduePaymentStatusesOncePerDay } from "@/src/services/paymentStatusService";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  account_id?: string | null;
  account:
  | { name: string; type?: string | null; limit_amount?: number | null }
  | null;
  category:
  | { name: string; monthly_limit?: number | null; monthly_goal?: number | null }
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

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentCompetence, setCurrentCompetence] = useState<Competence | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [cashFlowCompetence, setCashFlowCompetence] = useState<Competence | null>(null);
  const [cashFlowTransactions, setCashFlowTransactions] = useState<Transaction[]>([]);
  const [previousCardTransactions, setPreviousCardTransactions] = useState<Transaction[]>([]);

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
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setCurrentCompetence(competenceData as Competence);

    const { data, error } = await supabase
      .from("transactions")
      .select(`
        id,
description,
due_date,
type,
value,
status,
account_id,
account:accounts!transactions_account_id_fkey(name, type, limit_amount),
category:categories!transactions_category_id_fkey(name, monthly_limit, monthly_goal),
competence:competences!transactions_competence_id_fkey(name)
      `)
      .eq("competence_id", competenceData.id)
      .order("due_date", { ascending: false });

    if (error) {
      console.error("Erro ao carregar dashboard:", error);
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setTransactions((data ?? []) as unknown as Transaction[]);

    const previousMonth = getPreviousMonth(currentMonth, currentYear);

    const { data: previousCompetenceData } = await supabase
      .from("competences")
      .select("id, name, month, year, status")
      .eq("month", previousMonth.month)
      .eq("year", previousMonth.year)
      .single();

    setCashFlowCompetence(competenceData as Competence);

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
    account:accounts!transactions_account_id_fkey(name, type, limit_amount),
category:categories!transactions_category_id_fkey(name, monthly_limit, monthly_goal),
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
      account:accounts!transactions_account_id_fkey(name, type, limit_amount),
category:categories!transactions_category_id_fkey(name, monthly_limit, monthly_goal),
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

  const totals = useMemo(() => {
    const income = transactions
      .filter((item) => item.type === "Receita")
      .reduce((sum, item) => sum + Number(item.value), 0);

    const expense = transactions
      .filter((item) => item.type === "Despesa")
      .reduce((sum, item) => sum + Number(item.value), 0);

    const paid = transactions
      .filter((item) => item.status === "Pago")
      .reduce((sum, item) => sum + Number(item.value), 0);

    const pending = transactions
      .filter((item) => item.status === "Pendente")
      .reduce((sum, item) => sum + Number(item.value), 0);

    return {
      income,
      expense,
      result: income - expense,
      paid,
      pending,
    };
  }, [transactions]);

  const cashFlowTotals = useMemo(() => {
    const income = cashFlowTransactions
      .filter((item) => item.type === "Receita")
      .reduce((sum, item) => sum + Number(item.value), 0);

    const accountExpenses = cashFlowTransactions
      .filter(
        (item) =>
          item.type === "Despesa" &&
          item.account?.type === "Conta"
      )
      .reduce((sum, item) => sum + Number(item.value), 0);

    const creditCardInvoices = previousCardTransactions.reduce((sum, item) => {
      if (item.type === "Despesa") {
        return sum + Number(item.value);
      }

      if (item.type === "Receita") {
        return sum - Number(item.value);
      }

      return sum;
    }, 0);

    return {
      income,
      accountExpenses,
      creditCardInvoices,
      projectedBalance: income - accountExpenses - creditCardInvoices,
    };
  }, [cashFlowTransactions, previousCardTransactions]);

  const cardComparisonData = useMemo<ComparisonItem[]>(() => {
    const grouped = previousCardTransactions.reduce<
      Record<string, ComparisonItem>
    >((acc, transaction) => {
      const cardName = transaction.account?.name ?? "Cartão sem nome";

      if (!acc[cardName]) {
        acc[cardName] = {
          name: cardName,
          planned: Number(transaction.account?.limit_amount ?? 0),
          realized: 0,
          pending: 0,
        };
      }

      const value = Number(transaction.value);

      if (transaction.type === "Despesa") {
        acc[cardName].realized += value;
      }

      if (transaction.type === "Receita") {
        acc[cardName].realized -= value;
      }

      return acc;
    }, {});

    return Object.values(grouped)
      .map((item) => ({
        ...item,
        pending: item.planned - item.realized,
      }))
      .filter((item) => item.planned !== 0 || item.realized !== 0)
      .sort((a, b) => b.planned - a.planned);
  }, [previousCardTransactions]);

  const categoryComparisonData = useMemo<ComparisonItem[]>(() => {
    const grouped = cashFlowTransactions
      .filter((transaction) => transaction.type === "Despesa")
      .reduce<Record<string, ComparisonItem>>((acc, transaction) => {
        const categoryName = transaction.category?.name ?? "Sem categoria";

        if (!acc[categoryName]) {
          acc[categoryName] = {
            name: categoryName,
            planned: Number(
              transaction.category?.monthly_limit ??
              transaction.category?.monthly_goal ??
              0
            ),
            realized: 0,
            pending: 0,
          };
        }

        const value = Number(transaction.value);

        acc[categoryName].realized += value;

        return acc;
      }, {});

    return Object.values(grouped)
      .map((item) => ({
        ...item,
        pending: item.planned - item.realized,
      }))
      .filter((item) => item.planned !== 0 || item.realized !== 0)
      .sort((a, b) => b.planned - a.planned);
  }, [cashFlowTransactions]);


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
                angle={-20}
                textAnchor="end"
                height={70}
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
                formatter={(value) => formatCurrency(Number(value))}
              />

              <Legend />

              <Bar
                dataKey="planned"
                name="Previsto"
                fill="#3b82f6"
                radius={[6, 6, 0, 0]}
              />

              <Bar
                dataKey="realized"
                name="Realizado"
                fill="#10b981"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}