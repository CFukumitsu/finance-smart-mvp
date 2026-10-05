import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildClosingSnapshot } from "./closingSnapshot.ts";

test("snapshot de competência preserva as regras atuais para BRL", () => {
  assert.deepEqual(
    buildClosingSnapshot([
      { type: "Receita", status: "Recebido", value: 3000, account: { currency: "BRL" } },
      { type: "Receita", status: "Pendente", value: 500, account: { currency: "BRL" } },
      { type: "Despesa", status: "Pago", value: 800, account: { currency: "BRL" } },
      { type: "Despesa", status: "Pendente", value: 200, account: { currency: "BRL" } },
      { type: "Transferência", status: "Pago", value: 999, account: { currency: "BRL" } },
      { type: "Pagamento de Fatura", status: "Pago", value: 400, account: { currency: "BRL" } },
    ]),
    {
      totalIncome: 3500,
      totalExpense: 1000,
      balance: 2500,
      pendingIncome: 500,
      pendingExpense: 200,
      paidIncome: 3000,
      paidExpense: 800,
    },
  );
});

test("snapshot considera somente BRL e nunca soma € aos totais", () => {
  const snapshot = buildClosingSnapshot([
    { type: "Despesa", status: "Pago", value: 1000, account: { currency: "BRL" } },
    { type: "Despesa", status: "Pago", value: 100, account: { currency: "EUR" } },
    { type: "Receita", status: "Recebido", value: 50, account: { currency: "GBP" } },
  ]);

  assert.equal(snapshot.totalExpense, 1000);
  assert.equal(snapshot.paidExpense, 1000);
  assert.equal(snapshot.totalIncome, 0);
  assert.equal(snapshot.balance, -1000);
});

test("lançamentos de contas legadas sem moeda continuam no snapshot BRL", () => {
  const snapshot = buildClosingSnapshot([
    { type: "Receita", status: "Recebido", value: 100, account: { currency: null } },
    { type: "Receita", status: "Recebido", value: 20, account: null },
  ]);

  assert.equal(snapshot.totalIncome, 120);
});
