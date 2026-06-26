"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  closeCompetence,
  getClosureByCompetenceId,
  reopenCompetence,
} from "@/src/services/closingService";
import { supabase } from "@/src/lib/supabase";
import type { CompetenceClosure } from "@/src/types/closing";

type Competence = {
  id: string;
  name: string;
};

type CompetenceWithClosure = Competence & {
  closure: CompetenceClosure | null;
};

function getVisibleCompetenceNames(centerDate: Date) {
  const names: string[] = [];

  for (let offset = -3; offset <= 3; offset++) {
    const date = new Date(centerDate.getFullYear(), centerDate.getMonth() + offset, 1);
    names.push(getCompetenceName(date));
  }

  return names;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getCompetenceName(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
  })
    .format(date)
    .replace(".", "");
}

function getVisibleMonthDates(centerDate: Date) {
  const dates: Date[] = [];

  for (let offset = -3; offset <= 3; offset++) {
    dates.push(new Date(centerDate.getFullYear(), centerDate.getMonth() + offset, 1));
  }

  return dates;
}

export default function ClosingsPageContent() {
  const [items, setItems] = useState<CompetenceWithClosure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);
  const [centerDate, setCenterDate] = useState(() => new Date());

  async function loadData() {
    setIsLoading(true);

    const visibleCompetenceNames = getVisibleCompetenceNames(centerDate);

    const { data, error } = await supabase
      .from("competences")
      .select("id, name")
      .in("name", visibleCompetenceNames)
      .order("name", { ascending: false });

    if (error) {
      console.error("COMPETENCES ERROR:", error);
      alert(JSON.stringify(error, null, 2));

      setItems([]);
      setIsLoading(false);
      return;
    }

    const mapped = await Promise.all(
      (data ?? []).map(async (competence) => {
        const closure = await getClosureByCompetenceId(competence.id);

        return {
          ...competence,
          closure,
        };
      })
    );

    setItems(mapped);
    setIsLoading(false);
  }

  async function handleClose(competenceId: string) {
    setIsProcessingId(competenceId);

    try {
      await closeCompetence(competenceId);
      await loadData();
    } catch (error) {
      console.error(error);
      alert("Não foi possível fechar a competência.");
    } finally {
      setIsProcessingId(null);
    }
  }

  async function handleReopen(competenceId: string) {
    setIsProcessingId(competenceId);

    try {
      await reopenCompetence(competenceId);
      await loadData();
    } catch (error) {
      console.error(error);
      alert("Não foi possível reabrir a competência.");
    } finally {
      setIsProcessingId(null);
    }
  }

  useEffect(() => {
    loadData();
  }, [centerDate]);

  function goToPreviousMonth() {
    setCenterDate(
      (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)
    );
  }

  function goToNextMonth() {
    setCenterDate(
      (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)
    );
  }

  function goToCurrentMonth() {
    setCenterDate(new Date());
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 shadow-xl">
        <p className="text-sm font-medium text-emerald-400">
          Fechamento financeiro
        </p>

        <h1 className="mt-2 text-2xl font-semibold text-white">
          Fechamento de Competência
        </h1>

        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Feche uma competência para congelar o snapshot financeiro do período.
          Competências fechadas não devem permitir alterações nos lançamentos.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goToPreviousMonth}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex flex-1 items-center justify-center gap-2 overflow-x-auto">
            {getVisibleMonthDates(centerDate).map((date) => {
              const currentMonthName = getCompetenceName(new Date());
              const monthName = getCompetenceName(date);
              const isCurrentMonth = monthName === currentMonthName;
              const isCenterMonth = monthName === getCompetenceName(centerDate);

              return (
                <button
                  key={monthName}
                  type="button"
                  onClick={() => setCenterDate(date)}
                  className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold transition ${isCenterMonth
                      ? "bg-blue-600 text-white"
                      : isCurrentMonth
                        ? "bg-cyan-500/10 text-cyan-300"
                        : "bg-white/[0.03] text-slate-400 hover:bg-white/10 hover:text-white"
                    }`}
                >
                  {formatMonthLabel(date)}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={goToNextMonth}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={goToCurrentMonth}
            className="rounded-full px-3 py-1 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-white"
          >
            Voltar para o mês atual
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            Competências
          </h2>
        </div>

        <div className="grid gap-3 p-4 md:hidden">
          {isLoading && (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-center text-sm text-slate-400">
              Carregando competências...
            </div>
          )}

          {!isLoading &&
            items.map((item) => {
              const isClosed = item.closure?.status === "Fechada";
              const isProcessing = isProcessingId === item.id;

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-white">{item.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Competência financeira
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${isClosed
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-yellow-500/10 text-yellow-300"
                        }`}
                    >
                      {isClosed ? "Fechada" : "Aberta"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-white/[0.03] p-3">
                      <p className="text-xs text-slate-500">Receitas</p>
                      <p className="mt-1 font-semibold text-emerald-300">
                        {formatCurrency(item.closure?.total_income ?? 0)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white/[0.03] p-3">
                      <p className="text-xs text-slate-500">Despesas</p>
                      <p className="mt-1 font-semibold text-red-300">
                        {formatCurrency(item.closure?.total_expense ?? 0)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white/[0.03] p-3">
                      <p className="text-xs text-slate-500">Saldo</p>
                      <p className="mt-1 font-semibold text-white">
                        {formatCurrency(item.closure?.balance ?? 0)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white/[0.03] p-3">
                      <p className="text-xs text-slate-500">Pendências</p>
                      <p className="mt-1 font-semibold text-slate-200">
                        {formatCurrency(
                          (item.closure?.pending_income ?? 0) +
                          (item.closure?.pending_expense ?? 0)
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    {isClosed ? (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleReopen(item.id)}
                        className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isProcessing ? "Processando..." : "Reabrir competência"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleClose(item.id)}
                        className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isProcessing ? "Processando..." : "Fechar competência"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

          {!isLoading && items.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-center text-sm text-slate-400">
              Nenhuma competência encontrada.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase text-slate-400">
              <tr>
                <th className="px-6 py-4">Competência</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Receitas</th>
                <th className="px-6 py-4 text-right">Despesas</th>
                <th className="px-6 py-4 text-right">Saldo</th>
                <th className="px-6 py-4 text-right">Pendências</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10">
              {isLoading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-slate-400"
                  >
                    Carregando competências...
                  </td>
                </tr>
              )}

              {!isLoading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-slate-400"
                  >
                    Nenhuma competência encontrada.
                  </td>
                </tr>
              )}

              {!isLoading &&
                items.map((item) => {
                  const isClosed = item.closure?.status === "Fechada";
                  const isProcessing = isProcessingId === item.id;

                  return (
                    <tr
                      key={item.id}
                      className="bg-slate-950/30 hover:bg-white/[0.03]"
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">
                          {item.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          Competência financeira
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${isClosed
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-yellow-500/10 text-yellow-300"
                            }`}
                        >
                          {isClosed ? "Fechada" : "Aberta"}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right text-emerald-300">
                        {formatCurrency(item.closure?.total_income ?? 0)}
                      </td>

                      <td className="px-6 py-4 text-right text-red-300">
                        {formatCurrency(item.closure?.total_expense ?? 0)}
                      </td>

                      <td className="px-6 py-4 text-right font-semibold text-white">
                        {formatCurrency(item.closure?.balance ?? 0)}
                      </td>

                      <td className="px-6 py-4 text-right text-slate-300">
                        {formatCurrency(
                          (item.closure?.pending_income ?? 0) +
                          (item.closure?.pending_expense ?? 0)
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        {isClosed ? (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleReopen(item.id)}
                            className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isProcessing ? "Processando..." : "Reabrir"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleClose(item.id)}
                            className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isProcessing ? "Processando..." : "Fechar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}