"use client";

import AppShell from "../components/layout/AppShell";

export default function ReconciliationPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Conciliação Bancária
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Importe extratos de cartões e contas para conciliar automaticamente
            com seus lançamentos.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6">
          <p className="text-slate-300">
            🚧 Módulo em desenvolvimento
          </p>
        </div>
      </div>
    </AppShell>
  );
}