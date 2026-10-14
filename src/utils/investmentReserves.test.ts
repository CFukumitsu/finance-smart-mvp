import assert from "node:assert/strict";
import test from "node:test";
import type { InvestmentExchangeRate } from "../types/investments";
import type { OverviewTransaction } from "./financialOverview";
import type { CashReserveAccount } from "./investmentReserves";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateCashReserves, findExchangeRate, listCashReserveCurrencies, splitCashReservesByCurrency, summarizeConsolidatedWealth, usesMultipleCurrencies } from "./investmentReserves.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { listRequiredPtaxCurrencies } from "./exchangeRateCalculations.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { summarizeInvestmentWealth } from "./investmentCalculations.ts";

const TODAY = "2026-10-14";
const competences = [
  { id: "c-09", year: 2026, month: 9 },
  { id: "c-10", year: 2026, month: 10 },
];

const reserve = (overrides: Partial<CashReserveAccount> & { id: string }): CashReserveAccount => ({
  name: overrides.id,
  type: "Conta",
  currency: "BRL",
  current_balance: 0,
  active: true,
  investment_account_kind: null,
  planning_role: "savings",
  ...overrides,
});

const eur = reserve({ id: "eur", name: "Reserva EUR", currency: "EUR", current_balance: 100 });
const gbp = reserve({ id: "gbp", name: "Reserva GBP", currency: "GBP", current_balance: 0 });
const operational = reserve({ id: "brl-op", name: "Conta corrente", currency: "BRL", current_balance: 5000, planning_role: "operational" });

let sequence = 0;
const tx = (accountId: string, type: string, value: number, status: string, dueDate = "2026-10-05"): OverviewTransaction => ({
  id: `t${++sequence}`,
  account_id: accountId,
  competence_id: dueDate.slice(0, 7) === "2026-09" ? "c-09" : "c-10",
  due_date: dueDate,
  type,
  value,
  status,
});

/** Conversão: cada perna fica na conta e na moeda dela; a tarifa já está no líquido recebido. */
const conversion = (from: string, to: string, sent: number, netReceived: number, dueDate?: string) => [
  tx(from, "Transferência", sent, "Pago", dueDate),
  tx(to, "Transferência", netReceived, "Recebido", dueDate),
];

const rate = (base: string, quote: string, value: number, source: "PTAX" | "MANUAL" = "PTAX"): InvestmentExchangeRate => ({
  id: `${base}${quote}`,
  owner_id: "owner",
  base_currency: base,
  quote_currency: quote,
  rate: value,
  source,
  quoted_at: "2026-10-13T13:04:26-03:00",
  updated_by: "owner",
  created_at: "",
  updated_at: "",
});
const RATES = [rate("EUR", "BRL", 6.2), rate("GBP", "BRL", 7.4)];

function reserves(params: {
  accounts: CashReserveAccount[];
  transactions?: OverviewTransaction[];
  operations?: { account_id: string }[];
  rates?: InvestmentExchangeRate[];
  closures?: { account_id: string; competence_id: string; closing_balance: number | null }[];
  currency?: string;
}) {
  return calculateCashReserves({
    accounts: params.accounts,
    competences,
    closures: params.closures ?? [],
    transactions: params.transactions ?? [],
    operations: params.operations ?? [],
    today: TODAY,
    consolidationCurrency: params.currency ?? "BRL",
    rates: params.rates ?? RATES,
  });
}

const byId = <T extends { accountId: string }>(rows: T[], id: string) => rows.find((row) => row.accountId === id);

test("1. reserva em EUR com saldo positivo: saldo original preservado e convertido pela cotação", () => {
  const [row] = reserves({ accounts: [eur] });
  assert.equal(row.currency, "EUR");
  assert.equal(row.balance, 100);
  assert.equal(row.rate, 6.2);
  assert.equal(row.rateSource, "PTAX");
  assert.equal(row.rateQuotedAt, "2026-10-13T13:04:26-03:00");
  assert.equal(row.convertedBalance, 620);
  assert.equal(row.issue, null);
});

test("2. reserva em GBP com saldo positivo", () => {
  const [row] = reserves({ accounts: [gbp], transactions: [tx("gbp", "Receita", 250, "Recebido")] });
  assert.equal(row.balance, 250);
  assert.equal(row.convertedBalance, 1850);
});

test("3. conta com saldo zero aparece com zero e não altera o total", () => {
  const empty = reserve({ id: "zero", name: "Reserva vazia" });
  const rows = reserves({ accounts: [empty] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].balance, 0);
  assert.equal(rows[0].convertedBalance, 0);
  assert.equal(rows[0].rateSource, "SAME_CURRENCY");
  const summary = summarizeConsolidatedWealth({ investmentsCurrentValue: 1000, investmentsMissingRateCount: 0, reserves: rows });
  assert.equal(summary.total, 1000);
  assert.equal(summary.complete, true);
});

