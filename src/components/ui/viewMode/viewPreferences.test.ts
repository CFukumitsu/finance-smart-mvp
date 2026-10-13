import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  countScreenExceptions,
  createViewPreferences,
  LEGACY_VIEW_MODE_KEYS,
  hasScreenException,
  migrateLegacyViewMode,
  parseViewPreferences,
  resolveViewMode,
  serializeViewPreferences,
  setDefaultViewMode,
  setScreenViewMode,
  viewPreferencesKey,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./viewPreferences.ts";
import {
  chooseDefaultViewMode,
  chooseScreenViewMode,
  getViewPreferences,
  handleViewPreferencesStorageChange,
  resetViewPreferencesForTests,
  restoreAllScreenViewModes,
  subscribeViewPreferences,
  type ViewPreferencesStorage,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./viewPreferencesStore.ts";

const ALICE = "user-alice";
const BOB = "user-bob";
const legacyKey = (userId: string) => `finance-smart-transactions-view:${userId}`;

class MemoryStorage implements ViewPreferencesStorage {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  resetViewPreferencesForTests(storage);
});

function stored(userId: string) {
  return parseViewPreferences(storage.getItem(viewPreferencesKey(userId)));
}

// --- Resolução e padrão global ---------------------------------------------

test("without any choice every screen starts as Lista", () => {
  const preferences = getViewPreferences(ALICE);
  assert.equal(resolveViewMode(preferences, "transactions"), "list");
  assert.equal(resolveViewMode(preferences, "accounts"), "list");
  assert.equal(countScreenExceptions(preferences), 0);
});

test("global default applies to screens without an exception", () => {
  chooseDefaultViewMode(ALICE, "cards");
  const preferences = getViewPreferences(ALICE);
  assert.equal(resolveViewMode(preferences, "accounts"), "cards");
  assert.equal(stored(ALICE).default, "cards");
});

test("screen exception wins over the global default", () => {
  chooseDefaultViewMode(ALICE, "cards");
  chooseScreenViewMode(ALICE, "accounts", "list");
  const preferences = getViewPreferences(ALICE);
  assert.equal(resolveViewMode(preferences, "accounts"), "list");
  assert.equal(resolveViewMode(preferences, "categories"), "cards");
  assert.equal(hasScreenException(preferences, "accounts"), true);
});

// --- Exceções ---------------------------------------------------------------

test("choosing the global mode on a screen removes its exception", () => {
  chooseScreenViewMode(ALICE, "accounts", "cards");
  assert.equal(countScreenExceptions(getViewPreferences(ALICE)), 1);
  chooseScreenViewMode(ALICE, "accounts", "list");
  const preferences = getViewPreferences(ALICE);
  assert.equal(hasScreenException(preferences, "accounts"), false);
  assert.equal(resolveViewMode(preferences, "accounts"), "list");
});

test("changing the global default keeps exceptions, even after a round trip", () => {
  chooseScreenViewMode(ALICE, "accounts", "cards");
  chooseDefaultViewMode(ALICE, "cards");
  chooseDefaultViewMode(ALICE, "list");
  const preferences = getViewPreferences(ALICE);
  assert.equal(resolveViewMode(preferences, "accounts"), "cards");
  assert.equal(hasScreenException(preferences, "accounts"), true);
});

test("an exception equal to the new default is cleared when the screen follows it", () => {
  let preferences = setScreenViewMode(createViewPreferences(), "accounts", "cards");
  preferences = setDefaultViewMode(preferences, "cards");
  assert.equal(hasScreenException(preferences, "accounts"), true);
  preferences = setScreenViewMode(preferences, "accounts", "cards");
  assert.equal(hasScreenException(preferences, "accounts"), false);
  assert.equal(resolveViewMode(preferences, "accounts"), "cards");
});

// --- Restauração ------------------------------------------------------------

test("restore all clears only the exceptions, not the global default", () => {
  chooseDefaultViewMode(ALICE, "cards");
  chooseScreenViewMode(ALICE, "accounts", "list");
  chooseScreenViewMode(ALICE, "categories", "list");
  restoreAllScreenViewModes(ALICE);
  const preferences = getViewPreferences(ALICE);
  assert.equal(countScreenExceptions(preferences), 0);
  assert.equal(preferences.default, "cards");
  assert.equal(resolveViewMode(preferences, "accounts"), "cards");
  assert.equal(countScreenExceptions(stored(ALICE)), 0);
});

// --- Migração de Lançamentos ------------------------------------------------

test("legacy Cartões choice is preserved as a Lançamentos exception", () => {
  storage.setItem(legacyKey(ALICE), "cards");
  const preferences = getViewPreferences(ALICE);
  assert.equal(resolveViewMode(preferences, "transactions"), "cards");
  assert.equal(hasScreenException(preferences, "transactions"), true);
  assert.equal(preferences.default, "list");
  assert.deepEqual(stored(ALICE).migrated, ["transactions"]);
});

