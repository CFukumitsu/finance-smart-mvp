import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateAccountFinalBalance } from "./balanceCalculations.ts";

const accountId = "checking";
const base = {
  account_id: accountId,
  type: "Receita",
  value: 100,
  status: "Recebido",
};

test("preserva receitas, despesas e pagamentos de fatura do Finance", () => {
  const transactions = [
    { ...base, type: "Receita", value: 300 },
    { ...base, type: "Despesa", value: 50 },
    { ...base, type: "Pagamento de Fatura", value: 25 },
  ];

  assert.equal(
    calculateAccountFinalBalance({
      accountId,
      openingBalance: 1000,
      transactions,
    }),
    1225
  );
});

test("preserva a semântica histórica de transferência entre contas", () => {
  const origin = {
    ...base,
    account_id: "origin",
    type: "Transferência",
    value: 100,
    status: "Pago",
    origin_account_id: "origin",
    destination_account_id: "destination",
  };
  const destination = {
    ...origin,
    account_id: "destination",
    status: "Recebido",
  };

  assert.equal(calculateAccountFinalBalance({
    accountId: "origin",
    openingBalance: 1000,
    transactions: [origin],
  }), 900);
  assert.equal(calculateAccountFinalBalance({
    accountId: "destination",
    openingBalance: 1000,
    transactions: [destination],
  }), 1100);
});

test("depósito e saque Bankroll usam a semântica existente sem mudar o cálculo geral", () => {
  const transactions = [
    {
      ...base,
      type: "Transferência",
      value: 500,
      status: "Pago",
      origin_account_id: accountId,
      destination_account_id: null,
      bankroll_integration_group_id: "deposit",
      bankroll_operation_type: "deposit" as const,
    },
    {
      ...base,
      type: "Transferência",
      value: 200,
      status: "Recebido",
      origin_account_id: null,
      destination_account_id: null,
      bankroll_integration_group_id: "withdrawal",
      bankroll_operation_type: "withdrawal" as const,
    },
  ];

  assert.equal(calculateAccountFinalBalance({
    accountId,
    openingBalance: 1000,
    transactions,
  }), 700);
});
