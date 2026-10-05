import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAccountFinalBalance,
  calculateCashFlowTotals,
  calculateCashFlowTotalsByCurrency,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./balanceCalculations.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { partitionByPrimaryCurrency } from "./currencies.ts";

const itau = { name: "Itaú", type: "Conta", currency: "BRL" };
const wiseEuro = { name: "WISE EURO", type: "Conta", currency: "EUR" };
const wisePound = { name: "WISE LIBRA", type: "Conta", currency: "GBP" };
const euroCard = { name: "Cartão EUR", type: "Cartão", currency: "EUR" };

type Row = {
  account_id: string;
  type: string;
  value: number;
  status: string;
  account: { name: string; type: string; currency: string | null };
};

const cashFlow: Row[] = [
  { account_id: "itau", type: "Receita", value: 10000, status: "Recebido", account: itau },
  { account_id: "itau", type: "Despesa", value: 1000, status: "Pago", account: itau },
  { account_id: "wise-eur", type: "Despesa", value: 100, status: "Pago", account: wiseEuro },
  { account_id: "wise-gbp", type: "Despesa", value: 85, status: "Pago", account: wisePound },
];

test("Dashboard BRL: R$ 1.000 em despesas, sem somar € 100 nem £ 85", () => {
  const getCurrency = (row: Row) => row.account.currency;
  const { primary } = partitionByPrimaryCurrency(cashFlow, getCurrency);
  const totals = calculateCashFlowTotals(primary, []);

  assert.equal(totals.accountExpenses, 1000);
  assert.notEqual(totals.accountExpenses, 1100);
  assert.equal(totals.income, 10000);
  assert.equal(totals.projectedBalance, 9000);
});

test("indicação secundária mantém cada moeda separada", () => {
  const cards: Row[] = [
    { account_id: "card-eur", type: "Despesa", value: 40, status: "Pago", account: euroCard },
  ];
  const byCurrency = calculateCashFlowTotalsByCurrency(cashFlow, cards);

  assert.deepEqual(
    byCurrency.map((item: { currency: string; accountExpenses: number; creditCardInvoices: number }) => [
      item.currency,
      item.accountExpenses,
      item.creditCardInvoices,
    ]),
    [
      ["BRL", 1000, 0],
      ["EUR", 100, 40],
      ["GBP", 85, 0],
    ],
  );
});

test("transferências históricas continuam produzindo os mesmos saldos individuais", () => {
  // Pontas gravadas antes do bloqueio, inclusive entre moedas diferentes:
  // cada linha segue afetando somente a própria conta, como antes.
  const transfers = [
    { account_id: "itau", type: "Transferência", value: 1500, status: "Pago", origin_account_id: "itau", destination_account_id: "wise-eur" },
    { account_id: "wise-eur", type: "Transferência", value: 241.69, status: "Recebido", origin_account_id: "itau", destination_account_id: "wise-eur" },
    { account_id: "itau", type: "Transferência", value: 200, status: "Pago", origin_account_id: "itau", destination_account_id: "nubank" },
    { account_id: "nubank", type: "Transferência", value: 200, status: "Recebido", origin_account_id: "itau", destination_account_id: "nubank" },
  ];

  assert.equal(calculateAccountFinalBalance({ accountId: "itau", openingBalance: 10000, transactions: transfers }), 8300);
  assert.equal(calculateAccountFinalBalance({ accountId: "wise-eur", openingBalance: 0, transactions: transfers }), 241.69);
  assert.equal(calculateAccountFinalBalance({ accountId: "nubank", openingBalance: 50, transactions: transfers }), 250);
});
