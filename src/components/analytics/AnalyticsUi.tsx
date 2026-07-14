"use client";

import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { buildCsvContent } from "@/src/utils/csvExport";

export function formatAnalyticsCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function AnalyticsHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header>
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
        Análises
      </p>
      <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
        {description}
      </p>
    </header>
  );
}

export function AnalyticsSummaryCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "positive" | "negative" | "info";
}) {
  const tones = {
    neutral: "text-white",
    positive: "text-emerald-300",
    negative: "text-rose-300",
    info: "text-cyan-300",
  };

  return (
    <article className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 break-words text-xl font-bold sm:text-2xl ${tones[tone]}`}>
        {value}
      </p>
      {detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}
    </article>
  );
}

export function AnalyticsChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
      <h2 className="font-semibold text-white">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <div className="mt-5 h-72 min-w-0 sm:h-80">{children}</div>
    </section>
  );
}

export function CsvExportButton({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  function exportCsv() {
    const content = buildCsvContent(headers, rows);
    const blob = new Blob([content], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={exportCsv}
      disabled={rows.length === 0}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
    >
      <Download size={16} />
      Exportar CSV
    </button>
  );
}

export function AnalyticsEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 px-4 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}
