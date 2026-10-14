import assert from "node:assert/strict";
import test from "node:test";
import type {
  InvestmentAccount,
  InvestmentAccountEvent,
  InvestmentAsset,
  InvestmentExchangeRate,
  InvestmentOperation,
} from "../types/investments";
import type { CashReserveAccount } from "./investmentReserves";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildWealthDistribution, distributionPreferenceKey, readDistributionMode, writeDistributionMode, FOREIGN_RESERVES_LABEL, UNCLASSIFIED_BALANCE_LABEL } from "./investmentDistribution.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateCashReserves, summarizeConsolidatedWealth, usesMultipleCurrencies } from "./investmentReserves.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateInvestmentAccountSummaries, calculateInvestmentPositions, summarizeInvestmentWealth } from "./investmentCalculations.ts";

/*
 * Cenário completo pelo mesmo caminho da Visão geral: posições, contas por
 * saldo e reservas calculadas pelas funções reais, consolidado pelas funções
 * reais, e a distribuição conferida contra o consolidado.
 */

const TODAY = "2026-10-14";

const account = (id: string, overrides: Partial<InvestmentAccount> = {}): InvestmentAccount => ({
  id,
  owner_id: "owner",
  name: id,
  type: "Conta",
  currency: "BRL",
  active: true,
  show_on_investments_dashboard: false,
  investment_account_kind: null,
  ...overrides,
});

const asset = (id: string, type: string, currency = "BRL"): InvestmentAsset => ({
  id,
  owner_id: "owner",
  name: id,
  symbol: id.toUpperCase(),
  asset_type: type,
  currency,
  active: true,
  created_at: "",
  updated_at: "",
});

let sequence = 0;
const buy = (assetId: string, accountId: string, quantity: number, unitPrice: number): InvestmentOperation => ({
  id: `op${++sequence}`,
  owner_id: "owner",
  asset_id: assetId,
  account_id: accountId,
  operation_type: "Compra",
  operation_date: "2026-09-01",
  quantity,
  unit_price: unitPrice,
  fees: 0,
  event_group_id: null,
  notes: null,
  created_at: `2026-09-01T00:00:0${sequence % 10}Z`,
  updated_at: "",
});

const event = (accountId: string, type: InvestmentAccountEvent["event_type"], amount: number): InvestmentAccountEvent => ({
  id: `ev${++sequence}`,
  owner_id: "owner",
  investment_account_id: accountId,
  financial_account_id: null,
  finance_transaction_id: null,
  event_type: type,
  event_date: "2026-09-10",
  amount,
  integration_group_id: null,
  idempotency_key: `k${sequence}`,
  notes: null,
  created_at: "",
  updated_at: "",
});

const rate = (base: string, quote: string, value: number): InvestmentExchangeRate => ({
  id: `${base}${quote}`,
  owner_id: "owner",
  base_currency: base,
  quote_currency: quote,
  rate: value,
  source: "PTAX",
  quoted_at: "2026-10-13T13:00:00-03:00",
  updated_by: "owner",
  created_at: "",
  updated_at: "",
});

const reserveAccount = (id: string, currency: string | null, balance: number, overrides: Partial<CashReserveAccount> = {}): CashReserveAccount => ({
  id,
  name: id,
  type: "Conta",
  currency,
  current_balance: balance,
  active: true,
  investment_account_kind: null,
  planning_role: "savings",
  ...overrides,
});

const corretora = account("Corretora", { name: "Corretora Itaú" });
const exchange = account("Exchange", { name: "Binance", currency: "USD" });
const cofrinho = account("Cofrinho", { name: "Cofrinho Eurotrip", investment_account_kind: "BALANCE" });
const poupanca = account("Poupanca", { name: "Poupança", investment_account_kind: "BALANCE" });

const ASSETS = [
  asset("bova11", "Ação"),
  asset("ivvb11", "Ação"),
  asset("hglg11", "Fundo Imobiliário"),
  asset("btc", "Criptomoeda", "USD"),
  asset("cdb", "Renda Fixa"),
  asset("semposicao", "ETF"),
];
const OPERATIONS = [
  buy("bova11", "Corretora", 10, 100), // 1000
  buy("ivvb11", "Corretora", 5, 300), // 1500
  buy("hglg11", "Corretora", 20, 150), // 3000
  buy("btc", "Exchange", 0.01, 60000), // 600 USD
  buy("cdb", "Corretora", 1, 2000), // 2000
];
const EVENTS = [
  event("Cofrinho", "opening_balance", 800),
  event("Cofrinho", "yield", 50),
  event("Poupanca", "application", 1200),
];

const RESERVE_ACCOUNTS: CashReserveAccount[] = [
  reserveAccount("WiseEUR", "EUR", 100, { name: "WISE EURO" }),
  reserveAccount("WiseGBP", "GBP", 50, { name: "WISE LIBRA" }),
  reserveAccount("Reserva", "BRL", 3000, { name: "Reserva Emergencial" }),
  // Operacionais: nunca entram, por mais saldo que tenham.
  reserveAccount("Itau", "BRL", 9000, { name: "Itaú", planning_role: "operational" }),
  reserveAccount("C6", "BRL", 4000, { name: "C6", planning_role: null }),
  // Custódia com papel Reserva: só as posições contam, não o saldo da conta.
  reserveAccount("Corretora", "BRL", 7000, { name: "Corretora Itaú" }),
];

