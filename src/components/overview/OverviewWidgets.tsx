"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Info, type LucideIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type Tone = "green" | "blue" | "purple" | "red" | "orange" | "neutral";

export const toneText: Record<Tone, string> = {
  green: "text-emerald-300",
  blue: "text-blue-300",
  purple: "text-violet-300",
  red: "text-red-300",
  orange: "text-orange-300",
  neutral: "text-white",
};

const toneDot: Record<Tone, string> = {
  green: "bg-emerald-400",
  blue: "bg-blue-400",
  purple: "bg-violet-400",
  red: "bg-red-400",
  orange: "bg-orange-400",
  neutral: "bg-slate-400",
};

const toneBar: Record<Tone, string> = {
  green: "bg-emerald-500",
  blue: "bg-blue-500",
  purple: "bg-violet-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  neutral: "bg-slate-400",
};

/** Dica acessível: abre por clique/toque (title não funciona no celular). */
export function InfoTip({ text, label = "Mais informações" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={text}
        onClick={() => setOpen((current) => !current)}
        onBlur={() => setOpen(false)}
        className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
      >
        <Info size={14} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-7 z-20 w-64 max-w-[80vw] -translate-x-1/2 rounded-xl border border-white/10 bg-slate-900 p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-300 shadow-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}

export function StatCard({
  label,
  value,
  tone,
  hint,
  info,
  icon: Icon,
  children,
}: {
  label: string;
  value: string;
  tone: Tone;
  hint?: string;
  info?: string;
  /** Ícone discreto no lugar do ponto colorido. */
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-2xl border border-white/10 bg-slate-950/60 p-5">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {Icon
          ? <Icon aria-hidden="true" size={14} className={`shrink-0 ${toneText[tone]}`} />
          : <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[tone]}`} />}
        <span className="min-w-0 truncate">{label}</span>
        {info && <InfoTip text={info} />}
      </p>
      <p className={`mt-2 whitespace-nowrap text-2xl font-semibold tabular-nums tracking-tight ${toneText[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {children}
    </div>
  );
}

export function ProgressBar({ value, tone }: { value: number; tone: Tone }) {
  const width = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10" role="progressbar"
      aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${toneBar[tone]}`} style={{ width: `${width}%` }} />
    </div>
  );
}

const monthLabel = (date: Date) =>
  new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(date).replace(".", "");

/**
 * Seletor de competências. Celular: setas + mês anterior/atual/seguinte.
 * Telas maiores: 7 meses. A competência selecionada representa o próprio mês.
 */
export function CompetenceNavigator({
  year,
  month,
  disabled,
  onSelect,
}: {
  year: number;
  month: number;
  disabled: boolean;
  onSelect: (year: number, month: number) => void;
}) {
  const today = new Date();
  const go = (offset: number) => {
    const date = new Date(year, month - 1 + offset, 1);
    onSelect(date.getFullYear(), date.getMonth() + 1);
  };
  const isCurrentSelected = year === today.getFullYear() && month === today.getMonth() + 1;

  return (
    <div className="w-full rounded-xl border border-white/10 bg-slate-900 p-2">
      <div className="flex items-center justify-between gap-1">
        <button type="button" onClick={() => go(-1)} disabled={disabled} title="Competência anterior"
          aria-label="Competência anterior"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40">
          <ChevronLeft size={18} />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-hidden sm:gap-2">
          {[-3, -2, -1, 0, 1, 2, 3].map((offset) => {
            const date = new Date(year, month - 1 + offset, 1);
            const selected = offset === 0;
            const isToday = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
            const visibility = Math.abs(offset) <= 1 ? "inline-flex" : Math.abs(offset) === 2 ? "hidden md:inline-flex" : "hidden lg:inline-flex";
            return (
              <button
                key={offset}
                type="button"
                disabled={disabled}
                onClick={() => go(offset)}
                aria-current={selected ? "date" : undefined}
                className={`${visibility} h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold transition sm:px-4 ${
                  selected
                    ? "bg-blue-600 text-white"
                    : isToday
                      ? "bg-cyan-500/10 text-cyan-300"
                      : "bg-white/[0.03] text-slate-400 hover:bg-white/10 hover:text-white"
                } disabled:opacity-40`}
              >
                {selected ? monthLabel(date).toUpperCase() : monthLabel(date)}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => go(1)} disabled={disabled} title="Próxima competência"
          aria-label="Próxima competência"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40">
          <ChevronRight size={18} />
        </button>
      </div>
      {!isCurrentSelected && (
        <button type="button" disabled={disabled}
          onClick={() => onSelect(today.getFullYear(), today.getMonth() + 1)}
          className="mt-1 w-full rounded-lg py-2 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40">
          Voltar para o mês atual
        </button>
      )}
    </div>
  );
}

export type FormulaTerm = {
  label: string;
  value: string;
  tone: Tone;
  operator?: "−" | "+" | "=";
  info?: string;
};

/**
 * Composição auditável. Celular: lista vertical com o operador à esquerda.
 * Desktop: linha horizontal com os operadores entre os termos.
 */
export function FormulaBlock({ terms }: { terms: FormulaTerm[] }) {
  return (
    <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-3">
      {terms.map((term, index) => (
        <li key={term.label} className="flex min-w-0 items-stretch gap-2 lg:flex-1 lg:gap-3">
          {term.operator && (
            <span aria-hidden="true"
              className="flex w-6 shrink-0 items-center justify-center text-lg font-semibold text-slate-400">
              {term.operator}
            </span>
          )}
          <div className={`min-w-0 flex-1 rounded-xl border p-3 ${
            index === terms.length - 1 ? "border-emerald-400/30 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.02]"
          }`}>
            <p className="flex items-center gap-1 text-xs text-slate-400">
              <span className="min-w-0 truncate">{term.label}</span>
              {term.info && <InfoTip text={term.info} />}
            </p>
            <p className={`mt-1 whitespace-nowrap text-lg font-semibold tabular-nums ${toneText[term.tone]}`}>
              {term.value}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export type ChartItem = { name: string; value: number; color: string };

export function SavingsChart({ data, formatCurrency }: { data: ChartItem[]; formatCurrency: (value: number) => string }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
          <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11 }}
            tickFormatter={(value) => Number(value).toLocaleString("pt-BR", { notation: "compact", compactDisplay: "short" })} />
          <YAxis type="category" dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} width={110} />
          <Tooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
            contentStyle={{ backgroundColor: "#020617", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px", color: "#ffffff" }}
            labelStyle={{ color: "#ffffff", fontWeight: 700 }}
            itemStyle={{ color: "#ffffff" }}
            formatter={(value) => [formatCurrency(Number(value)), ""]}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
            {data.map((item) => <Cell key={item.name} fill={item.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
