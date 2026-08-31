import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { sortLatestTransactionsForDisplay, sortTransactionsByCashDirection } from "./transactionFilters.ts";

test("ordena os últimos cadastrados por created_at, sem usar a data financeira", () => {
  const transactions = [
    {
      id: "older-financial-date",
      due_date: "2026-05-10",
      created_at: "2026-07-29T12:00:00Z",
    },
    {
      id: "newer-financial-date",
      due_date: "2026-07-15",
      created_at: "2026-07-28T12:00:00Z",
    },
  ];

  assert.deepEqual(
    sortLatestTransactionsForDisplay(transactions).map(({ id }) => id),
    ["older-financial-date", "newer-financial-date"],
  );
});

test("desempata por id quando created_at é igual", () => {
  const transactions = [
    {
      id: "a",
      due_date: "2026-07-15",
      created_at: "2026-07-29T12:00:00Z",
    },
    {
      id: "c",
      due_date: "2026-07-15",
      created_at: "2026-07-29T12:00:00Z",
    },
    {
      id: "b",
      due_date: "2026-07-15",
      created_at: "2026-07-30T12:00:00Z",
    },
  ];

  assert.deepEqual(
    sortLatestTransactionsForDisplay(transactions).map(({ id }) => id),
    ["b", "c", "a"],
  );
});

test("não altera a coleção original", () => {
  const transactions = [
    {
      id: "first",
      due_date: "2026-05-10",
      created_at: null,
    },
    {
      id: "second",
      due_date: "2026-07-15",
      created_at: "2026-07-29T12:00:00Z",
    },
  ];

  sortLatestTransactionsForDisplay(transactions);

  assert.deepEqual(
    transactions.map(({ id }) => id),
    ["first", "second"],
  );
});

test("ordena resgate de investimento junto com receitas", () => {
  const transactions = [
    {
      id: "application",
      due_date: "2026-08-01",
      type: "Transferência",
      account_id: "checking",
      investment_event_type: "application" as const,
    },
    {
      id: "expense",
      due_date: "2026-08-02",
      type: "Despesa",
      account_id: "checking",
    },
    {
      id: "redemption",
      due_date: "2026-08-03",
      type: "Transferência",
      account_id: "checking",
      investment_event_type: "redemption" as const,
    },
    {
      id: "income",
      due_date: "2026-08-04",
      type: "Receita",
      account_id: "checking",
    },
  ];

  assert.deepEqual(
    sortTransactionsByCashDirection(transactions, "checking").map(
      ({ id }) => id,
    ),
    ["redemption", "income", "application", "expense"],
  );
});

test("resgate integrado só é crédito da conta financeira vinculada", () => {
  const transactions = [
    {
      id: "redemption",
      due_date: "2026-08-03",
      type: "Transferência",
      account_id: "checking",
      investment_event_type: "redemption" as const,
    },
    {
      id: "other-income",
      due_date: "2026-08-04",
      type: "Receita",
      account_id: "other",
    },
  ];

  assert.deepEqual(
    sortTransactionsByCashDirection(transactions, "other").map(
      ({ id }) => id,
    ),
    ["other-income", "redemption"],
  );
});