function scenario(params: { rates?: InvestmentExchangeRate[]; currency?: string; reserveAccounts?: CashReserveAccount[] } = {}) {
  const currency = params.currency ?? "BRL";
  const rates = params.rates ?? [rate("USD", "BRL", 5), rate("EUR", "BRL", 6), rate("GBP", "BRL", 7)];
  const accounts = [corretora, exchange, cofrinho, poupanca];
  const positions = calculateInvestmentPositions({ assets: ASSETS, accounts, operations: OPERATIONS, valuations: [], referenceMonth: "2026-10" });
  const balanceAccounts = calculateInvestmentAccountSummaries({ accounts, events: EVENTS, referenceDate: TODAY });
  const reserves = calculateCashReserves({
    accounts: params.reserveAccounts ?? RESERVE_ACCOUNTS,
    competences: [],
    closures: [],
    transactions: [],
    operations: OPERATIONS,
    today: TODAY,
    consolidationCurrency: currency,
    rates,
  });
  const summary = summarizeInvestmentWealth({ positions, balanceAccounts, currency, rates });
  const consolidated = summarizeConsolidatedWealth({
    investmentsCurrentValue: summary.currentValue,
    investmentsMissingRateCount: summary.missingRateAssetCount + summary.missingRateAccountCount,
    reserves,
  });
  const distribution = buildWealthDistribution({ positions, assets: ASSETS, balanceAccounts, reserves, consolidationCurrency: currency, rates });
  return { consolidated, distribution, summary };
}

const values = (groups: { label: string; value: number }[]) => Object.fromEntries(groups.map((item) => [item.label, item.value]));
const sum = (groups: { value: number }[]) => Math.round(groups.reduce((total, item) => total + item.value, 0) * 100) / 100;

test("agrupamento por classe usa o Tipo cadastrado do ativo, ordenado do maior para o menor", () => {
  const { distribution } = scenario();
  assert.deepEqual(values(distribution.byClass), {
    "Fundo Imobiliário": 3000,
    "Ação": 2500, // BOVA11 e IVVB11 seguem o cadastro (Ação), sem reclassificação
    "Renda Fixa": 2000,
    "Criptomoeda": 3000, // 600 USD × 5
    [UNCLASSIFIED_BALANCE_LABEL]: 2050,
    [FOREIGN_RESERVES_LABEL]: 950, // 100 EUR × 6 + 50 GBP × 7
    "Reservas em caixa (BRL)": 3000,
  });
  const ordered = distribution.byClass.map((item) => item.value);
  assert.deepEqual(ordered, [...ordered].sort((left, right) => right - left));
});

test("agrupamento por conta: só contas de investimento, custódia e reservas elegíveis", () => {
  const { distribution } = scenario();
  assert.deepEqual(values(distribution.byAccount), {
    "Corretora Itaú": 7500, // só as posições
    "Binance": 3000,
    "Reserva Emergencial": 3000,
    "Poupança": 1200,
    "Cofrinho Eurotrip": 850,
    "WISE EURO": 600,
    "WISE LIBRA": 350,
  });
});

test("soma por classe = soma por conta = patrimônio consolidado", () => {
  const { distribution, consolidated } = scenario();
  assert.equal(distribution.total, consolidated.total);
  assert.equal(sum(distribution.byClass), consolidated.total);
  assert.equal(sum(distribution.byAccount), consolidated.total);
  assert.equal(distribution.byComponent.assets.value + distribution.byComponent.balance.value, consolidated.investmentsValue);
  assert.equal(distribution.byComponent.reserves.value, consolidated.reservesValue);
  const percent = distribution.byClass.reduce((total, item) => total + (item.percent ?? 0), 0);
  assert.ok(Math.abs(percent - 100) < 1e-9);
});

test("conta BALANCE sem classificação vai para o grupo próprio, nunca para Renda Fixa", () => {
  const { distribution } = scenario();
  const group = distribution.byClass.find((item) => item.label === UNCLASSIFIED_BALANCE_LABEL);
  assert.equal(group?.kind, "balance_unclassified");
  assert.equal(group?.itemCount, 2);
  assert.equal(values(distribution.byClass)["Renda Fixa"], 2000, "só o CDB cadastrado como Renda Fixa");
});

test("conta operacional é excluída (Itaú, C6), mesmo com saldo", () => {
  const { distribution } = scenario();
  const names = distribution.byAccount.map((item) => item.label);
  assert.ok(!names.includes("Itaú"));
  assert.ok(!names.includes("C6"));
});

test("conta de custódia sem dupla contagem: saldo de caixa fora, posições dentro", () => {
  const { distribution } = scenario();
  const custody = distribution.byAccount.filter((item) => item.label === "Corretora Itaú");
  assert.equal(custody.length, 1);
  assert.equal(custody[0].value, 7500);
  assert.equal(custody[0].itemCount, 4, "quatro posições, nenhuma linha de reserva");
});