test("legacy Lista choice is also preserved and survives a global change", () => {
  storage.setItem(legacyKey(ALICE), "list");
  getViewPreferences(ALICE);
  chooseDefaultViewMode(ALICE, "cards");
  const preferences = getViewPreferences(ALICE);
  assert.equal(resolveViewMode(preferences, "transactions"), "list");
  assert.equal(resolveViewMode(preferences, "accounts"), "cards");
});

test("legacy choice follows the global default only after the user opts in", () => {
  storage.setItem(legacyKey(ALICE), "list");
  getViewPreferences(ALICE);
  chooseDefaultViewMode(ALICE, "cards");
  // Na tela, escolher o padrão (Cartões) passa a segui-lo.
  chooseScreenViewMode(ALICE, "transactions", "cards");
  chooseDefaultViewMode(ALICE, "list");
  assert.equal(resolveViewMode(getViewPreferences(ALICE), "transactions"), "list");
});

test("invalid or missing legacy values are ignored", () => {
  storage.setItem(legacyKey(ALICE), "compact");
  const preferences = getViewPreferences(ALICE);
  assert.equal(hasScreenException(preferences, "transactions"), false);
  assert.equal(resolveViewMode(preferences, "transactions"), "list");
  assert.equal(hasScreenException(getViewPreferences(BOB), "transactions"), false);
});

test("migration never overwrites an existing exception", () => {
  let preferences = setScreenViewMode(createViewPreferences(), "transactions", "cards");
  preferences = migrateLegacyViewMode(preferences, "transactions", "list");
  assert.equal(resolveViewMode(preferences, "transactions"), "cards");
});

test("migration runs once and keeps the legacy key", () => {
  storage.setItem(legacyKey(ALICE), "cards");
  getViewPreferences(ALICE);
  chooseScreenViewMode(ALICE, "transactions", "list");

  // Nova sessão: cache limpo, mesmo storage.
  resetViewPreferencesForTests(storage);
  storage.setItem(legacyKey(ALICE), "cards");
  assert.equal(resolveViewMode(getViewPreferences(ALICE), "transactions"), "list");
  assert.equal(storage.getItem(legacyKey(ALICE)), "cards");
});

test("restore all does not re-import the legacy value", () => {
  storage.setItem(legacyKey(ALICE), "cards");
  getViewPreferences(ALICE);
  restoreAllScreenViewModes(ALICE);

  resetViewPreferencesForTests(storage);
  const preferences = getViewPreferences(ALICE);
  assert.equal(hasScreenException(preferences, "transactions"), false);
  assert.equal(resolveViewMode(preferences, "transactions"), "list");
  assert.equal(storage.getItem(legacyKey(ALICE)), "cards");
});

test("rollback: the legacy key keeps the latest Lançamentos choice", () => {
  storage.setItem(legacyKey(ALICE), "list");
  chooseScreenViewMode(ALICE, "transactions", "cards");
  // A versão anterior lê só esta chave.
  assert.equal(storage.getItem(legacyKey(ALICE)), "cards");
  // E a versão anterior não lê a chave nova, que não colide com nada dela.
  assert.notEqual(viewPreferencesKey(ALICE), legacyKey(ALICE));
});

test("rollback and return: the new record wins, the legacy key is not re-imported", () => {
  chooseScreenViewMode(ALICE, "transactions", "cards");
  // Na versão anterior, a pessoa troca para Lista.
  storage.setItem(legacyKey(ALICE), "list");
  resetViewPreferencesForTests(storage);
  assert.equal(resolveViewMode(getViewPreferences(ALICE), "transactions"), "cards");
});

// --- Dois usuários no mesmo navegador ---------------------------------------

test("two users in the same browser keep separate preferences", () => {
  storage.setItem(legacyKey(ALICE), "cards");
  chooseDefaultViewMode(BOB, "cards");
  chooseScreenViewMode(BOB, "accounts", "list");

  const alice = getViewPreferences(ALICE);
  const bob = getViewPreferences(BOB);
  assert.equal(resolveViewMode(alice, "transactions"), "cards");
  assert.equal(resolveViewMode(alice, "accounts"), "list");
  assert.equal(resolveViewMode(bob, "transactions"), "cards");
  assert.equal(hasScreenException(bob, "transactions"), false);
  assert.equal(resolveViewMode(bob, "accounts"), "list");

  restoreAllScreenViewModes(ALICE);
  assert.equal(countScreenExceptions(getViewPreferences(BOB)), 1);
});

test("another user's legacy key is never imported", () => {
  storage.setItem(legacyKey(ALICE), "cards");
  getViewPreferences(ALICE);
  const bob = getViewPreferences(BOB);
  assert.equal(resolveViewMode(bob, "transactions"), "list");
  assert.equal(storage.getItem(legacyKey(BOB)), null);
});

test("without a user nothing is persisted", () => {
  chooseScreenViewMode(null, "transactions", "cards");
  assert.equal(resolveViewMode(getViewPreferences(null), "transactions"), "cards");
  assert.equal(storage.items.size, 0);
});

