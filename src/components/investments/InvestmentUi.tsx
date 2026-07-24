"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useModalShortcuts } from "@/src/hooks/useModalShortcuts";

export const investmentField =
  "w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-50";

export const investmentCard =
  "rounded-2xl border border-white/10 bg-slate-950/60 p-5";

export function formatInvestmentMoney(value: number, currency = "BRL") {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `${currency} ${(Number.isFinite(value) ? value : 0).toLocaleString(
      "pt-BR",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    )}`;
  }
}

export function formatInvestmentQuantity(value: number) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
}

export function formatInvestmentDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value.slice(0, 10)}T00:00:00Z`),
  );
}

export function formatInvestmentMonth(value: string) {
  const [year, month] = value.slice(0, 7).split("-");
  return `${month}/${year}`;
}

export function parseInvestmentDecimal(value: string) {
  const normalized = value.trim();
  if (!normalized) return Number.NaN;
  const machineValue = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized;
  return Number(machineValue);
}

export function InvestmentToolbar({
  search,
  setSearch,
  children,
}: {
  search: string;
  setSearch: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 md:grid-cols-2 xl:flex xl:items-center">
      <label className="relative min-w-0 flex-1">
        <Search className="absolute left-3 top-3 text-slate-500" size={17} />
        <input
          aria-label="Pesquisar"
          className={`${investmentField} pl-10`}
          placeholder="Pesquisar..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {children}
    </div>
  );
}

export function InvestmentAddButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
    >
      <Plus size={17} />
      {children}
    </button>
  );
}

export function InvestmentTable({
  headers,
  children,
  minWidth = "900px",
}: {
  headers: string[];
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60">
      <table
        className="w-full text-left text-sm"
        style={{ minWidth }}
      >
        <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function InvestmentTd({
  children,
  strong = false,
}: {
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 ${
        strong ? "font-bold text-white" : "text-slate-300"
      }`}
    >
      {children}
    </td>
  );
}

export function InvestmentActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        aria-label="Editar"
        title="Editar"
        onClick={onEdit}
        className="rounded-lg border border-cyan-400/20 p-2 text-cyan-300 transition hover:bg-cyan-500/10"
      >
        <Pencil size={15} />
      </button>
      <button
        type="button"
        aria-label="Excluir"
        title="Excluir"
        onClick={onDelete}
        className="rounded-lg border border-red-400/20 p-2 text-red-300 transition hover:bg-red-500/10"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export function InvestmentInput({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-semibold text-slate-300">
      <span>{label}</span>
      {children}
      {hint && (
        <span className="block text-xs font-normal text-slate-500">{hint}</span>
      )}
    </label>
  );
}

export function InvestmentModal({
  title,
  close,
  saving,
  submit,
  children,
}: {
  title: string;
  close: () => void;
  saving: boolean;
  submit: () => void;
  children: ReactNode;
}) {
  useModalShortcuts({
    enabled: true,
    onEscape: close,
    onEnter: submit,
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-black text-white">{title}</h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={close}
            disabled={saving}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 disabled:opacity-50"
          >
            <X />
          </button>
        </div>

        <div className="space-y-4">{children}</div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InvestmentEmpty({
  title,
  text,
  href,
  actionLabel,
}: {
  title: string;
  text: string;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <div className={`${investmentCard} text-center`}>
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-xl">
        ◇
      </div>
      <h2 className="mt-3 font-bold text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
      {href && (
        <Link
          href={href}
          className="mt-4 inline-block rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950"
        >
          {actionLabel ?? "Continuar"}
        </Link>
      )}
    </div>
  );
}

export function InvestmentStatus({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
        active
          ? "bg-emerald-500/10 text-emerald-300"
          : "bg-slate-500/10 text-slate-400"
      }`}
    >
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}
