"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "./components/layout/AppShell";
import { supabase } from "@/src/lib/supabase";
import { updateOverduePaymentStatusesOncePerDay } from "@/src/services/paymentStatusService";

type Transaction = {
  id: string;
  description: string;
  due_date: string;
  type: string;
  value: number;
  status: string | null;
  account: { name: string } | null;
  category: { name: string } | null;
  competence: { name: string } | null;
};

type Competence = {
  id: string;
  name: string;
  month: number;
  year: number;
  status: string;
};

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentCompetence, setCurrentCompetence] = useState<Competence | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);

  async function loadDashboardData() {
    setIsLoading(true);

    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

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
        account:accounts!transactions_account_id_fkey(name),
        category:categories!transactions_category_id_fkey(name),
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

  const latestTransactions = transactions.slice(0, 5);

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
              Visão geral da competência atual
              {currentCompetence ? `: ${currentCompetence.name}` : "."}
            </p>
          </div>

          <Link
            href="/transactions?new=true"
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Novo lançamento
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <p className="text-sm text-slate-400">Receitas</p>
            <h2 className="mt-2 text-2xl font-bold text-emerald-400">
              {formatCurrency(totals.income)}
            </h2>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <p className="text-sm text-slate-400">Despesas</p>
            <h2 className="mt-2 text-2xl font-bold text-red-400">
              {formatCurrency(totals.expense)}
            </h2>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <p className="text-sm text-slate-400">Resultado</p>
            <h2 className="mt-2 text-2xl font-bold text-white">
              {formatCurrency(totals.result)}
            </h2>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <p className="text-sm text-slate-400">Pendente</p>
            <h2 className="mt-2 text-2xl font-bold text-yellow-400">
              {formatCurrency(totals.pending)}
            </h2>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white">
              Resumo financeiro
            </h2>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-white/5 p-4">
                <p className="text-sm text-slate-400">Total recebido / pago</p>
                <p className="mt-2 text-xl font-semibold text-white">
                  {formatCurrency(totals.paid)}
                </p>
              </div>

              <div className="rounded-xl bg-white/5 p-4">
                <p className="text-sm text-slate-400">Total em aberto</p>
                <p className="mt-2 text-xl font-semibold text-white">
                  {formatCurrency(totals.pending)}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-dashed border-white/10 p-8 text-center text-slate-400">
              Gráfico Receitas x Despesas será implementado na próxima sprint.
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6">
            <h2 className="text-lg font-semibold text-white">Ações rápidas</h2>

            <div className="mt-5 space-y-3">
              <Link
                href="/transactions?new=true"
                className="block rounded-xl bg-white/5 px-4 py-3 text-sm text-white hover:bg-white/10"
              >
                Novo lançamento
              </Link>

              <Link
                href="/accounts"
                className="block rounded-xl bg-white/5 px-4 py-3 text-sm text-white hover:bg-white/10"
              >
                Contas / Cartões
              </Link>

              <Link
                href="/categories"
                className="block rounded-xl bg-white/5 px-4 py-3 text-sm text-white hover:bg-white/10"
              >
                Categorias
              </Link>

              <Link
                href="/closings"
                className="block rounded-xl bg-white/5 px-4 py-3 text-sm text-white hover:bg-white/10"
              >
                Fechamentos
              </Link>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="text-lg font-semibold text-white">
              Últimos lançamentos da competência
            </h2>

            <Link
              href="/transactions"
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Ver todos
            </Link>
          </div>
          <div className="w-full overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-[900px] w-full">
              <thead className="bg-white/5 text-slate-300">
                <tr>
                  <th className="px-5 py-4">Descrição</th>
                  <th className="px-5 py-4">Tipo</th>
                  <th className="px-5 py-4">Valor</th>
                  <th className="px-5 py-4">Data</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/10">
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                      Carregando dashboard...
                    </td>
                  </tr>
                )}

                {!isLoading &&
                  latestTransactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-white/[0.03]">
                      <td className="px-5 py-4 text-white">
                        {transaction.description}
                      </td>
                      <td className="px-5 py-4 text-slate-300">
                        {transaction.type}
                      </td>
                      <td className="px-5 py-4 text-slate-300">
                        {formatCurrency(Number(transaction.value))}
                      </td>
                      <td className="px-5 py-4 text-slate-300">
                        {new Date(transaction.due_date + "T00:00:00").toLocaleDateString(
                          "pt-BR"
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-300">
                        {transaction.status ?? "-"}
                      </td>
                    </tr>
                  ))}

                {!isLoading && latestTransactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                      Nenhum lançamento encontrado para a competência atual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}