"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import AppShell from "../../../components/layout/AppShell";
import {
  addProjectionExcludedMonth,
  loadReserveProjectionSettings,
  removeProjectionExcludedMonth,
  saveReserveProjectionModel,
  type ProjectionExcludedMonth,
} from "@/src/services/financialOverviewService";
import {
  describeReserveProjectionBasis,
  describeReserveProjectionFallback,
  isReserveProjectionModel,
  planReserveProjection,
  RESERVE_PROJECTION_MODEL_LABELS,
  RESERVE_PROJECTION_MODELS,
  shiftMonth,
  type ReserveProjectionModel,
  type ReserveProjectionSettings,
} from "@/src/utils/financialOverview";

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const monthLabel = (key: string) => `${key.slice(5, 7)}/${key.slice(0, 4)}`;

const MODEL_HINTS: Record<ReserveProjectionModel, string> = {
  weighted_average:
    "Usa os 3 últimos meses completos válidos, com pesos 3, 2 e 1 (o mais recente pesa mais). É o padrão.",
  last_month:
    "Usa somente o último mês completo válido. Se ele estiver desconsiderado, usa o mês válido anterior.",
  reference_month:
    "Usa sempre o mês escolhido abaixo como base, enquanto esta opção estiver ativa.",
};

const fieldClass =
  "min-h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:border-orange-400";

type Feedback = { type: "success" | "error"; message: string } | null;