test("reserva cambial com cotação entra convertida em Reservas cambiais", () => {
  const { distribution } = scenario();
  const foreign = distribution.byClass.find((item) => item.kind === "foreign_reserve");
  assert.equal(foreign?.value, 950);
  assert.equal(foreign?.pendingCount, 0);
  assert.ok(distribution.complete);
});

test("reserva cambial sem cotação: fora do total, contada como pendente, sem equivalente inventado", () => {
  const { distribution, consolidated } = scenario({ rates: [rate("USD", "BRL", 5), rate("EUR", "BRL", 6)] });
  const foreign = distribution.byClass.find((item) => item.kind === "foreign_reserve");
  assert.equal(foreign?.value, 600);
  assert.equal(foreign?.pendingCount, 1);
  const libra = distribution.byAccount.find((item) => item.label === "WISE LIBRA");
  assert.equal(libra?.value, 0);
  assert.equal(libra?.pendingCount, 1);
  assert.equal(distribution.complete, false);
  assert.equal(consolidated.complete, false);
  assert.equal(distribution.total, consolidated.total);
  assert.equal(distribution.pendingCount, consolidated.pendingReserveCount + consolidated.pendingInvestmentCount);
});

test("ativo sem cotação também fica pendente e o total continua igual ao consolidado", () => {
  const { distribution, consolidated } = scenario({ rates: [rate("EUR", "BRL", 6), rate("GBP", "BRL", 7)] });
  const crypto = distribution.byClass.find((item) => item.label === "Criptomoeda");
  assert.equal(crypto?.value, 0);
  assert.equal(crypto?.pendingCount, 1);
  assert.equal(distribution.total, consolidated.total);
});

test("ativo sem posição não aparece na distribuição", () => {
  const { distribution } = scenario();
  assert.ok(!distribution.byClass.some((item) => item.label === "ETF"));
});

test("valores negativos são preservados e não somem do total", () => {
  const { distribution, consolidated } = scenario({
    reserveAccounts: [reserveAccount("WiseEUR", "EUR", -20, { name: "WISE EURO" })],
  });
  assert.equal(values(distribution.byAccount)["WISE EURO"], -120);
  assert.equal(distribution.total, consolidated.total);
  assert.equal(sum(distribution.byClass), consolidated.total);
});

test("tipos são configuráveis: novo tipo vira grupo próprio; diferença de maiúsculas não separa", () => {
  const positions = calculateInvestmentPositions({
    assets: [asset("a", "Previdência"), asset("b", " previdência ")],
    accounts: [corretora],
    operations: [buy("a", "Corretora", 1, 100), buy("b", "Corretora", 1, 50)],
    valuations: [],
    referenceMonth: "2026-10",
  });
  const distribution = buildWealthDistribution({
    positions,
    assets: [asset("a", "Previdência"), asset("b", " previdência ")],
    balanceAccounts: [],
    reserves: [],
    consolidationCurrency: "BRL",
    rates: [],
  });
  assert.equal(distribution.byClass.length, 1);
  assert.equal(distribution.byClass[0].value, 150);
});

test("contas com nomes parecidos não são agrupadas por semelhança", () => {
  const { distribution } = scenario({
    reserveAccounts: [
      reserveAccount("r1", "BRL", 100, { name: "Reserva" }),
      reserveAccount("r2", "BRL", 200, { name: "Reserva" }),
    ],
  });
  assert.equal(distribution.byAccount.filter((item) => item.label === "Reserva").length, 2);
});

test("multimoeda ativada automaticamente pelo cadastro; usuário só em BRL não vê a linha", () => {
  assert.equal(usesMultipleCurrencies([{ type: "Conta", currency: "BRL" }, { type: "Conta", currency: "EUR" }], "BRL"), true);
  assert.equal(usesMultipleCurrencies([{ type: "Conta", currency: "BRL" }, { type: "Cartão", currency: "USD" }], "BRL"), false);
  const { distribution } = scenario({ reserveAccounts: [reserveAccount("Reserva", "BRL", 3000)] });
  assert.ok(!distribution.byClass.some((item) => item.kind === "foreign_reserve"));
});

test("persistência do seletor: padrão Por classe, grava por usuário e tolera armazenamento indisponível", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
  assert.equal(readDistributionMode(storage, "alice"), "class");
  writeDistributionMode(storage, "alice", "account");
  assert.equal(readDistributionMode(storage, "alice"), "account");
  assert.equal(readDistributionMode(storage, "bob"), "class");
  assert.equal(store.get(distributionPreferenceKey("alice")), "account");
  store.set(distributionPreferenceKey("bob"), "pizza");
  assert.equal(readDistributionMode(storage, "bob"), "class");
  const broken = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("cheio"); } };
  assert.equal(readDistributionMode(broken, "alice"), "class");
  assert.doesNotThrow(() => writeDistributionMode(broken, "alice", "account"));
  assert.equal(readDistributionMode(null, "alice"), "class");
  assert.equal(readDistributionMode(storage, null), "class");
});
