"use client";

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
    includePendingCashFlow,
    setIncludePendingCashFlow,
    isLoading,
  } = useAnalytics();

  const fieldClass =
    "min-w-0 rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400 disabled:opacity-60";

  return (
    <section className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-400">
        Competência final · últimos 12 meses
        <select
          value={filters.competenceId}
          onChange={(event) => setFilter("competenceId", event.target.value)}
          disabled={isLoading && competences.length === 0}
          className={fieldClass}
        >
          {competences.map((competence) => (
            <option key={competence.id} value={competence.id}>
              {competence.name}
            </option>
          ))}
        </select>
      </label>

      <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-400">
        Conta ou cartão
        <select
          value={filters.accountId}
          onChange={(event) => setFilter("accountId", event.target.value)}
          className={fieldClass}
        >
          <option value="">Todas as contas</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}{account.active ? "" : " (inativa)"}
            </option>
          ))}
        </select>
      </label>

      {showCategory && (
        <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-400">
          Categoria
          <select
            value={filters.categoryId}
            onChange={(event) => setFilter("categoryId", event.target.value)}
            className={fieldClass}
          >
            <option value="">Todas as categorias</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}{category.active ? "" : " (inativa)"}
              </option>
            ))}
          </select>
        </label>
      )}

      {showStatus && (
        <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-400">
          Status
          <select
            value={filters.status}
            onChange={(event) => setFilter("status", event.target.value)}
            className={fieldClass}
          >
            <option value="">Todos os status</option>
            <option value="Pendente">Pendente</option>
            <option value="Pago">Pago</option>
            <option value="Recebido">Recebido</option>
          </select>
        </label>
      )}

      {cashFlowMode && (
        <label className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white">
          <input
            type="checkbox"
            checked={includePendingCashFlow}
            onChange={(event) => setIncludePendingCashFlow(event.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-cyan-500"
          />
          <span className="min-w-0">
            <span className="block font-medium">Incluir pendentes</span>
            <span className="block text-xs text-slate-500">
              Soma compromissos e recebimentos previstos.
            </span>
          </span>
        </label>
      )}
    </section>
  );
}