export default function FinancialOverviewSettingsPage() {
  const today = useMemo(() => todayIso(), []);
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const previous = shiftMonth(currentYear, currentMonth, -1);
  const lastCompleteMonth = `${previous.year}-${String(previous.month).padStart(2, "0")}`;

  const [saved, setSaved] = useState<ReserveProjectionSettings | null>(null);
  const [excludedMonths, setExcludedMonths] = useState<ProjectionExcludedMonth[]>([]);
  const [modelDraft, setModelDraft] = useState<ReserveProjectionModel>("weighted_average");
  const [referenceDraft, setReferenceDraft] = useState("");
  const [excludeMonthDraft, setExcludeMonthDraft] = useState("");
  const [excludeNoteDraft, setExcludeNoteDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [modelFeedback, setModelFeedback] = useState<Feedback>(null);
  const [monthsFeedback, setMonthsFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadReserveProjectionSettings();
        if (cancelled) return;
        setSaved(data.settings);
        setExcludedMonths(data.excludedMonths);
        setModelDraft(data.settings.model);
        setReferenceDraft(data.settings.referenceMonth ?? "");
        setLoadError(null);
      } catch (error) {
        console.error("Erro ao carregar as configurações da Visão Financeira:", error);
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Erro ao carregar configurações.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const excludedKeys = useMemo(() => excludedMonths.map((item) => item.month), [excludedMonths]);

  // Validação explícita do mês de referência: obrigatório, completo e não desconsiderado.
  const referenceError = modelDraft !== "reference_month"
    ? null
    : !referenceDraft
      ? "Escolha o mês de referência."
      : referenceDraft > lastCompleteMonth
        ? "Escolha um mês completo (anterior ao mês atual)."
        : excludedKeys.includes(referenceDraft)
          ? `${monthLabel(referenceDraft)} está desconsiderado nas projeções. Escolha outro mês ou remova-o da lista abaixo.`
          : null;

  const draftSettings: ReserveProjectionSettings = {
    model: modelDraft,
    referenceMonth: modelDraft === "reference_month" ? referenceDraft || null : saved?.referenceMonth ?? null,
    excludedMonths: excludedKeys,
  };
  const draftPlan = planReserveProjection(currentYear, currentMonth, today, draftSettings);
  const savedPlan = saved
    ? planReserveProjection(currentYear, currentMonth, today, { ...saved, excludedMonths: excludedKeys })
    : null;
  const savedWarning = savedPlan ? describeReserveProjectionFallback(savedPlan) : null;
  const isDirty = saved !== null && (
    modelDraft !== saved.model ||
    (modelDraft === "reference_month" && referenceDraft !== (saved.referenceMonth ?? ""))
  );

  async function saveModel() {
    if (isSaving || referenceError) return;
    setIsSaving(true);
    setModelFeedback(null);
    try {
      await saveReserveProjectionModel({
        model: modelDraft,
        // Fora do modelo "mês de referência", mantém a última escolha gravada.
        referenceMonth: modelDraft === "reference_month" ? referenceDraft : saved?.referenceMonth ?? null,
      });
      setModelFeedback({ type: "success", message: "Modelo da reserva estimada salvo." });
      setReloadToken((current) => current + 1);
    } catch (error) {
      setModelFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao salvar o modelo." });
    } finally {
      setIsSaving(false);
    }
  }

  async function addExcludedMonth() {
    if (isSaving) return;
    if (!/^\d{4}-\d{2}$/.test(excludeMonthDraft)) {
      setMonthsFeedback({ type: "error", message: "Escolha o mês a desconsiderar." });
      return;
    }
    if (excludedKeys.includes(excludeMonthDraft)) {
      setMonthsFeedback({ type: "error", message: "Este mês já está desconsiderado." });
      return;
    }
    if (saved?.model === "reference_month" && saved.referenceMonth === excludeMonthDraft) {
      const confirmed = window.confirm(
        `${monthLabel(excludeMonthDraft)} é o mês de referência da reserva estimada. Se for desconsiderado, a reserva passa a usar a média ponderada até você escolher outro mês de referência. Continuar?`,
      );
      if (!confirmed) return;
    }
    setIsSaving(true);
    setMonthsFeedback(null);
    try {
      await addProjectionExcludedMonth({ month: excludeMonthDraft, note: excludeNoteDraft });
      setExcludeMonthDraft("");
      setExcludeNoteDraft("");
      setMonthsFeedback({ type: "success", message: `${monthLabel(excludeMonthDraft)} não será considerado nas projeções.` });
      setReloadToken((current) => current + 1);
    } catch (error) {
      setMonthsFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao desconsiderar o mês." });
    } finally {
      setIsSaving(false);
    }
  }

  async function removeExcludedMonth(month: string) {
    if (isSaving) return;
    setIsSaving(true);
    setMonthsFeedback(null);
    try {
      await removeProjectionExcludedMonth(month);
      setMonthsFeedback({ type: "success", message: `${monthLabel(month)} volta a ser considerado nas projeções.` });
      setReloadToken((current) => current + 1);
    } catch (error) {
      setMonthsFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao remover o mês." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="overview-page mx-auto max-w-3xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">Visão Financeira</p>
            <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Configurações</h1>
            <p className="mt-1 text-sm text-slate-400">Preferências usadas nos cálculos da Visão Financeira.</p>
          </div>
          <Link href="/overview"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10">
            <ArrowLeft size={16} />
            Voltar para a Visão Financeira
          </Link>
        </header>

        {loadError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            Não foi possível carregar as configurações: {loadError}
          </div>
        )}

        {isLoading && !saved && !loadError && (
          <div className="h-48 animate-pulse rounded-2xl border border-white/10 bg-slate-950/60" aria-busy="true" />
        )}

        {saved && (
          <>
            <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-5" aria-labelledby="reserve-model-title">
              <h2 id="reserve-model-title" className="text-sm font-semibold uppercase tracking-wider text-orange-300">
                Reserva estimada
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Define de onde sai a estimativa histórica dos gastos variáveis. Gastos variáveis já lançados maiores
                que a estimativa continuam valendo como reserva, em qualquer modelo.
              </p>

              {savedWarning && (
                <p role="status" className="mt-4 rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-300">
                  {savedWarning}
                </p>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-semibold text-slate-200">Modelo padrão</span>
                  <select
                    value={modelDraft}
                    onChange={(event) => {
                      if (isReserveProjectionModel(event.target.value)) setModelDraft(event.target.value);
                      setModelFeedback(null);
                    }}
                    className={`${fieldClass} mt-2`}
                  >
                    {RESERVE_PROJECTION_MODELS.map((model) => (
                      <option key={model} value={model}>{RESERVE_PROJECTION_MODEL_LABELS[model]}</option>
                    ))}
                  </select>
                </label>

                {modelDraft === "reference_month" && (
                  <label className="block text-sm">
                    <span className="font-semibold text-slate-200">Mês de referência</span>
                    <input
                      type="month"
                      value={referenceDraft}
                      max={lastCompleteMonth}
                      onChange={(event) => {
                        setReferenceDraft(event.target.value);
                        setModelFeedback(null);
                      }}
                      aria-invalid={referenceError ? true : undefined}
                      aria-describedby="reference-month-help"
                      className={`${fieldClass} mt-2`}
                    />
                  </label>
                )}
              </div>

              <p className="mt-3 text-xs text-slate-400">{MODEL_HINTS[modelDraft]}</p>
              {referenceError && (
                <p id="reference-month-help" className="mt-2 text-xs text-red-300">{referenceError}</p>
              )}
              {!referenceError && (
                <p className="mt-2 text-xs text-slate-400">
                  Neste mês, a estimativa usará: <span className="font-semibold text-slate-200">
                    {describeReserveProjectionBasis(draftPlan)}
                  </span>
                  {" "}(mesmo período do mês: do dia seguinte a hoje até o fim do mês).
                </p>
              )}

              {modelFeedback && (
                <p role="status" className={`mt-3 text-sm ${modelFeedback.type === "success" ? "text-emerald-300" : "text-red-300"}`}>
                  {modelFeedback.message}
                </p>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={saveModel} disabled={isSaving || !isDirty || Boolean(referenceError)}
                  className="min-h-11 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-50">
                  {isSaving ? "Salvando..." : "Salvar modelo"}
                </button>
                {isDirty && (
                  <button type="button"
                    onClick={() => {
                      setModelDraft(saved.model);
                      setReferenceDraft(saved.referenceMonth ?? "");
                    }}
                    className="min-h-11 rounded-xl px-4 text-sm text-slate-400 hover:bg-white/10">
                    Descartar alterações
                  </button>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-5" aria-labelledby="excluded-months-title">
              <h2 id="excluded-months-title" className="text-sm font-semibold uppercase tracking-wider text-orange-300">
                Meses desconsiderados nas projeções
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Meses atípicos (ex.: uma viagem) não entram na estimativa: a média ponderada e o último mês pulam
                esses meses, e eles não podem ser usados como mês de referência.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-end">
                <label className="block text-sm">
                  <span className="font-semibold text-slate-200">Mês</span>
                  <input type="month" value={excludeMonthDraft}
                    onChange={(event) => {
                      setExcludeMonthDraft(event.target.value);
                      setMonthsFeedback(null);
                    }}
                    className={`${fieldClass} mt-2`} />
                </label>
                <label className="block text-sm">
                  <span className="font-semibold text-slate-200">Motivo (opcional)</span>
                  <input type="text" value={excludeNoteDraft} maxLength={120}
                    onChange={(event) => setExcludeNoteDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") addExcludedMonth(); }}
                    placeholder="Ex.: viagem internacional"
                    className={`${fieldClass} mt-2`} />
                </label>
                <button type="button" onClick={addExcludedMonth} disabled={isSaving || !excludeMonthDraft}
                  className="min-h-11 rounded-xl border border-orange-400/30 px-4 text-sm font-semibold text-orange-300 hover:bg-orange-500/10 disabled:opacity-50">
                  Desconsiderar mês
                </button>
              </div>

              {monthsFeedback && (
                <p role="status" className={`mt-3 text-sm ${monthsFeedback.type === "success" ? "text-emerald-300" : "text-red-300"}`}>
                  {monthsFeedback.message}
                </p>
              )}

              {excludedMonths.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-slate-400">
                  Nenhum mês desconsiderado: todos os meses entram nas projeções.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-white/5">
                  {excludedMonths.map((item) => (
                    <li key={item.month} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold tabular-nums text-white">
                          {monthLabel(item.month)}
                          {saved.model === "reference_month" && saved.referenceMonth === item.month && (
                            <span className="ml-2 text-xs font-normal text-orange-300">mês de referência</span>
                          )}
                        </p>
                        {item.note && <p className="break-words text-xs text-slate-400">{item.note}</p>}
                      </div>
                      <button type="button" onClick={() => removeExcludedMonth(item.month)} disabled={isSaving}
                        aria-label={`Voltar a considerar ${monthLabel(item.month)} nas projeções`}
                        title="Voltar a considerar nas projeções"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-red-300 disabled:opacity-50">
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
