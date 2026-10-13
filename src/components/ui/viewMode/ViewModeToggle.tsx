"use client";

import { LayoutGrid, List, type LucideIcon } from "lucide-react";
import type { ViewMode } from "./viewPreferences";

export const viewModeOptions: { value: ViewMode; label: string; icon: LucideIcon }[] = [
  { value: "list", label: "Lista", icon: List },
  { value: "cards", label: "Cartões", icon: LayoutGrid },
];

export function viewModeLabel(mode: ViewMode) {
  return viewModeOptions.find((option) => option.value === mode)?.label ?? "Lista";
}

type ViewModeToggleProps = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** A tela tem escolha própria, diferente de seguir o padrão global. */
  hasException?: boolean;
  defaultMode?: ViewMode;
  /** Classes extras do contêiner (ex.: ocultar no celular). */
  className?: string;
};

/**
 * Seletor Lista | Cartões das telas. Estilo próprio (view-mode-* em
 * globals.css), independente da página onde está.
 */
export default function ViewModeToggle({
  mode,
  onChange,
  hasException = false,
  defaultMode,
  className = "",
}: ViewModeToggleProps) {
  const defaultLabel = defaultMode ? viewModeLabel(defaultMode) : null;
  const exceptionHint =
    hasException && defaultLabel
      ? `Visualização própria desta tela. Padrão: ${defaultLabel}.`
      : null;

  return (
    <div
      role="group"
      aria-label={exceptionHint ? `Visualização. ${exceptionHint}` : "Visualização"}
      title={exceptionHint ?? undefined}
      className={`view-mode-toggle relative flex h-10 items-center gap-0.5 rounded-xl border p-0.5 ${className}`}
    >
      {viewModeOptions.map((option) => {
        const active = mode === option.value;
        const OptionIcon = option.icon;
        const followsDefault = hasException && option.value === defaultMode;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            title={
              followsDefault
                ? `Seguir o padrão (${option.label.toLocaleLowerCase("pt-BR")})`
                : `Visualizar em ${option.label.toLocaleLowerCase("pt-BR")}`
            }
            className={`flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-sm transition-colors ${
              active
                ? "bg-blue-600 font-semibold text-white shadow-sm"
                : "view-mode-option font-medium"
            }`}
          >
            <OptionIcon size={15} aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
      {exceptionHint && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-[var(--surface)]"
        />
      )}
    </div>
  );
}