test("4. transferência BRL → EUR: a reserva recebe o líquido em EUR; a conta operacional não entra", () => {
  const rows = reserves({ accounts: [operational, eur], transactions: conversion("brl-op", "eur", 1000, 160) });
  assert.deepEqual(rows.map((row) => row.accountId), ["eur"]);
  assert.equal(rows[0].balance, 260);
  assert.equal(rows[0].convertedBalance, 1612);
});

test("5. transferência entre duas reservas não conta o dinheiro duas vezes", () => {
  const funding = [tx("gbp", "Receita", 100, "Recebido")];
  const before = reserves({ accounts: [eur, gbp], transactions: funding });
  const after = reserves({ accounts: [eur, gbp], transactions: [...funding, ...conversion("eur", "gbp", 50, 43)] });
  assert.equal(byId(after, "eur")?.balance, 50);
  assert.equal(byId(after, "gbp")?.balance, 143);
  const total = (rows: typeof before) =>
    summarizeConsolidatedWealth({ investmentsCurrentValue: 0, investmentsMissingRateCount: 0, reserves: rows }).total;
  // Só muda o efeito do câmbio/tarifa da conversão: −50 EUR e +43 GBP.
  assert.equal(Math.round((total(after) - total(before)) * 100) / 100, Math.round((-50 * 6.2 + 43 * 7.4) * 100) / 100);
});

test("6. conversão com tarifa: o saldo usa o valor líquido recebido, sem descontar a tarifa de novo", () => {
  // 1.000 BRL enviados, tarifa de 12 BRL registrada só em currency_conversions;
  // a perna recebida já é o líquido (158,06 EUR).
  const [row] = reserves({ accounts: [eur], transactions: conversion("brl-op", "eur", 1000, 158.06) });
  assert.equal(row.balance, 258.06);
});

test("7. sem cotação: saldo original exibido, sem conversão, e total marcado como parcial", () => {
  const rows = reserves({ accounts: [eur, gbp], transactions: [tx("gbp", "Receita", 80, "Recebido")], rates: [rate("EUR", "BRL", 6.2)] });
  const gbpRow = byId(rows, "gbp");
  assert.equal(gbpRow?.balance, 80);
  assert.equal(gbpRow?.convertedBalance, null);
  assert.equal(gbpRow?.issue, "missing_rate");
  const summary = summarizeConsolidatedWealth({ investmentsCurrentValue: 1000, investmentsMissingRateCount: 0, reserves: rows });
  assert.equal(summary.reservesValue, 620);
  assert.equal(summary.total, 1620);
  assert.equal(summary.pendingReserveCount, 1);
  assert.equal(summary.complete, false);
});

test("8. conta inativa não entra", () => {
  assert.deepEqual(reserves({ accounts: [reserve({ id: "old", active: false, current_balance: 900 })] }), []);
});

test("9. conta BALANCE (já contabilizada nos investimentos) não entra", () => {
  assert.deepEqual(reserves({ accounts: [reserve({ id: "cdb", investment_account_kind: "BALANCE", current_balance: 900 })] }), []);
});

test("10. conta de custódia com ativos não entra (dinheiro pode estar representado pelos ativos)", () => {
  const custody = reserve({ id: "broker", current_balance: 900 });
  assert.deepEqual(reserves({ accounts: [custody], operations: [{ account_id: "broker" }] }), []);
  assert.deepEqual(listCashReserveCurrencies([custody, eur], [{ account_id: "broker" }]), ["EUR"]);
});

test("11. o saldo acompanha os lançamentos: muda depois de uma transferência e ignora datas futuras", () => {
  const base = [tx("eur", "Receita", 40, "Recebido")];
  assert.equal(reserves({ accounts: [eur], transactions: base })[0].balance, 140);
  const withTransfer = [...base, ...conversion("eur", "brl-op", 30, 186), tx("eur", "Receita", 999, "Recebido", "2026-10-20")];
  assert.equal(reserves({ accounts: [eur], transactions: withTransfer })[0].balance, 110);
});

test("11b. usa o último fechamento anterior ao mês como saldo de partida (regra da Visão Financeira)", () => {
  const transactions = [tx("eur", "Receita", 500, "Recebido", "2026-09-10"), tx("eur", "Receita", 10, "Recebido", "2026-10-02")];
  const [row] = reserves({ accounts: [eur], transactions, closures: [{ account_id: "eur", competence_id: "c-09", closing_balance: 700 }] });
  assert.equal(row.balance, 710);
});

test("12. indicadores atuais dos investimentos ficam inalterados; falta de cotação neles torna o consolidado parcial", () => {
  const wealth = summarizeInvestmentWealth({ positions: [], balanceAccounts: [], currency: "BRL", rates: [] });
  const rows = reserves({ accounts: [eur] });
  const summary = summarizeConsolidatedWealth({ investmentsCurrentValue: wealth.currentValue, investmentsMissingRateCount: 0, reserves: rows });
  assert.equal(summary.investmentsValue, wealth.currentValue);
  assert.equal(summary.total, wealth.currentValue + 620);
  const partial = summarizeConsolidatedWealth({ investmentsCurrentValue: 5000, investmentsMissingRateCount: 2, reserves: rows });
  assert.equal(partial.complete, false);
  assert.equal(partial.pendingInvestmentCount, 2);
});

