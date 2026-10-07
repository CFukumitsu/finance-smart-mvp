"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import type { ReserveCategoryBreakdown } from "@/src/utils/financialOverview";

/**
 * Detalhamento da reserva estimada: Top 10 categorias + "Outras categorias".
 * Celular: folha que sobe da base; telas maiores: diálogo centralizado.
 * Fecha por botão, Esc ou clique fora; devolve o foco a quem abriu.
 */
export function ReserveBreakdownDialog({
  open,
  onClose,
  breakdown,
  untilLabel,
  basisLabel,
  basisWarning,
  isFutureMonth,
  formatCurrency,
}: {
  open: boolean;
  onClose: () => void;
  breakdown: ReserveCategoryBreakdown;
  untilLabel: string;
  /** Modelo e meses que geraram a estimativa histórica (ex.: "Último mês — 09/2026"). */
  basisLabel: string;
  /** Aviso quando o modelo escolhido não pôde ser usado. */
  basisWarning: string | null;
  isFutureMonth: boolean;
  formatCurrency: (value: number) => string;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const percent = (amount: number) =>
    breakdown.total > 0 ? `${Math.round((amount / breakdown.total) * 100)}%` : "";
  const subtitle = breakdown.source === "registered"
    ? "Composição dos gastos variáveis já lançados até o fim do mês (eles superam a média do histórico)."
    : isFutureMonth
      ? "Onde você provavelmente gastará neste mês, com base no seu histórico."
      : "Onde você provavelmente gastará até o fim do mês, com base no seu histórico.";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full flex-col rounded-t-3xl border border-white/10 bg-slate-900 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-orange-300">Reserva estimada até {untilLabel}</h2>
            <p className="mt-1 whitespace-nowrap text-2xl font-semibold tabular-nums text-white">
              {formatCurrency(breakdown.total)}
            </p>
            <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
            <p className="mt-2 text-xs text-slate-400">
              Base da estimativa: <span className="font-semibold text-slate-200">{basisLabel}</span>
            </p>
            {basisWarning && <p className="mt-1 text-xs text-orange-300">{basisWarning}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar detalhamento"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {breakdown.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Não há reserva estimada para detalhar neste período.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {breakdown.items.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <span className="min-w-0 break-words text-slate-200">{item.name}</span>
                  <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                    <span className="text-xs text-slate-400">{percent(item.amount)}</span>
                    <span className="whitespace-nowrap text-white">{formatCurrency(item.amount)}</span>
                  </span>
                </li>
              ))}
              {breakdown.others && (
                <li className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <span className="min-w-0 text-slate-300">
                    Outras categorias <span className="text-xs text-slate-400">({breakdown.others.count})</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                    <span className="text-xs text-slate-400">{percent(breakdown.others.amount)}</span>
                    <span className="whitespace-nowrap text-white">{formatCurrency(breakdown.others.amount)}</span>
                  </span>
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="border-t border-white/10 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <div className="flex items-center justify-between gap-4 text-sm font-semibold">
            <span className="text-white">Total</span>
            <span className="whitespace-nowrap tabular-nums text-orange-300">{formatCurrency(breakdown.total)}</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {breakdown.source === "registered"
              ? "Valores dos lançamentos variáveis já registrados para o restante do mês."
              : isFutureMonth
                ? "Estimativa baseada no seu padrão de gastos para o mês."
                : "Estimativa baseada no seu padrão de gastos para o período restante do mês."}
          </p>
        </div>
      </div>
    </div>
  );
}
