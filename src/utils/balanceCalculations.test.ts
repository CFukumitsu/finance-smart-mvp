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

test("contabiliza uma única vez cada lado do par de transferência no conjunto global", () => {
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
  const globalTransactions = [origin, destination];

  assert.equal(calculateAccountFinalBalance({
    accountId: "origin",
    openingBalance: 1000,
    transactions: globalTransactions,
  }), 900);
  assert.equal(calculateAccountFinalBalance({
    accountId: "destination",
    openingBalance: 1000,
    transactions: globalTransactions,
  }), 1100);
});

test("contabiliza múltiplas transferências entre contas sem duplicar o destino", () => {
  const transferPair = (value: number) => {
    const origin = {
      ...base,
      account_id: "origin",
      type: "Transferência",
      value,
      status: "Pago",
      origin_account_id: "origin",
      destination_account_id: "destination",
    };

    return [
      origin,
      {
        ...origin,
        account_id: "destination",
        status: "Recebido",
      },
    ];
  };
  const globalTransactions = [
    ...transferPair(100),
    ...transferPair(250),
  ];

  assert.equal(calculateAccountFinalBalance({
    accountId: "origin",
    openingBalance: 1000,
    transactions: globalTransactions,
  }), 650);
  assert.equal(calculateAccountFinalBalance({
    accountId: "destination",
    openingBalance: 1000,
    transactions: globalTransactions,
  }), 1350);
});

test("preserva transferências financeiras representadas por linha única", () => {
  const transactions = [
    {
      ...base,
      account_id: "checking",
      type: "Transferência",
      value: 500,
      status: "Pago",
      origin_account_id: "checking",
      destination_account_id: null,
    },
    {
      ...base,
      account_id: "checking",
      type: "Transferência",
      value: 200,
      status: "Recebido",
      origin_account_id: null,
      destination_account_id: null,
    },
  ];

  assert.equal(calculateAccountFinalBalance({
    accountId: "checking",
    openingBalance: 1000,
    transactions,
  }), 700);
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

test("aplicação e resgate integrados afetam somente a conta financeira", () => {
  const investmentAccountId = "savings";
  const transactions = [
    {
      ...base,
      type: "Transferência",
      value: 1000,
      status: "Pago",
      origin_account_id: accountId,
      destination_account_id: null,
      investment_integration_group_id: "application",
      investment_event_type: "application",
    },
    {
      ...base,
      type: "Transferência",
      value: 300,
      status: "Recebido",
      origin_account_id: null,
      destination_account_id: null,
      investment_integration_group_id: "redemption",
      investment_event_type: "redemption",
    },
  ];

  assert.equal(calculateAccountFinalBalance({
    accountId,
    openingBalance: 2000,
    transactions,
  }), 1300);
  assert.equal(calculateAccountFinalBalance({
    accountId: investmentAccountId,
    openingBalance: 0,
    transactions,
  }), 0);
  assert.equal(transactions.filter((transaction) => transaction.account_id === accountId).length, 2);
  assert.equal(transactions.some((transaction) => transaction.account_id === investmentAccountId), false);
  assert.equal(transactions.some((transaction) => transaction.destination_account_id === investmentAccountId), false);
});