test("elegibilidade: só papel explícito de reserva; operacional, cartão e papel automático ficam de fora", () => {
  const flaggedAutomatic = { ...reserve({ id: "flag", planning_role: null }), show_on_investments_dashboard: true } as CashReserveAccount;
  const flaggedExplicit = { ...reserve({ id: "flag-explicit", current_balance: 10 }), show_on_investments_dashboard: true } as CashReserveAccount;
  const card = reserve({ id: "card", type: "Cartão" });
  const excluded = reserve({ id: "out", planning_role: "excluded" });
  const rows = reserves({ accounts: [operational, card, excluded, flaggedAutomatic, flaggedExplicit] });
  // show_on_investments_dashboard não decide nada: vale só o papel explícito.
  assert.deepEqual(rows.map((row) => row.accountId), ["flag-explicit"]);
});

test("moeda não confirmada: não converte e pede confirmação", () => {
  const [row] = reserves({ accounts: [reserve({ id: "legacy", currency: null, current_balance: 50 })] });
  assert.equal(row.issue, "currency_unconfirmed");
  assert.equal(row.convertedBalance, null);
});

test("cotação inversa é aceita e consolidação em outra moeda sem par fica sem conversão", () => {
  assert.equal(findExchangeRate("BRL", "EUR", RATES)?.rate, 1 / 6.2);
  const [row] = reserves({ accounts: [eur], currency: "USD", rates: [rate("EUR", "BRL", 6.2), rate("USD", "BRL", 5.4)] });
  assert.equal(row.issue, "missing_rate");
});

test("cotações PTAX necessárias: EUR e GBP contra BRL, mantendo o comportamento do USD", () => {
  assert.deepEqual(listRequiredPtaxCurrencies(["BRL", "EUR", "GBP"], "BRL"), ["EUR", "GBP"]);
  assert.deepEqual(listRequiredPtaxCurrencies(["USD"], "BRL"), ["USD"]);
  assert.deepEqual(listRequiredPtaxCurrencies(["BRL"], "USD"), ["USD"]);
  assert.deepEqual(listRequiredPtaxCurrencies(["BRL"], "BRL"), []);
  assert.deepEqual(listRequiredPtaxCurrencies(["EUR"], "USD"), []);
});

// --- Visão geral adaptativa ---------------------------------------------------

test("multimoeda: usuário só com BRL não ativa a linha de moedas estrangeiras", () => {
  assert.equal(usesMultipleCurrencies([operational, reserve({ id: "brl" })], "BRL"), false);
  // Cartão em outra moeda não é reserva; moeda não confirmada não decide.
  assert.equal(usesMultipleCurrencies([reserve({ id: "card", type: "Cartão", currency: "USD" }), reserve({ id: "x", currency: null })], "BRL"), false);
});

test("multimoeda: contas EUR/GBP ativam, inclusive zeradas ou inativas (a interface não some)", () => {
  assert.equal(usesMultipleCurrencies([operational, eur, gbp], "BRL"), true);
  assert.equal(usesMultipleCurrencies([reserve({ id: "z", currency: "EUR", current_balance: 0 })], "BRL"), true);
  assert.equal(usesMultipleCurrencies([reserve({ id: "old", currency: "GBP", active: false })], "BRL"), true);
  assert.equal(usesMultipleCurrencies([reserve({ id: "brl" })], "USD"), true);
});

test("separação por moeda: reserva BRL fica identificável e as estrangeiras somam só o convertido", () => {
  const brlReserve = reserve({ id: "brl", name: "Reserva BRL", current_balance: 1000 });
  const rows = reserves({ accounts: [brlReserve, eur, gbp], transactions: [tx("gbp", "Receita", 80, "Recebido")], rates: [rate("EUR", "BRL", 6.2)] });
  const split = splitCashReservesByCurrency(rows, "BRL");
  assert.deepEqual(split.domestic, { count: 1, value: 1000, pendingCount: 0 });
  assert.deepEqual(split.foreign, { count: 2, value: 620, pendingCount: 1 });
  // Mesmo total do consolidado: a separação só reagrupa os valores.
  const summary = summarizeConsolidatedWealth({ investmentsCurrentValue: 0, investmentsMissingRateCount: 0, reserves: rows });
  assert.equal(split.domestic.value + split.foreign.value, summary.reservesValue);
});

test("sem reservas: patrimônio consolidado igual ao patrimônio dos investimentos", () => {
  const summary = summarizeConsolidatedWealth({ investmentsCurrentValue: 8000, investmentsMissingRateCount: 0, reserves: [] });
  assert.equal(summary.total, 8000);
  assert.equal(summary.complete, true);
});