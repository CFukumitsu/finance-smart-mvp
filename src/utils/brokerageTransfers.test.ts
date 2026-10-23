import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTransferAccounts,
  getTransferDestinationOptions,
  getTransferOriginOptions,
  isBrokerageAccount,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./brokerageTransfers.ts";
import {
  buildFinancialOverview,
  calculateAccountBalanceAt,
  type OverviewAccount,
  type OverviewInput,
  type OverviewTransaction,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./financialOverview.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateCashReserves, summarizeConsolidatedWealth } from "./investmentReserves.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateInvestmentPositions, summarizeInvestmentPositions } from "./investmentCalculations.ts";

// ---------------------------------------------------------------------------
// Contas: "itau" operacional, "corretora" de ativos (marcada para
// Investimentos, papel automático = reserva), "poupanca" por saldo (BALANCE).
// ---------------------------------------------------------------------------
const TODAY = "2026-10-23";
const competences = [[2026, 9], [2026, 10], [2026, 11]].map(([year, month]) => ({
  id: `c-${year}-${String(month).padStart(2, "0")}`, year, month,
}));
const account = (patch: Partial<OverviewAccount> & { id: string }): OverviewAccount => ({
  name: patch.id.toUpperCase(),
  type: "Conta",
  currency: "BRL",
  current_balance: 0,
  active: true,
  show_on_investments_dashboard: false,
  investment_account_kind: null,
  planning_role: null,
  use_spending_history: false,
  spending_history_start_date: null,
  due_day: null,
  ...patch,
});
const itau = account({ id: "itau", name: "Itaú", current_balance: 10000 });
const bmg = account({ id: "bmg", name: "BMG" });
const corretora = account({ id: "corretora", name: "Corretora Itaú", show_on_investments_dashboard: true });
const binance = account({ id: "binance", currency: "USD", show_on_investments_dashboard: true });
const poupanca = account({ id: "poupanca", show_on_investments_dashboard: true, investment_account_kind: "BALANCE" });
const cofrinho = account({ id: "cofrinho", planning_role: "savings" });
const euro = account({ id: "euro", currency: "EUR" });
const cartao = account({ id: "cartao", type: "Cartão" });
const ACCOUNTS = [itau, bmg, corretora, binance, poupanca, cofrinho, euro, cartao];

let sequence = 0;
const tx = (patch: Partial<OverviewTransaction> & { account_id: string; due_date: string }): OverviewTransaction => ({
  id: `t${++sequence}`,
  competence_id: `c-${patch.due_date.slice(0, 7)}`,
  type: "Despesa",
  value: 0,
  status: "Pago",
  ...patch,
});
/** Transferência vinculada (duas pontas), como gravada por create_transfer. */
const transfer = (from: string, to: string, date: string, value: number) => [
  tx({ account_id: from, due_date: date, type: "Transferência", status: "Pago", value, origin_account_id: from, destination_account_id: to }),
  tx({ account_id: to, due_date: date, type: "Transferência", status: "Recebido", value, origin_account_id: from, destination_account_id: to }),
];
/** Resgate de conta por saldo (módulo Investimentos): uma linha na conta financeira. */
const balanceRedemption = (to: string, from: string, date: string, value: number) =>
  tx({ account_id: to, due_date: date, type: "Transferência", status: "Recebido", value,
    origin_account_id: null, investment_event_type: "redemption", investment_account_id: from });

const overview = (transactions: OverviewTransaction[], patch: Partial<OverviewInput> = {}) =>
  buildFinancialOverview({
    today: TODAY, year: 2026, month: 10, accounts: ACCOUNTS, competences, closures: [], cardStatements: [],
    recurring: [], transactions, firstTransactionDateByAccount: {}, savingsGoal: null, cardTargets: {}, ...patch,
  });
const balance = (accountRow: OverviewAccount, transactions: OverviewTransaction[], asOf = TODAY) =>
  calculateAccountBalanceAt({ account: accountRow, asOf, competences, closures: [], transactions });

// ---------------------------------------------------------------------------
// Classificação (espelha resolve_transfer_accounts)
// ---------------------------------------------------------------------------
test("corretora = marcada para Investimentos e não é conta por saldo", () => {
  assert.equal(isBrokerageAccount(corretora), true);
  assert.equal(isBrokerageAccount(poupanca), false);
  assert.equal(isBrokerageAccount(itau), false);
  assert.equal(isBrokerageAccount({ ...corretora, type: "Cartão" }), false);
});

