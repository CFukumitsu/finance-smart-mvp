// Preferências de visualização Lista | Cartões, sem React e sem storage.
// Um registro por usuário guarda o padrão global e as exceções por tela.
// Resolução: exceção da tela → padrão global → Lista.

export type ViewMode = "list" | "cards";

export type ViewPreferences = {
  version: 1;
  /** Padrão global escolhido em Aparência. */
  default: ViewMode;
  /** Exceções por tela (id da tela → modo fixado nela). */
  screens: Record<string, ViewMode>;
  /**
   * Telas cuja preferência antiga já foi importada. Nunca é limpo, nem por
   * "Restaurar todas", para o valor antigo não voltar a ser importado.
   */
  migrated: string[];
  updatedAt: string | null;
};

export const VIEW_PREFERENCES_VERSION = 1;
export const FALLBACK_VIEW_MODE: ViewMode = "list";
const STORAGE_PREFIX = "finance-smart:view-preferences:v1";

/** Preferências antigas, gravadas antes deste registro existir. */
export const LEGACY_VIEW_MODE_KEYS: Record<string, (userId: string) => string> = {
  transactions: (userId) => `finance-smart-transactions-view:${userId}`,
};

export function viewPreferencesKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function isViewMode(value: unknown): value is ViewMode {
  return value === "list" || value === "cards";
}

export function createViewPreferences(): ViewPreferences {
  return {
    version: VIEW_PREFERENCES_VERSION,
    default: FALLBACK_VIEW_MODE,
    screens: {},
    migrated: [],
    updatedAt: null,
  };
}

/** Lê o JSON salvo. Qualquer dado inválido vira o registro inicial. */
export function parseViewPreferences(raw: string | null): ViewPreferences {
  if (!raw) return createViewPreferences();

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return createViewPreferences();
  }

  if (!data || typeof data !== "object") return createViewPreferences();
  const record = data as Record<string, unknown>;
  if (record.version !== VIEW_PREFERENCES_VERSION) return createViewPreferences();

  const screens: Record<string, ViewMode> = {};
  if (record.screens && typeof record.screens === "object") {
    for (const [screen, mode] of Object.entries(record.screens)) {
      if (isViewMode(mode)) screens[screen] = mode;
    }
  }

  const migrated = Array.isArray(record.migrated)
    ? record.migrated.filter((item): item is string => typeof item === "string")
    : [];

  return {
    version: VIEW_PREFERENCES_VERSION,
    default: isViewMode(record.default) ? record.default : FALLBACK_VIEW_MODE,
    screens,
    migrated,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
  };
}

export function serializeViewPreferences(preferences: ViewPreferences) {
  return JSON.stringify(preferences);
}

export function resolveViewMode(preferences: ViewPreferences, screen: string): ViewMode {
  return preferences.screens[screen] ?? preferences.default ?? FALLBACK_VIEW_MODE;
}

export function hasScreenException(preferences: ViewPreferences, screen: string) {
  return Object.prototype.hasOwnProperty.call(preferences.screens, screen);
}

export function countScreenExceptions(preferences: ViewPreferences) {
  return Object.keys(preferences.screens).length;
}

function touch(preferences: ViewPreferences, now: string): ViewPreferences {
  return { ...preferences, updatedAt: now };
}

/**
 * Escolha feita na própria tela. O mesmo modo do padrão global remove a
 * exceção (a tela volta a seguir o padrão); outro modo cria a exceção.
 */
export function setScreenViewMode(
  preferences: ViewPreferences,
  screen: string,
  mode: ViewMode,
  now = new Date().toISOString(),
): ViewPreferences {
  const screens = { ...preferences.screens };
  if (mode === preferences.default) delete screens[screen];
  else screens[screen] = mode;
  return touch({ ...preferences, screens }, now);
}

/**
 * Muda o padrão global. As exceções ficam como estão: uma tela fixada em
 * Cartões continua em Cartões mesmo que o padrão vá e volte. Uma exceção igual
 * ao novo padrão só sai quando a pessoa escolhe seguir o padrão na tela ou
 * usa "Restaurar todas".
 */
export function setDefaultViewMode(
  preferences: ViewPreferences,
  mode: ViewMode,
  now = new Date().toISOString(),
): ViewPreferences {
  return touch({ ...preferences, default: mode }, now);
}

/** Limpa só as exceções; o padrão global e as marcas de migração ficam. */
export function clearScreenExceptions(
  preferences: ViewPreferences,
  now = new Date().toISOString(),
): ViewPreferences {
  return touch({ ...preferences, screens: {} }, now);
}

/**
 * Importa a escolha antiga de uma tela uma única vez. Uma escolha válida
 * (Lista ou Cartões) vira exceção fixa da tela, para que mudanças futuras do
 * padrão global não a alterem. Nunca sobrescreve uma exceção já existente.
 * Devolve o mesmo objeto quando não há nada a fazer.
 */
export function migrateLegacyViewMode(
  preferences: ViewPreferences,
  screen: string,
  legacyValue: string | null,
  now = new Date().toISOString(),
): ViewPreferences {
  if (preferences.migrated.includes(screen)) return preferences;

  const screens = { ...preferences.screens };
  if (isViewMode(legacyValue) && !hasScreenException(preferences, screen)) {
    screens[screen] = legacyValue;
  }

  return touch(
    { ...preferences, screens, migrated: [...preferences.migrated, screen] },
    now,
  );
}

/**
 * Ids das telas com Lista | Cartões. Cada id é a chave da exceção no registro
 * do usuário; nunca renomear um id já publicado (a exceção salva se perderia).
 */
export const VIEW_MODE_SCREENS = {
  transactions: "transactions",
  accounts: "accounts",
  categories: "categories",
  recurrences: "recurrences",
  fuelVehicles: "fuel.vehicles",
  fuelStations: "fuel.stations",
  bankrollWallets: "bankroll.wallets",
  investmentsAssets: "investments.assets",
} as const;
