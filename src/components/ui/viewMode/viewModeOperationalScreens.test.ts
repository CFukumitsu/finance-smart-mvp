// Onda 2: Veículos, Postos, Carteiras (Bankroll) e Ativos (Investimentos).
// Regra da onda: abaixo de 768px sempre cartões, sem tabela e sem seletor.
// Preferências pelo store real; estrutura das telas pelo código-fonte (o
// projeto não renderiza componentes nos testes).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { beforeEach, test } from "node:test";
import {
  VIEW_MODE_SCREENS,
  hasScreenException,
  resolveViewMode,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./viewPreferences.ts";
import {
  chooseDefaultViewMode,
  chooseScreenViewMode,
  getViewPreferences,
  resetViewPreferencesForTests,
  type ViewPreferencesStorage,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./viewPreferencesStore.ts";
import {
  VIEW_MODE_TOGGLE_WRAPPER_CLASS,
  viewModeCardsClass,
  viewModeTableClass,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./viewModeLayout.ts";

class MemoryStorage implements ViewPreferencesStorage {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
}

const ALICE = "user-alice";
const BOB = "user-bob";
const WAVE_2 = [
  VIEW_MODE_SCREENS.fuelVehicles,
  VIEW_MODE_SCREENS.fuelStations,
  VIEW_MODE_SCREENS.bankrollWallets,
  VIEW_MODE_SCREENS.investmentsAssets,
];

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  resetViewPreferencesForTests(storage);
});

const files = {
  vehicles: "app/(private)/fuel/vehicles/page.tsx",
  vehiclesAlias: "app/(private)/vehicles/page.tsx",
  stations: "app/(private)/fuel/stations/page.tsx",
  bankroll: "src/components/bankroll/BankrollScreen.tsx",
  assets: "src/components/investments/InvestmentAssets.tsx",
  investmentUi: "src/components/investments/InvestmentUi.tsx",
};

function read(file: string) {
  return readFile(new URL(`../../../../${file}`, import.meta.url), "utf8");
}

function count(source: string, text: string) {
  return source.split(text).length - 1;
}

/** Trecho de uma função de nível superior (até a próxima). */
function functionBody(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found`);
  const next = source.slice(start + 1).search(/\n(export )?(default )?function /);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

// --- Ids e preferências -------------------------------------------------------

test("screen ids are the approved ones and never collide", () => {
  assert.deepEqual(WAVE_2, [
    "fuel.vehicles",
    "fuel.stations",
    "bankroll.wallets",
    "investments.assets",
  ]);
  // Ids já publicados nas Ondas 0 e 1 não mudam.
  assert.equal(VIEW_MODE_SCREENS.transactions, "transactions");
  assert.equal(VIEW_MODE_SCREENS.accounts, "accounts");
  assert.equal(VIEW_MODE_SCREENS.categories, "categories");
  assert.equal(VIEW_MODE_SCREENS.recurrences, "recurrences");
  const ids = Object.values(VIEW_MODE_SCREENS);
  assert.equal(new Set(ids).size, ids.length);
});

test("global default applies to the four screens", () => {
  for (const screen of WAVE_2) assert.equal(resolveViewMode(getViewPreferences(ALICE), screen), "list");
  chooseDefaultViewMode(ALICE, "cards");
  for (const screen of WAVE_2) assert.equal(resolveViewMode(getViewPreferences(ALICE), screen), "cards");
});

test("exceptions are per screen and survive a reload", () => {
  chooseDefaultViewMode(ALICE, "cards");
  chooseScreenViewMode(ALICE, VIEW_MODE_SCREENS.fuelStations, "list");
  chooseScreenViewMode(ALICE, VIEW_MODE_SCREENS.bankrollWallets, "list");

  resetViewPreferencesForTests(storage); // recarregar a página
  const preferences = getViewPreferences(ALICE);
  assert.equal(resolveViewMode(preferences, VIEW_MODE_SCREENS.fuelStations), "list");
  assert.equal(resolveViewMode(preferences, VIEW_MODE_SCREENS.bankrollWallets), "list");
  assert.equal(resolveViewMode(preferences, VIEW_MODE_SCREENS.fuelVehicles), "cards");
  assert.equal(hasScreenException(preferences, VIEW_MODE_SCREENS.investmentsAssets), false);
});

test("preferences are isolated per user", () => {
  chooseScreenViewMode(ALICE, VIEW_MODE_SCREENS.investmentsAssets, "cards");
  assert.equal(resolveViewMode(getViewPreferences(BOB), VIEW_MODE_SCREENS.investmentsAssets), "list");
});

// --- Regra do celular ---------------------------------------------------------

test("phones always get cards and never the table, in both modes", () => {
  for (const mode of ["list", "cards"] as const) {
    const cards = viewModeCardsClass(mode).split(" ");
    const table = viewModeTableClass(mode).split(" ");
    // Cartões visíveis sem prefixo de largura (celular)...
    assert.ok(cards.includes("grid"));
    // ...e a tabela começa oculta; só um md:block pode reexibi-la.
    assert.equal(table[0], "hidden");
    assert.ok(table.every((name: string) => name === "hidden" || name === "md:block"));
  }
  assert.equal(viewModeCardsClass("list"), "grid gap-3 md:hidden");
  assert.equal(viewModeTableClass("list"), "hidden md:block");
  assert.equal(viewModeTableClass("cards"), "hidden");
  assert.equal(VIEW_MODE_TOGGLE_WRAPPER_CLASS, "hidden md:block");
});

test("card grid: 1 column on phones, 2 on tablets, 3 on desktop, 4 only when allowed", () => {
  const four = viewModeCardsClass("cards");
  const three = viewModeCardsClass("cards", 3);
  for (const grid of [four, three]) {
    assert.doesNotMatch(grid, /(^| )grid-cols-/);
    assert.match(grid, /md:grid-cols-2/);
    assert.match(grid, /xl:grid-cols-3/);
  }
  assert.match(four, /min-\[1600px\]:grid-cols-4/);
  assert.doesNotMatch(three, /grid-cols-4/);
});

test("switching mode does not touch the saved preference from a phone", () => {
  // O layout só lê o modo; nada no helper grava preferências.
  chooseScreenViewMode(ALICE, VIEW_MODE_SCREENS.fuelVehicles, "cards");
  const before = storage.getItem(`finance-smart:view-preferences:v1:${ALICE}`);
  viewModeCardsClass("cards");
  viewModeTableClass("cards");
  assert.equal(storage.getItem(`finance-smart:view-preferences:v1:${ALICE}`), before);
});

// --- Estrutura comum ----------------------------------------------------------

const screens = [
  { name: "vehicles", file: files.vehicles, key: "fuelVehicles", array: "filteredVehicles.map((vehicle) =>" },
  { name: "stations", file: files.stations, key: "fuelStations", array: "filteredStations.map((station) =>" },
  { name: "wallets", file: files.bankroll, key: "bankrollWallets", array: "{rows.map((w) =>" },
  { name: "assets", file: files.assets, key: "investmentsAssets", array: "rows.map((asset) =>" },
];

for (const screen of screens) {
  test(`${screen.name}: shared preference, toggle hidden on phones, same records`, async () => {
    let source = await read(screen.file);
    if (screen.name === "wallets") source = functionBody(source, "Wallets");

    assert.match(source, new RegExp(`useViewMode\\(VIEW_MODE_SCREENS\\.${screen.key}\\)`));
    assert.match(source, /<div className=\{VIEW_MODE_TOGGLE_WRAPPER_CLASS\}>\s*<ViewModeToggle/);
    assert.match(source, /viewModeCardsClass\(viewMode/);
    assert.match(source, /viewModeTableClass\(viewMode\)/);
    assert.doesNotMatch(source, /localStorage/);
    assert.equal(count(source, screen.array), 2, "one map for the cards, one for the table");
  });
}

test("filters and ordering do not depend on the view mode", async () => {
  const vehicles = await read(files.vehicles);
  assert.match(vehicles, /\[vehicles, searchTerm, statusFilter\]|vehicles\.filter\(/);
  const stations = await read(files.stations);
  assert.match(stations, /}, \[stations, searchTerm, statusFilter\]\);/);
  const assets = await read(files.assets);
  assert.match(assets, /}, \[data\.assets, search, sort, status\]\);/);
  const wallets = functionBody(await read(files.bankroll), "Wallets");
  assert.match(wallets, /\.sort\(\(a, b\) => a\.name\.localeCompare\(b\.name\)\);/);

  for (const file of [files.vehicles, files.stations, files.assets]) {
    const source = await read(file);
    const memo = source.match(/const (filteredVehicles|filteredStations|rows) = useMemo\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/);
    assert.ok(memo, `memo not found in ${file}`);
    assert.doesNotMatch(memo[0], /viewMode/);
  }
  const walletRows = wallets.match(/const rows = data\.wallets[\s\S]*?\);\n/);
  assert.ok(walletRows);
  assert.doesNotMatch(walletRows[0], /viewMode/);
});

// --- Veículos -----------------------------------------------------------------

test("vehicles: same actions in both modes and an easy-to-spot Padrão badge", async () => {
  const source = await read(files.vehicles);
  for (const handler of [
    "setDefaultVehicle(vehicle)",
    "openEditVehicleDrawer(vehicle)",
    "toggleVehicleStatus(vehicle)",
  ]) {
    assert.equal(count(source, `onClick={() =>\n`.replace("\n", "")) >= 0, true);
    assert.equal(count(source.replace(/\s+/g, " "), `onClick={() => ${handler} }`), 2, handler);
  }
  // Selo Padrão nos dois modos, só para veículo ativo e padrão.
  assert.equal(count(source, 'title="Veículo padrão"'), 2);
  assert.ok(count(source, "vehicle.is_default && vehicle.active") >= 2);
  // Placa, combustível e tanque nos cartões.
  assert.ok(count(source, "{vehicle.plate ?? \"-\"}") >= 2);
  assert.ok(count(source, "{vehicle.fuel_type}") >= 2);
});

test("vehicles: /vehicles alias renders the same page (same screen id)", async () => {
  const alias = await read(files.vehiclesAlias);
  assert.match(alias, /export \{ default \} from "@\/app\/\(private\)\/fuel\/vehicles\/page";/);
});

// --- Postos -------------------------------------------------------------------

test("stations: same actions and map link in both modes", async () => {
  const source = (await read(files.stations)).replace(/\s+/g, " ");
  assert.equal(count(source, "onClick={() => openEditStationDrawer(station)}"), 2);
  assert.equal(count(source, "onClick={() => toggleStationStatus(station)}"), 2);
  assert.equal(count(source, "onClick={() => openStationMap(station)}"), 2);
  assert.ok(count(source, "station.latitude !== null && station.longitude !== null") >= 2);
});

test("stations: map, nearby search and drawer are untouched by the view mode", async () => {
  const source = await read(files.stations);
  // O modo só aparece no hook, no seletor e na área da listagem.
  const listStart = source.indexOf("viewModeCardsClass(viewMode");
  const listEnd = source.indexOf("</table>", listStart);
  const outside = source.slice(0, listStart) + source.slice(listEnd);
  const uses = outside.match(/[^/]\bviewMode\b(?!\/)/g) ?? [];
  assert.equal(uses.length, 2, "hook declaration and toggle only");
  // Mapa e busca de próximos continuam com um único ponto de uso.
  assert.equal(count(source, "<NearbyFuelStationsMap"), 1);
  assert.doesNotMatch(source.slice(listStart, listEnd), /NearbyFuelStationsMap|searchNearbyFuelStations|loadGoogleFuelStationDetails/);
});

// --- Carteiras ----------------------------------------------------------------

test("wallets: balance comes from the existing calculation, once, for both modes", async () => {
  const wallets = functionBody(await read(files.bankroll), "Wallets");
  assert.equal(count(wallets, "calculateWalletBalance("), 1);
  assert.match(wallets, /calculateWalletBalance\(w, data\.transactions, data\.sessions\)/);
  assert.equal(count(wallets, "money(balance, w.currency)"), 1);
  assert.equal(count(wallets, "money(balances.get(w.id) ?? 0, w.currency)"), 1);
  // Moeda e status nos cartões; mesmas ações nos dois modos.
  assert.ok(count(wallets, "{w.currency}") >= 2);
  assert.ok(count(wallets, 'w.active ? "Ativa" : "Inativa"') >= 2);
  assert.equal(count(wallets, "onDelete={() => removeWalletEntry(w)}"), 2);
  assert.equal(count(wallets, "onEdit={() => show(w)}"), 2);
});

test("bankroll: shared Table, Toolbar and other tabs are unchanged", async () => {
  const source = await read(files.bankroll);
  for (const name of ["Table", "Td", "Actions", "Toolbar", "Transactions", "Sessions", "Dashboard"]) {
    if (!source.includes(`function ${name}(`)) continue;
    assert.doesNotMatch(functionBody(source, name), /viewMode|ViewModeToggle/, name);
  }
  assert.equal(count(source, "useViewMode("), 1);
});

// --- Ativos -------------------------------------------------------------------

test("assets: code, type, currency, status and actions in both modes", async () => {
  const source = await read(files.assets);
  assert.match(source, /\{asset\.symbol \?\? "Sem código"\}/);
  assert.match(source, /<InvestmentTd>\{asset\.symbol \?\? "—"\}<\/InvestmentTd>/);
  assert.equal(count(source, "<InvestmentStatus active={asset.active} />"), 2);
  assert.ok(count(source, "{asset.asset_type}") >= 2);
  assert.ok(count(source, "{asset.currency}") >= 2);
  assert.equal(count(source, "onEdit={() => show(asset)}"), 2);
  assert.equal(count(source, "onDelete={() => void remove(asset)}"), 2);
});

test("investments: shared UI and the other screens are unchanged", async () => {
  const ui = await read(files.investmentUi);
  assert.doesNotMatch(ui, /viewMode|ViewModeToggle/);
  for (const file of [
    "src/components/investments/InvestmentOperations.tsx",
    "src/components/investments/InvestmentAccountEvents.tsx",
    "src/components/investments/InvestmentDashboard.tsx",
  ]) {
    assert.doesNotMatch(await read(file), /viewMode|ViewModeToggle/, file);
  }
});

// --- Temas --------------------------------------------------------------------

test("cards use surfaces that the light theme already overrides", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\[data-theme="light"\] main \[class~="bg-slate-950\/60"\]/);
  assert.match(css, /^\.view-mode-toggle \{/m);
  for (const screen of screens) {
    let source = await read(screen.file);
    if (screen.name === "wallets") source = functionBody(source, "Wallets");
    assert.match(source, /rounded-2xl border[^"]*bg-slate-950\/60 p-4/);
  }
});