test("aporte, resgate e transferência tradicional", () => {
  assert.deepEqual(classifyTransferAccounts(itau, corretora), { kind: "contribution" });
  assert.deepEqual(classifyTransferAccounts(corretora, itau), { kind: "redemption" });
  assert.deepEqual(classifyTransferAccounts(itau, bmg), { kind: "traditional" });
  assert.deepEqual(classifyTransferAccounts(euro, { ...euro, id: "euro2" }), { kind: "traditional" });
  assert.equal(classifyTransferAccounts(itau, null), null);
});

test("bloqueios: moeda diferente, cartão, conta por saldo e corretora -> corretora", () => {
  const blocked = (origin: OverviewAccount, destination: OverviewAccount, fragment: string) => {
    const result = classifyTransferAccounts(origin, destination);
    assert.equal(result?.kind, "blocked");
    assert.ok(result?.kind === "blocked" && result.message.includes(fragment), `${origin.id} -> ${destination.id}`);
  };
  blocked(itau, binance, "mesma moeda nas duas contas (BRL e USD)");
  blocked(euro, corretora, "(EUR e BRL)");
  blocked(binance, itau, "mesma moeda");
  blocked({ ...itau, currency: null }, corretora, "Confirme a moeda");
  blocked(corretora, cartao, "não cartões");
  blocked(cartao, corretora, "não cartões");
  blocked(itau, poupanca, "módulo Investimentos");
  blocked(corretora, { ...corretora, id: "corretora2" }, "duas corretoras");
});

test("opções do formulário: corretoras como origem/destino, sem cartões nem contas por saldo", () => {
  assert.deepEqual(getTransferOriginOptions(ACCOUNTS).map((item: OverviewAccount) => item.id),
    ["itau", "bmg", "corretora", "binance", "cofrinho", "euro"]);
  assert.deepEqual(getTransferDestinationOptions(ACCOUNTS, itau).map((item: OverviewAccount) => item.id),
    ["bmg", "corretora", "binance", "cofrinho", "euro"]);
  // Origem corretora: só resgate para conta financeira.
  assert.deepEqual(getTransferDestinationOptions(ACCOUNTS, corretora).map((item: OverviewAccount) => item.id),
    ["itau", "bmg", "cofrinho", "euro"]);
});

// ---------------------------------------------------------------------------
// Guardado, saldo e dupla contagem
// ---------------------------------------------------------------------------
test("aporte financeiro -> corretora: Guardado +valor e débito único na origem", () => {
  const legs = transfer("itau", "corretora", "2026-10-22", 1946);
  const result = overview(legs);
  assert.equal(result.saved, 1946);
  assert.equal(result.realizedOutflows, 0, "aporte não é despesa nem saída de consumo");
  assert.equal(balance(itau, legs), 10000 - 1946, "uma única saída na conta financeira");
  assert.deepEqual(result.savingsMovements.map((item) => [item.kind, item.toName, item.value]),
    [["deposit", "Corretora Itaú", 1946]]);
});

test("resgate corretora -> financeiro: Guardado -valor e crédito único no destino", () => {
  const legs = transfer("corretora", "itau", "2026-10-22", 500);
  const result = overview(legs);
  assert.equal(result.saved, -500);
  assert.equal(result.income.realized, 0, "resgate não é receita");
  assert.equal(balance(itau, legs), 10000 + 500);
});

test("compra/venda de ativos não gera lançamento: Guardado e saldo não mudam de novo", () => {
  // As operações vivem em investment_operations e nunca entram no Financeiro.
  const aporte = transfer("itau", "corretora", "2026-10-22", 1946);
  const afterPurchase = overview(aporte); // compra de 200 TASA4 registrada à parte
  assert.equal(afterPurchase.saved, 1946, "compra após aporte não soma Guardado novamente");
  assert.equal(balance(itau, aporte), 10000 - 1946, "compra não debita a conta financeira de novo");
  // Comprar com dinheiro já na corretora ou vender e manter lá: nenhum lançamento.
  assert.equal(overview([]).saved, 0);
});

