// Store compartilhado das preferências de visualização. Um registro por
// usuário no localStorage (chave versionada), cache em memória por usuário e
// aviso a todas as telas abertas, nesta aba e nas outras (evento "storage").
// Sem storage disponível, as escolhas valem só enquanto a página estiver aberta.

import {
  LEGACY_VIEW_MODE_KEYS,
  clearScreenExceptions,
  createViewPreferences,
  migrateLegacyViewMode,
  parseViewPreferences,
  serializeViewPreferences,
  setDefaultViewMode,
  setScreenViewMode,
  viewPreferencesKey,
  type ViewMode,
  type ViewPreferences,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./viewPreferences.ts";

export type ViewPreferencesStorage = Pick<Storage, "getItem" | "setItem">;

const KEY_PREFIX = viewPreferencesKey("");

/** Registro usado sem usuário (antes do login carregar) e no servidor. */
export const INITIAL_VIEW_PREFERENCES: ViewPreferences = Object.freeze(
  createViewPreferences(),
) as ViewPreferences;

let anonymous: ViewPreferences = INITIAL_VIEW_PREFERENCES;
const cache = new Map<string, ViewPreferences>();
const listeners = new Set<() => void>();
let storageOverride: ViewPreferencesStorage | null | undefined;
let windowListenerInstalled = false;

function getStorage(): ViewPreferencesStorage | null {
  if (storageOverride !== undefined) return storageOverride;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Acesso bloqueado (modo privado, política do navegador).
    return null;
  }
}

function readItem(key: string) {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeItem(key: string, value: string) {
  try {
    getStorage()?.setItem(key, value);
  } catch {
    // Storage cheio ou bloqueado: a escolha vale só nesta visita.
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function load(userId: string) {
  const stored = parseViewPreferences(readItem(viewPreferencesKey(userId)));
  let preferences = stored;

  for (const [screen, legacyKey] of Object.entries(LEGACY_VIEW_MODE_KEYS)) {
    if (preferences.migrated.includes(screen)) continue;
    preferences = migrateLegacyViewMode(preferences, screen, readItem(legacyKey(userId)));
  }

  if (preferences !== stored) {
    writeItem(viewPreferencesKey(userId), serializeViewPreferences(preferences));
  }
  cache.set(userId, preferences);
  return preferences;
}

/** Snapshot estável do usuário (mesmo objeto até a próxima mudança). */
export function getViewPreferences(userId: string | null): ViewPreferences {
  if (!userId) return anonymous;
  return cache.get(userId) ?? load(userId);
}

function update(
  userId: string | null,
  change: (preferences: ViewPreferences) => ViewPreferences,
) {
  const next = change(getViewPreferences(userId));
  if (userId) {
    cache.set(userId, next);
    writeItem(viewPreferencesKey(userId), serializeViewPreferences(next));
  } else {
    anonymous = next;
  }
  emit();
}

/** Escolha feita na tela. Igual ao padrão global, a tela volta a segui-lo. */
export function chooseScreenViewMode(userId: string | null, screen: string, mode: ViewMode) {
  update(userId, (preferences) => setScreenViewMode(preferences, screen, mode));

  // Mantém a chave antiga em dia, para um eventual rollback mostrar a última
  // escolha. Ela não é reimportada: a tela já está marcada como migrada.
  const legacyKey = LEGACY_VIEW_MODE_KEYS[screen];
  if (userId && legacyKey) writeItem(legacyKey(userId), mode);
}

export function chooseDefaultViewMode(userId: string | null, mode: ViewMode) {
  update(userId, (preferences) => setDefaultViewMode(preferences, mode));
}

export function restoreAllScreenViewModes(userId: string | null) {
  update(userId, (preferences) => clearScreenExceptions(preferences));
}

/** Outra aba gravou: descarta o cache daquele usuário e relê na próxima leitura. */
export function handleViewPreferencesStorageChange(key: string | null) {
  if (key === null) {
    cache.clear();
    emit();
    return;
  }
  if (!key.startsWith(KEY_PREFIX)) return;
  const userId = key.slice(KEY_PREFIX.length);
  if (!cache.has(userId)) return;
  cache.delete(userId);
  emit();
}

function onStorage(event: StorageEvent) {
  handleViewPreferencesStorageChange(event.key);
}

export function subscribeViewPreferences(listener: () => void) {
  listeners.add(listener);
  if (!windowListenerInstalled && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
    windowListenerInstalled = true;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && windowListenerInstalled) {
      window.removeEventListener("storage", onStorage);
      windowListenerInstalled = false;
    }
  };
}

/** Só para testes. `null` simula storage indisponível. */
export function resetViewPreferencesForTests(storage?: ViewPreferencesStorage | null) {
  cache.clear();
  listeners.clear();
  anonymous = INITIAL_VIEW_PREFERENCES;
  storageOverride = storage;
}
