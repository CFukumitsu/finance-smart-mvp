// Classes de layout das telas com Lista | Cartões (a partir da Onda 2).
// Regra: abaixo de md (768px) sempre cartões, sem tabela e sem seletor; de md
// em diante, o modo resolvido. A preferência salva nunca muda pelo celular.

import type { ViewMode } from "./viewPreferences";

/** Até quantas colunas a grade de cartões chega em telas largas. */
export type CardColumns = 3 | 4;

const cardGrids: Record<CardColumns, string> = {
  3: "grid gap-3 md:grid-cols-2 xl:grid-cols-3",
  4: "grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-[1600px]:grid-cols-4",
};

/** Contêiner dos cartões: grade no modo Cartões, só celular no modo Lista. */
export function viewModeCardsClass(mode: ViewMode, columns: CardColumns = 4) {
  return mode === "cards" ? cardGrids[columns] : "grid gap-3 md:hidden";
}

/** Contêiner da tabela: nunca no celular; de md em diante só no modo Lista. */
export function viewModeTableClass(mode: ViewMode) {
  return mode === "cards" ? "hidden" : "hidden md:block";
}

/** Envolve o seletor: oculto no celular, onde a tela usa sempre cartões. */
export const VIEW_MODE_TOGGLE_WRAPPER_CLASS = "hidden md:block";