test("caso TASA4: 4.700 guardados, resgate de 2.000 da poupança, aporte de 1.946 = 4.646", () => {
  const guardado = transfer("itau", "cofrinho", "2026-10-05", 4700);
  const resgate = balanceRedemption("itau", "poupanca", "2026-10-22", 2000);
  assert.equal(overview(guardado).saved, 4700);
  assert.equal(overview([...guardado, resgate]).saved, 2700);

  // Como estava: despesa no Itaú. Some do guardado e vira saída.
  const despesa = tx({ account_id: "itau", due_date: "2026-10-22", type: "Despesa", value: 1946, category_id: "cat" });
  const wrong = overview([...guardado, resgate, despesa]);
  assert.equal(wrong.saved, 2700);
  assert.equal(wrong.realizedOutflows, 1946);

  // Corrigido: aporte Itaú -> Corretora no lugar da despesa.
  const aporte = transfer("itau", "corretora", "2026-10-22", 1946);
  const fixed = overview([...guardado, resgate, ...aporte]);
  assert.equal(fixed.saved, 4646);
  assert.equal(fixed.realizedOutflows, 0);
  // Saldo do Itaú é o mesmo nas duas versões: a despesa foi trocada, não somada.
  assert.equal(balance(itau, [...guardado, resgate, ...aporte]), balance(itau, [...guardado, resgate, despesa]));
});

test("papel configurado pelo usuário vence: fora do planejamento ou operacional não é Guardado", () => {
  const legs = transfer("itau", "corretora", "2026-10-22", 1000);
  const excluded = overview(legs, { accounts: ACCOUNTS.map((item) => item.id === "corretora" ? { ...item, planning_role: "excluded" } : item) });
  assert.equal(excluded.saved, 0);
  assert.equal(excluded.realizedOutflows, 1000, "sai do caixa operacional");
  const operational = overview(legs, { accounts: ACCOUNTS.map((item) => item.id === "corretora" ? { ...item, planning_role: "operational" } : item) });
  assert.equal(operational.saved, 0, "entre contas operacionais: interno");
});

test("data e edição/exclusão: futuro é programado; editar/excluir recalcula sem resíduo", () => {
  const future = overview(transfer("itau", "corretora", "2026-10-28", 1000));
  assert.equal(future.saved, 0);
  assert.equal(future.savedScheduled, 1000);
  // Edição = mesmas duas linhas com novo valor (update_transfer); exclusão = sem linhas.
  const edited = transfer("itau", "corretora", "2026-10-22", 1500);
  assert.equal(overview(edited).saved, 1500);
  assert.equal(balance(itau, edited), 10000 - 1500);
  assert.equal(overview([]).saved, 0);
  assert.equal(balance(itau, []), 10000);
});

test("patrimônio: posição dos ativos + reservas, sem somar o aporte como caixa da corretora", () => {
  const operations = [{
    id: "op1", owner_id: "u", asset_id: "tasa4", account_id: "corretora", operation_type: "Compra" as const,
    operation_date: "2026-10-22", quantity: 200, unit_price: 9.73, fees: 0, event_group_id: null, notes: null,
    created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:00:00Z",
  }];
  const positions = calculateInvestmentPositions({
    assets: [{ id: "tasa4", owner_id: "u", name: "Taurus", symbol: "TASA4", asset_type: "Ações", currency: "BRL", active: true, created_at: "", updated_at: "" }],
    accounts: [{ id: "corretora", owner_id: "u", name: "Corretora Itaú", type: "Conta", currency: "BRL", active: true, show_on_investments_dashboard: true, investment_account_kind: null }],
    operations,
    valuations: [],
    referenceMonth: "2026-10",
  });
  const assets = summarizeInvestmentPositions(positions, "BRL");
  assert.equal(assets.totalInvested, 1946, "posição e custo vêm só da operação");

  // Mesmo marcada explicitamente como reserva, a corretora com operações é
  // conta de custódia: a ponta do aporte nela não vira um segundo patrimônio.
  const aporte = transfer("itau", "corretora", "2026-10-22", 1946);
  const reserves = calculateCashReserves({
    accounts: [{ ...corretora, planning_role: "savings" }, cofrinho],
    competences, closures: [], transactions: [...aporte, ...transfer("itau", "cofrinho", "2026-10-05", 300)],
    operations, today: TODAY, consolidationCurrency: "BRL", rates: [],
  });
  assert.deepEqual(reserves.map((row: { accountId: string }) => row.accountId), ["cofrinho"]);
  const wealth = summarizeConsolidatedWealth({
    investmentsCurrentValue: assets.currentValue, investmentsMissingRateCount: 0, reserves,
  });
  assert.equal(wealth.total, 1946 + 300, "1.946 em ações + 300 de reserva; o aporte não é somado de novo");
});
