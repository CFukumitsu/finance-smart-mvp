import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTransactionTotals,
  summarizeTransactionTotalsByCurrency,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./transactionCurrencyTotals.ts";

const itau = { type: "Conta", currency: "BRL" };
const wiseEuro = { type: "Conta", currency: "EUR" };
const wisePound = { type: "Conta", currency: "GBP" };
const legacy = { type: "Conta", currency: null };
const card = { type: "Cartão", currency: "BRL" };

test("mantém as fórmulas dos totais da tela Lançamentos", () => {
  assert.deepEqual(
    calculateTransactionTotals([
      { type: "Receita", value: 5000, account: itau },
      { type: "Despesa", value: 1000, account: itau },
      { type: "Despesa", value: 300, account: card },
      { type: "Pagamento de Fatura", value: 700, account: itau },
      { type: "Transferência", value: 900, account: itau },
    ]),
    {
      income: 5000,
      directExpenses: 1300,
      cashExpenses: 1000,
      invoicePayments: 700,
      cashFlowResult: 3300,
    },
  );
});

test("R$ 1.000 + € 100 de despesas nunca viram 1.100", () => {
  const [brl, eur] = summarizeTransactionTotalsByCurrency([
    { type: "Despesa", value: 1000, account: itau },
    { type: "Despesa", value: 100, account: wiseEuro },
  ]);

  assert.equal(brl.currency, "BRL");
  assert.equal(brl.totals.directExpenses, 1000);
  assert.equal(eur.currency, "EUR");
  assert.equal(eur.totals.directExpenses, 100);
});

test("moeda principal vem primeiro, existe mesmo vazia e inclui contas legadas", () => {
  const groups = summarizeTransactionTotalsByCurrency([
    { type: "Receita", value: 25, account: wisePound },
    { type: "Receita", value: 50, account: wiseEuro },
    { type: "Receita", value: 10, account: legacy },
  ]);

  assert.deepEqual(
    groups.map((group: { currency: string }) => group.currency),
    ["BRL", "EUR", "GBP"],
  );
  assert.equal(groups[0].totals.income, 10);

  const onlyEuro = summarizeTransactionTotalsByCurrency([
    { type: "Receita", value: 50, account: wiseEuro },
  ]);
  assert.equal(onlyEuro[0].currency, "BRL");
  assert.equal(onlyEuro[0].totals.income, 0);
  assert.equal(onlyEuro[1].totals.income, 50);
});
