// Onda 1: Contas e Cartões, Categorias e Recorrências com Lista | Cartões.
// As preferências são testadas pelo store; a estrutura das telas, pelo código
// fonte (o projeto não tem renderização de componentes nos testes).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { beforeEach, test } from "node:test";
import {
  hasScreenException,
  resolveViewMode,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./viewPreferences.ts";
import {
  chooseDefaultViewMode,
  chooseScreenViewMode,
  getViewPreferences,
  resetViewPreferencesForTests,
  restoreAllScreenViewModes,
  type ViewPreferencesStorage,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./viewPreferencesStore.ts";

const SCREENS = ["accounts", "categories", "recurrences"] as const;
const ALICE = "user-alice";
const BOB = "user-bob";

class MemoryStorage implements ViewPreferencesStorage {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
}

beforeEach(() => resetViewPreferencesForTests(new MemoryStorage()));

const sources = {
  accounts: "app/accounts/page.tsx",
  categories: "app/categories/page.tsx",
  recurrences: "app/components/recurrences/RecurrencesPageContent.tsx",
};

function read(file: string) {
  return readFile(new URL(`../../../../${file}`, import.meta.url), "utf8");
}

function count(source: string, text: string) {
  return source.split(text).length - 1;
}

// --- Preferências ------------------------------------------------------------

test("global default applies to the three screens", () => {
  for (const screen of SCREENS) assert.equal(resolveViewMode(getViewPreferences(ALICE), screen), "list");
  chooseDefaultViewMode(ALICE, "cards");
  for (const screen of SCREENS) assert.equal(resolveViewMode(getViewPreferences(ALICE), screen), "cards");
});

test("each screen keeps its own exception", () => {
  chooseDefaultViewMode(ALICE, "cards");
  chooseScreenViewMode(ALICE, "categories", "list");
  const preferences = getViewPreferences(ALICE);
  assert.equal(resolveViewMode(preferences, "accounts"), "cards");
  assert.equal(resolveViewMode(preferences, "categories"), "list");
  assert.equal(resolveViewMode(preferences, "recurrences"), "cards");
  assert.equal(hasScreenException(preferences, "categories"), true);
  assert.equal(hasScreenException(preferences, "accounts"), false);

  restoreAllScreenViewModes(ALICE);
  assert.equal(resolveViewMode(getViewPreferences(ALICE), "categories"), "cards");
});

test("preferences of the three screens are isolated per user", () => {
  chooseScreenViewMode(ALICE, "accounts", "cards");
  chooseScreenViewMode(BOB, "recurrences", "cards");
  assert.equal(resolveViewMode(getViewPreferences(ALICE), "accounts"), "cards");
  assert.equal(resolveViewMode(getViewPreferences(ALICE), "recurrences"), "list");
  assert.equal(resolveViewMode(getViewPreferences(BOB), "accounts"), "list");
  assert.equal(resolveViewMode(getViewPreferences(BOB), "recurrences"), "cards");
});

// --- Estrutura das telas -----------------------------------------------------

for (const [screen, file] of Object.entries(sources)) {
  test(`${screen}: uses the shared preference and no storage of its own`, async () => {
    const source = await read(file);
    assert.match(source, new RegExp(`useViewMode\\("${screen}"\\)`));
    assert.match(source, /<ViewModeToggle/);
    assert.doesNotMatch(source, /localStorage/);
  });

  test(`${screen}: toggle hidden on phones, cards forced there`, async () => {
    const source = await read(file);
    // O seletor fica num contêiner que só aparece a partir de md.
    assert.match(source, /<div className="hidden md:block">\s*<ViewModeToggle/);
    // Em Lista, os cartões continuam no celular e a tabela aparece de md em diante.
    assert.match(source, /: "grid gap-3 md:hidden"/);
    assert.match(source, /viewMode === "cards" \? "hidden" : "hidden md:block"/);
    // Em Cartões, grade adaptativa no desktop.
    assert.match(source, /"grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-\[1600px\]:grid-cols-4"/);
    // A tabela larga rola na horizontal em vez de cortar colunas.
    assert.doesNotMatch(source, /overflow-hidden rounded-2xl border border-white\/10 bg-slate-950\/60">\s*<table/);
  });

  test(`${screen}: view mode does not touch loading, filters or ordering`, async () => {
    const source = await read(file);
    const beforeRender = source.slice(0, source.search(/\n\s*return \(\r?\n\s*<AppShell>/));
    assert.ok(beforeRender.length > 0);
    // Antes do JSX, viewMode só aparece na declaração do hook.
    assert.equal(beforeRender.match(/[^/]\bviewMode\b(?!\/)/g)?.length, 1);
    assert.doesNotMatch(source, /\.(order|eq|ilike)\([^)]*viewMode/);
  });
}

test("accounts: list and cards render the same records with the same actions", async () => {
  const source = await read(sources.accounts);
  assert.equal(count(source, "accounts.map((account) =>"), 2);
  for (const handler of [
    "onClick={() => openPlanningModal(account)}",
    "onClick={() => openEditDrawer(account)}",
    "onClick={() => toggleActive(account)}",
    "onClick={() => deleteAccount(account)}",
  ]) {
    assert.equal(count(source, handler), 2, handler);
  }
  // Cartões mostram moeda, status e o tipo de investimento, sem saldo nem limite.
  assert.match(source, /account\.currency \?\? "Moeda não confirmada"/);
  assert.equal(count(source, `account.investment_account_kind === "BALANCE"`), 2);
  assert.match(source, /\(account\.closing_day \|\| account\.due_day\) && \(/);
});

test("categories: list and cards render the same records with the same actions", async () => {
  const source = await read(sources.categories);
  assert.equal(count(source, "categories.map((category) =>"), 2);
  for (const handler of [
    "onClick={() => toggleShowOnDashboard(category)}",
    "onClick={() => openPlanningModal(category)}",
    "onClick={() => openEditDrawer(category)}",
    "onClick={() => toggleActive(category)}",
    "onClick={() => deleteCategory(category)}",
  ]) {
    assert.equal(count(source, handler), 2, handler);
  }
  // Busca e status continuam fora da área que alterna.
  assert.match(source, /}, \[searchTerm, statusFilter\]\);/);
});

test("recurrences: list and cards render the same records with the same actions", async () => {
  const source = await read(sources.recurrences);
  assert.equal(count(source, "items.map((item) =>"), 2);
  assert.equal(count(source, "onClick={() => openEditDrawer(item)}"), 2);
  assert.equal(count(source, "onClick={() => handleCancel(item.id)}"), 2);
  // Cartões trazem conta/cartão, dia, frequência e valor na moeda da conta.
  assert.equal(source.match(/^\s*\{accountName\(item\.account_id\)\}\s*$/gm)?.length, 2);
  assert.equal(count(source, "Dia {item.day_of_month}"), 2);
  assert.equal(count(source, "formatMoney(Number(item.amount), accountCurrency(item.account_id))"), 2);
});

test("recurrences: Gerar recorrências stays outside the list/cards area", async () => {
  const source = await read(sources.recurrences);
  const generate = source.indexOf("onClick={handleGenerateRecurringTransactions}");
  const firstView = source.indexOf(`viewMode === "cards"`);
  assert.ok(generate > 0 && firstView > 0);
  assert.ok(generate < firstView, "generate button must come before the switched area");
  assert.equal(count(source, "onClick={handleGenerateRecurringTransactions}"), 1);
});

test("toggle styling no longer depends on the Lançamentos page", async () => {
  const toggle = await read("src/components/ui/viewMode/ViewModeToggle.tsx");
  assert.doesNotMatch(toggle, /theme-(field|muted|hover)/);
  assert.match(toggle, /view-mode-toggle/);
  const css = await read("app/globals.css");
  assert.match(css, /^\.view-mode-toggle \{/m);
  assert.match(css, /^\.view-mode-option:hover \{/m);
});