// --- Storage indisponível ou corrompido --------------------------------------

test("corrupted data falls back to the defaults", () => {
  storage.setItem(viewPreferencesKey(ALICE), "{not json");
  assert.equal(resolveViewMode(getViewPreferences(ALICE), "accounts"), "list");

  storage.setItem(viewPreferencesKey(BOB), JSON.stringify({ version: 1, default: "grid", screens: { accounts: "cards", bad: 3 }, migrated: "x" }));
  const bob = getViewPreferences(BOB);
  assert.equal(bob.default, "list");
  assert.deepEqual(bob.screens, { accounts: "cards" });
  assert.deepEqual(bob.migrated, ["transactions"]);
});

test("unknown versions are not trusted", () => {
  const raw = JSON.stringify({ version: 2, default: "cards", screens: {} });
  assert.equal(parseViewPreferences(raw).default, "list");
  assert.equal(parseViewPreferences("null").default, "list");
  assert.equal(parseViewPreferences("[]").default, "list");
});

test("serialize and parse round trip", () => {
  const preferences = setScreenViewMode(
    setDefaultViewMode(createViewPreferences(), "cards", "2026-10-13T00:00:00.000Z"),
    "accounts",
    "list",
    "2026-10-13T00:00:00.000Z",
  );
  assert.deepEqual(parseViewPreferences(serializeViewPreferences(preferences)), preferences);
});

test("unavailable storage keeps choices in memory only", () => {
  resetViewPreferencesForTests(null);
  chooseDefaultViewMode(ALICE, "cards");
  chooseScreenViewMode(ALICE, "transactions", "list");
  const preferences = getViewPreferences(ALICE);
  assert.equal(resolveViewMode(preferences, "accounts"), "cards");
  assert.equal(resolveViewMode(preferences, "transactions"), "list");
});

test("storage that throws does not break reads or writes", () => {
  resetViewPreferencesForTests({
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  });
  assert.equal(resolveViewMode(getViewPreferences(ALICE), "transactions"), "list");
  chooseScreenViewMode(ALICE, "transactions", "cards");
  assert.equal(resolveViewMode(getViewPreferences(ALICE), "transactions"), "cards");
});

// --- Atualização sem recarregar e entre abas --------------------------------

test("changes notify subscribers and return a new stable snapshot", () => {
  let notifications = 0;
  subscribeViewPreferences(() => {
    notifications += 1;
  });
  const before = getViewPreferences(ALICE);
  assert.equal(getViewPreferences(ALICE), before);
  chooseDefaultViewMode(ALICE, "cards");
  const after = getViewPreferences(ALICE);
  assert.notEqual(after, before);
  assert.equal(getViewPreferences(ALICE), after);
  assert.equal(notifications, 1);
});

test("a write from another tab is picked up", () => {
  let notifications = 0;
  subscribeViewPreferences(() => {
    notifications += 1;
  });
  assert.equal(getViewPreferences(ALICE).default, "list");

  const otherTab = setDefaultViewMode(getViewPreferences(ALICE), "cards");
  storage.setItem(viewPreferencesKey(ALICE), serializeViewPreferences(otherTab));
  handleViewPreferencesStorageChange(viewPreferencesKey(ALICE));

  assert.equal(notifications, 1);
  assert.equal(getViewPreferences(ALICE).default, "cards");
});

test("other users' keys and unrelated keys from other tabs are ignored", () => {
  let notifications = 0;
  getViewPreferences(ALICE);
  subscribeViewPreferences(() => {
    notifications += 1;
  });
  handleViewPreferencesStorageChange(viewPreferencesKey(BOB));
  handleViewPreferencesStorageChange("finance-smart-theme");
  assert.equal(notifications, 0);
  handleViewPreferencesStorageChange(null);
  assert.equal(notifications, 1);
});

// --- Lançamentos continua igual ---------------------------------------------

test("Lançamentos reads the shared preference and keeps its list and cards", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../../../../app/transactions/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /useViewMode\("transactions"\)/);
  assert.match(source, /viewMode === "list" \?/);
  assert.match(source, /grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-\[1600px\]:grid-cols-4/);
  assert.doesNotMatch(source, /finance-smart-transactions-view/);
  // A chave antiga continua sendo a mesma que a versão anterior gravava.
  assert.equal(LEGACY_VIEW_MODE_KEYS.transactions(ALICE), "finance-smart-transactions-view:user-alice");
});

test("existing Lançamentos users see the same view as before", () => {
  storage.setItem(legacyKey(ALICE), "cards");
  storage.setItem(legacyKey(BOB), "list");
  assert.equal(resolveViewMode(getViewPreferences(ALICE), "transactions"), "cards");
  assert.equal(resolveViewMode(getViewPreferences(BOB), "transactions"), "list");
  assert.equal(resolveViewMode(getViewPreferences("user-new"), "transactions"), "list");
});
