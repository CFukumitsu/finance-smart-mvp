"use client";

import ThemeSelector from "./ThemeSelector";
import { confirmAction } from "@/src/components/ui/feedback/feedbackStore";
import { useViewPreferences } from "@/src/components/ui/viewMode/useViewMode";
import { viewModeOptions } from "@/src/components/ui/viewMode/ViewModeToggle";

/** Seção Aparência do menu do usuário: tema e visualização padrão. */
export default function AppearanceSettings() {
  const { defaultMode, exceptionCount, setDefaultMode, restoreAll } = useViewPreferences();

  async function handleRestoreAll() {
    const confirmed = await confirmAction({
      title: "Restaurar visualização das telas",
      message:
        exceptionCount === 1
          ? "A tela com visualização própria voltará a seguir a visualização padrão."
          : `As ${exceptionCount} telas com visualização própria voltarão a seguir a visualização padrão.`,
      confirmLabel: "Restaurar",
    });
    if (confirmed) restoreAll();
  }

  return (
    <section aria-labelledby="appearance-settings-title">
      <p
        id="appearance-settings-title"
        className="px-3 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
      >
        Aparência
      </p>
      <ThemeSelector />
      <div className="px-2 py-1.5">
        <p className="mb-1.5 px-1 text-xs font-semibold text-slate-400">Visualização padrão</p>
        <div
          className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 p-1"
          role="group"
          aria-label="Visualização padrão das telas"
        >
          {viewModeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setDefaultMode(value)}
              aria-pressed={defaultMode === value}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-[11px] font-semibold transition ${
                defaultMode === value
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={15} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {exceptionCount > 0 && (
          <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-[11px] text-slate-400">
            <span className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
              {exceptionCount === 1
                ? "1 tela com visualização própria"
                : `${exceptionCount} telas com visualização própria`}
            </span>
            <button
              type="button"
              onClick={handleRestoreAll}
              className="shrink-0 rounded-md px-1 py-0.5 font-semibold text-blue-400 hover:underline"
            >
              Restaurar todas
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
