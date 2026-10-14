"use client";

import { useId, type ReactNode } from "react";

type FormDrawerProps = {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  /** Ações (Cancelar/Salvar): ficam sempre visíveis no rodapé do painel. */
  footer: ReactNode;
  children: ReactNode;
};

/**
 * Painel lateral para formulários longos. Cabeçalho e rodapé não rolam; só o
 * conteúdo do meio rola, então as ações nunca saem da tela e nenhum campo fica
 * escondido atrás delas. O rodapé respeita a safe area (barra de gestos do
 * iOS/Android). Com o teclado virtual aberto o painel encolhe junto com a
 * viewport (interactiveWidget: "resizes-content" em app/layout.tsx).
 */
export default function FormDrawer({
  title,
  description,
  onClose,
  footer,
  children,
}: FormDrawerProps) {
  const titleId = useId();

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-slate-950 shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5 [@media(max-height:480px)]:py-2">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-bold text-white sm:text-2xl">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/10 hover:text-white"
          >
            Fechar
          </button>
        </div>

        {/* Padding no filho: a área rolável pode encolher até zero em telas
            muito baixas (paisagem com teclado) sem empurrar o rodapé. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4 py-5 sm:px-6">{children}</div>
        </div>

        <div className="shrink-0 border-t border-white/10 bg-slate-950 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      </div>
    </div>
  );
}
