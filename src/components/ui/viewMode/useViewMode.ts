"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/src/hooks/useAuth";
import {
  countScreenExceptions,
  hasScreenException,
  resolveViewMode,
  type ViewMode,
} from "./viewPreferences";
import {
  INITIAL_VIEW_PREFERENCES,
  chooseDefaultViewMode,
  chooseScreenViewMode,
  getViewPreferences,
  restoreAllScreenViewModes,
  subscribeViewPreferences,
} from "./viewPreferencesStore";

function useStoredViewPreferences() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const preferences = useSyncExternalStore(
    subscribeViewPreferences,
    () => getViewPreferences(userId),
    () => INITIAL_VIEW_PREFERENCES,
  );
  return { userId, preferences };
}

/** Modo Lista | Cartões de uma tela, já resolvido (tela → global → Lista). */
export function useViewMode(screen: string) {
  const { userId, preferences } = useStoredViewPreferences();
  const setMode = useCallback(
    (mode: ViewMode) => chooseScreenViewMode(userId, screen, mode),
    [userId, screen],
  );

  return {
    mode: resolveViewMode(preferences, screen),
    defaultMode: preferences.default,
    hasException: hasScreenException(preferences, screen),
    setMode,
  };
}

/** Padrão global e exceções, para a seção Aparência. */
export function useViewPreferences() {
  const { userId, preferences } = useStoredViewPreferences();
  const setDefaultMode = useCallback(
    (mode: ViewMode) => chooseDefaultViewMode(userId, mode),
    [userId],
  );
  const restoreAll = useCallback(() => restoreAllScreenViewModes(userId), [userId]);

  return {
    defaultMode: preferences.default,
    exceptionCount: countScreenExceptions(preferences),
    setDefaultMode,
    restoreAll,
  };
}
