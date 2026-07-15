"use client";

import AppShell from "@/app/components/layout/AppShell";
import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import {
  ensureCompetenceExists,
  ensureCompetenceRange,
  listCompetences,
  MAX_COMPETENCE_RANGE_MONTHS,
  type Competence,
} from "@/src/services/competenceService";
import { closeCompetence, reopenCompetence } from "@/src/services/closingService";
import { useModalShortcuts } from "@/src/hooks/useModalShortcuts";
import { CalendarRange, LockKeyhole, LockOpen, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ModalMode = "single" | "range" | null;

function currentCompetenceKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export default function CompetencesPage() {
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [closedIds, setClosedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [singleReference, setSingleReference] = useState(currentCompetenceKey());
  const [rangeStart, setRangeStart] = useState(currentCompetenceKey());
  const [rangeEnd, setRangeEnd] = useState(currentCompetenceKey());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function loadData() {
    setIsLoading(true);
    try {
      await ensureCompetenceExists(new Date());
      const ownerId = await getCurrentUserId();
      const [competenceList, closuresResult] = await Promise.all([
        listCompetences(),
        supabase
          .from("competence_closures")
          .select("competence_id, status")
          .eq("owner_id", ownerId)
          .eq("status", "Fechada"),
      ]);

      if (closuresResult.error) throw new Error(closuresResult.error.message);
      setCompetences(competenceList);
      setClosedIds(new Set((closuresResult.data ?? []).map((item) => item.competence_id)));
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao carregar competências.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  function closeModal() {
    if (isSaving) return;
    setModalMode(null);
  }

  async function saveModal() {
    if (!modalMode || isSaving) return;
    setIsSaving(true);
    setFeedback(null);

    try {
      if (modalMode === "single") {
        const competence = await ensureCompetenceExists(singleReference);
        setFeedback({ type: "success", message: `Competência ${competence.name} preparada com sucesso.` });
      } else {
        const result = await ensureCompetenceRange(rangeStart, rangeEnd);
        setFeedback({
          type: "success",
          message: `Intervalo processado: ${result.created} criada(s) e ${result.existing} já existente(s).`,
        });
      }

      setModalMode(null);
      await loadData();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível criar as competências.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  useModalShortcuts({
    enabled: modalMode !== null,
    onEscape: closeModal,
    onEnter: () => void saveModal(),
  });

  async function validateAllAccountsAreClosed(competenceId: string) {
    const ownerId = await getCurrentUserId();
    const [accountsResult, accountClosuresResult, statementsResult] = await Promise.all([
      supabase.from("accounts").select("id, type").eq("owner_id", ownerId).eq("active", true),
      supabase.from("account_closures").select("account_id").eq("owner_id", ownerId).eq("competence_id", competenceId),
      supabase.from("credit_card_statements").select("account_id").eq("owner_id", ownerId).eq("competence_id", competenceId),
    ]);

    const error = accountsResult.error ?? accountClosuresResult.error ?? statementsResult.error;
    if (error) throw new Error(error.message);

    const closedAccountIds = new Set((accountClosuresResult.data ?? []).map((item) => item.account_id));
    const closedCardIds = new Set((statementsResult.data ?? []).map((item) => item.account_id));

    return (accountsResult.data ?? []).every((account) =>
      account.type === "Cartão" ? closedCardIds.has(account.id) : closedAccountIds.has(account.id)
    );
  }

  async function toggleClosed(competence: Competence) {
    const isClosed = closedIds.has(competence.id);
    if (!window.confirm(`Deseja ${isClosed ? "reabrir" : "fechar"} a competência ${competence.name}?`)) return;

    setProcessingId(competence.id);
    setFeedback(null);
    try {
      if (isClosed) {
        await reopenCompetence(competence.id);
      } else {
        const canClose = await validateAllAccountsAreClosed(competence.id);
        if (!canClose) {
          throw new Error("Feche todas as contas e faturas desta competência antes de fechá-la.");
        }
        await closeCompetence(competence.id);
      }

      setFeedback({ type: "success", message: `Competência ${isClosed ? "reaberta" : "fechada"} com sucesso.` });
      await loadData();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível alterar a competência.",
      });
    } finally {
      setProcessingId(null);
    }
  }

  const filteredCompetences = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return competences;
    return competences.filter((competence) => competence.name.toLowerCase().includes(normalizedSearch));
  }, [competences, search]);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Configurações</p>
            <h1 className="mt-1 text-3xl font-black text-white">Competências</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Consulte, crie e controle os meses financeiros da sua conta.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModalMode("single")}
              title="Criar competência"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-cyan-500 px-4 font-bold text-slate-950 transition hover:bg-cyan-400"
            >
              <Plus size={18} /> <span className="hidden sm:inline">Criar mês</span>
            </button>
            <button
              type="button"
              onClick={() => setModalMode("range")}
              title="Criar intervalo"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 font-bold text-white transition hover:bg-white/10"
            >
              <CalendarRange size={18} /> <span className="hidden sm:inline">Criar intervalo</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${feedback.type === "success" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-red-400/30 bg-red-400/10 text-red-200"}`}>
            {feedback.message}
          </div>
        )}

        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3">
          <Search size={18} className="text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar por ano ou mês (ex.: 2026-07)"
            className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-600"
          />
        </label>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
          {isLoading ? (
            <p className="p-6 text-center text-slate-400">Carregando competências...</p>
          ) : filteredCompetences.length === 0 ? (
            <p className="p-6 text-center text-slate-400">Nenhuma competência encontrada.</p>
          ) : (
            <div className="divide-y divide-white/10">
              {filteredCompetences.map((competence) => {
                const isClosed = closedIds.has(competence.id);
                return (
                  <div key={competence.id} className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
                    <div>
                      <p className="text-lg font-bold text-white">{competence.name}</p>
                      <p className={`mt-1 text-xs font-bold uppercase tracking-wider ${isClosed ? "text-amber-300" : "text-emerald-300"}`}>
                        {isClosed ? "Fechada" : "Aberta"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={processingId === competence.id}
                      onClick={() => void toggleClosed(competence)}
                      title={isClosed ? "Reabrir competência" : "Fechar competência"}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                    >
                      {isClosed ? <LockOpen size={18} /> : <LockKeyhole size={18} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-white">{modalMode === "single" ? "Criar competência" : "Criar intervalo"}</h2>
              <button type="button" onClick={closeModal} title="Fechar" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white">
                <X size={19} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {modalMode === "single" ? (
                <label className="block text-sm font-semibold text-slate-300">
                  Mês
                  <input type="month" value={singleReference} onChange={(event) => setSingleReference(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400/50" />
                </label>
              ) : (
                <>
                  <label className="block text-sm font-semibold text-slate-300">
                    Competência inicial
                    <input type="month" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400/50" />
                  </label>
                  <label className="block text-sm font-semibold text-slate-300">
                    Competência final
                    <input type="month" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400/50" />
                  </label>
                  <p className="text-xs text-slate-500">Limite de {MAX_COMPETENCE_RANGE_MONTHS} meses por operação.</p>
                </>
              )}
            </div>

            <button type="button" disabled={isSaving} onClick={() => void saveModal()} className="mt-6 w-full rounded-xl bg-cyan-500 px-4 py-3 font-black text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50">
              {isSaving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
