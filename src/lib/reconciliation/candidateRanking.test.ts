import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildReconciliationCandidates, calculateAdjustedTransactionValue, moneyToCents } from "./candidateRanking.ts";

const item = { id: "statement-current", date: "2026-07-10", description: "Mercado Central", value: 125 };

function transaction(id: string, value: number, date = "2026-07-10", description = id) {
  return { id, value, due_date: date, description, type: "Despesa" };
}

test("comparação monetária usa centavos", () => {
  assert.equal(moneyToCents(0.1 + 0.2), 30);
  assert.equal(calculateAdjustedTransactionValue(600, 125), 725);
});

test("ordena igualdade exata antes de diferença, data e descrição", () => {
  const candidates = buildReconciliationCandidates({
    statementItem: item,
    linkedItems: [],
    transactions: [
      transaction("recent-similar", 126, "2026-07-10", "Mercado Central"),
      transaction("exact-date-far", 125, "2026-07-15", "Outro"),
      transaction("exact-best", 125, "2026-07-10", "Mercado Central"),
    ],
  });
  assert.deepEqual(candidates.map((candidate) => candidate.id), ["exact-best", "exact-date-far", "recent-similar"]);
  assert.ok(candidates[0].badges.includes("Correspondência exata"));
});

test("lançamento parcialmente conciliado aparece somente com saldo disponível", () => {
  const candidates = buildReconciliationCandidates({
    statementItem: item,
    transactions: [transaction("partial", 725)],
    linkedItems: [{ id: "old", value: 600, matchedTransactionId: "partial" }],
  });
  assert.equal(candidates[0].originalValue, 725);
  assert.equal(candidates[0].alreadyReconciled, 600);
  assert.equal(candidates[0].availableBalance, 125);
  assert.ok(candidates[0].badges.includes("Parcial"));
});

test("saldo zero e lançamento totalmente conciliado não aparecem", () => {
  const candidates = buildReconciliationCandidates({
    statementItem: item,
    transactions: [transaction("full", 600), transaction("zero", 0)],
    linkedItems: [{ id: "old", value: 600, matchedTransactionId: "full" }],
  });
  assert.deepEqual(candidates, []);
});

test("múltiplos vínculos são somados e desvinculação devolve o saldo", () => {
  const baseTransaction = transaction("multi", 1000);
  const linkedItems = [
    { id: "a", value: 300, matchedTransactionId: "multi" },
    { id: "b", value: 200, matchedTransactionId: "multi" },
  ];
  const partial = buildReconciliationCandidates({ statementItem: item, transactions: [baseTransaction], linkedItems });
  assert.equal(partial[0].availableBalance, 500);
  const afterUnlink = buildReconciliationCandidates({ statementItem: item, transactions: [baseTransaction], linkedItems: [] });
  assert.equal(afterUnlink[0].availableBalance, 1000);
});

test("receita respeita sinal e pagamentos/transferências não viram candidatos", () => {
  const candidates = buildReconciliationCandidates({
    statementItem: { ...item, value: -125 },
    linkedItems: [],
    transactions: [
      { ...transaction("income", 125), type: "Receita" },
      { ...transaction("invoice", 125), type: "Pagamento de Fatura" },
      { ...transaction("transfer", 125), type: "Transferência" },
    ],
  });
  assert.deepEqual(candidates.map((candidate) => candidate.id), ["income"]);
});

