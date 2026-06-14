"use client";

import { useEffect, useState } from "react";
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function ClosingsPageContent() {
  const [items, setItems] = useState<CompetenceWithClosure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);

    const { data, error } = await supabase
        .from("competences")
        .select("id, name")
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
  }, []);

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

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            Competências
          </h2>
        </div>

        <div className="overflow-x-auto">
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
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            isClosed
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