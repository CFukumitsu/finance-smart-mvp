"use client";

import { getAnalyticsQuickRange } from "@/src/utils/analyticsPredictive";
import { useAnalytics } from "./AnalyticsProvider";

type AnalyticsFiltersProps = {
  showCategory?: boolean;
  showStatus?: boolean;
  cashFlowMode?: boolean;
};

export default function AnalyticsFilters({
  showCategory = true,
  showStatus = true,
  cashFlowMode = false,
}: AnalyticsFiltersProps) {
  const {
    accounts,
    categories,
    competences,
    filters,
    setFilter,
    setDateRange,
    includePendingCashFlow,
    setIncludePendingCashFlow,
    isLoading,
  } = useAnalytics();

  const fieldClass = "min-w-0 rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400 disabled:opacity-60";

  function applyShortcut(shortcut: Parameters<typeof getAnalyticsQuickRange>[0]) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const range = getAnalyticsQuickRange(shortcut, today);
    setDateRange(range.startDate, range.endDate);
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:grid-cols-2 xl:grid-cols-6">
      <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-400">
        Competência final · janela padrão
        <select value={filters.competenceId} onChange={(event) => setFilter("competenceId", event.target.value)} disabled={isLoading && competences.length === 0} className={fieldClass}>
          {competences.map((competence) => <option key={competence.id} value={competence.id}>{competence.name}</option>)}
        </select>
      </label>

      <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-400">
        Data inicial
        <input type="date" value={filters.startDate} max={filters.endDate || undefined} onChange={(event) => setFilter("startDate", event.target.value)} className={fieldClass} />
      </label>

      <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-400">
        Data final
        <input type="date" value={filters.endDate} min={filters.startDate || undefined} onChange={(event) => setFilter("endDate", event.target.value)} className={fieldClass} />
      </label>

      <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-400">
        Conta ou cartão
        <select value={filters.accountId} onChange={(event) => setFilter("accountId", event.target.value)} className={fieldClass}>
          <option value="">Todas as contas</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.active ? "" : " (inativa)"}</option>)}
        </select>
      </label>

      {showCategory && (
        <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-400">
          Categoria
          <select value={filters.categoryId} onChange={(event) => setFilter("categoryId", event.target.value)} className={fieldClass}>
            <option value="">Todas as categorias</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? "" : " (inativa)"}</option>)}
          </select>
        </label>
      )}

      {showStatus && (
        <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-400">
          Status
          <select value={filters.status} onChange={(event) => setFilter("status", event.target.value)} className={fieldClass}>
            <option value="">Todos os status</option>
            <option value="Pendente">Pendente</option>
            <option value="Pago">Pago</option>
            <option value="Recebido">Recebido</option>
          </select>
        </label>
      )}

      {cashFlowMode && (
        <label className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white">
          <input type="checkbox" checked={includePendingCashFlow} onChange={(event) => setIncludePendingCashFlow(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-cyan-500" />
          <span className="min-w-0"><span className="block font-medium">Incluir pendentes</span><span className="block text-xs text-slate-500">Soma compromissos e recebimentos previstos.</span></span>
        </label>
      )}

      <div className="flex min-w-0 flex-wrap gap-2 sm:col-span-2 xl:col-span-6" aria-label="Atalhos de período">
        {([
          ["current-month", "Este mês"],
          ["last-7", "Últimos 7 dias"],
          ["last-30", "Últimos 30 dias"],
          ["previous-month", "Mês anterior"],
          ["current-year", "Ano atual"],
        ] as const).map(([shortcut, label]) => (
          <button key={shortcut} type="button" onClick={() => applyShortcut(shortcut)} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200">
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
