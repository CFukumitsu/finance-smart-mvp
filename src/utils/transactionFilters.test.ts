import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { sortLatestTransactionsForDisplay } from "./transactionFilters.ts";

test("ordena os últimos cadastrados pela data financeira exibida", () => {
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
    ["newer-financial-date", "older-financial-date"],
  );
});

test("desempata por created_at e depois por id", () => {
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
