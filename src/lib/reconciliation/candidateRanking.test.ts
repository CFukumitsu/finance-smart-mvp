import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildReconciliationCandidates, calculateAdjustedTransactionValue, checkReconciliationAvailability, mergeLinkedItems, moneyToCents } from "./candidateRanking.ts";

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

// --- Saldo a partir dos vínculos gravados (regressão "Bluefit 7/10") ---

const bluefit = { id: "bluefit-7-10", value: 241.02, due_date: "2026-10-03", description: "Bluefit 7/10", type: "Despesa" };
const otherRow = { id: "row-3", date: "2026-10-03", description: "OUTRA COMPRA", value: 120.51 };

function candidateIds(linkedItems: { id?: string; value: number; matchedTransactionId?: string }[], statementItem = otherRow) {
  return buildReconciliationCandidates({ statementItem, transactions: [bluefit], linkedItems }).map((candidate) => candidate.id);
}

test("1. sem conciliações: candidato com saldo integral", () => {
  const [candidate] = buildReconciliationCandidates({ statementItem: otherRow, transactions: [bluefit], linkedItems: [] });
  assert.equal(candidate.alreadyReconciled, 0);
  assert.equal(candidate.availableBalance, 241.02);
  assert.equal(checkReconciliationAvailability({ transaction: bluefit, statementItemId: "row-3", linkedItems: [] }).allowed, true);
});

test("2. parcialmente conciliado: saldo restante correto", () => {
  const linkedItems = [{ id: "row-1", value: 120.51, matchedTransactionId: bluefit.id }];
  const [candidate] = buildReconciliationCandidates({ statementItem: otherRow, transactions: [bluefit], linkedItems });
  assert.equal(candidate.alreadyReconciled, 120.51);
  assert.equal(candidate.availableBalance, 120.51);
  assert.ok(candidate.badges.includes("Parcial"));
});

test("3 e 4. 100% conciliado por duas linhas da fatura: não é candidato e a confirmação bloqueia", () => {
  const linkedItems = [
    { id: "row-1", value: 120.51, matchedTransactionId: bluefit.id },
    { id: "row-2", value: 120.51, matchedTransactionId: bluefit.id },
  ];
  assert.deepEqual(candidateIds(linkedItems), []);
  const check = checkReconciliationAvailability({ transaction: bluefit, statementItemId: "row-3", linkedItems });
  assert.equal(check.alreadyReconciled, 241.02);
  assert.equal(check.availableBalance, 0);
  assert.equal(check.allowed, false);
});

test("4b. três ou mais linhas somam em centavos (sem erro de ponto flutuante)", () => {
  const transaction = { ...bluefit, value: 0.3 };
  const linkedItems = [
    { id: "a", value: 0.1, matchedTransactionId: transaction.id },
    { id: "b", value: 0.1, matchedTransactionId: transaction.id },
    { id: "c", value: 0.1, matchedTransactionId: transaction.id },
  ];
  assert.equal(checkReconciliationAvailability({ transaction, statementItemId: "row-3", linkedItems }).allowed, false);
});

test("4c. a própria linha não conta como já conciliada (trocar o vínculo dela)", () => {
  const linkedItems = [
    { id: "row-1", value: 120.51, matchedTransactionId: bluefit.id },
    { id: "row-2", value: 120.51, matchedTransactionId: bluefit.id },
  ];
  const check = checkReconciliationAvailability({ transaction: bluefit, statementItemId: "row-2", linkedItems });
  assert.equal(check.alreadyReconciled, 120.51);
  assert.equal(check.allowed, true);
  assert.deepEqual(candidateIds(linkedItems, { ...otherRow, id: "row-2" }), [bluefit.id]);
});

test("5. conciliação desfeita libera o saldo novamente", () => {
  const before = [
    { id: "row-1", value: 120.51, matchedTransactionId: bluefit.id },
    { id: "row-2", value: 120.51, matchedTransactionId: bluefit.id },
  ];
  assert.deepEqual(candidateIds(before), []);
  // Desvincular apaga o vínculo gravado e limpa matchedTransactionId do item.
  const afterUnlink = [before[0], { id: "row-2", value: 120.51, matchedTransactionId: undefined }];
  const [candidate] = buildReconciliationCandidates({ statementItem: otherRow, transactions: [bluefit], linkedItems: afterUnlink });
  assert.equal(candidate.availableBalance, 120.51);
  const persistedAfterUnlink = [{ statementItemId: "row-1", transactionId: bluefit.id, value: 120.51 }];
  assert.equal(
    checkReconciliationAvailability({ transaction: bluefit, statementItemId: "row-3", linkedItems: mergeLinkedItems([], persistedAfterUnlink) }).availableBalance,
    120.51
  );
});

test("6. valor acima do saldo: regra existente mantida (só bloqueia sem saldo)", () => {
  const linkedItems = [{ id: "row-1", value: 200, matchedTransactionId: bluefit.id }];
  // Saldo 41,02 e item de 120,51: continua permitido, com a diferença exibida.
  const [candidate] = buildReconciliationCandidates({ statementItem: otherRow, transactions: [bluefit], linkedItems });
  assert.equal(candidate.availableBalance, 41.02);
  assert.equal(candidate.valueDifference, 79.49);
  assert.equal(checkReconciliationAvailability({ transaction: bluefit, statementItemId: "row-3", linkedItems }).allowed, true);
  // Vínculos que já cobrem o lançamento inteiro (ou mais) bloqueiam.
  const covered = [...linkedItems, { id: "row-2", value: 41.02, matchedTransactionId: bluefit.id }];
  assert.equal(checkReconciliationAvailability({ transaction: bluefit, statementItemId: "row-3", linkedItems: covered }).allowed, false);
  const over = [{ id: "row-1", value: 300, matchedTransactionId: bluefit.id }];
  assert.equal(checkReconciliationAvailability({ transaction: bluefit, statementItemId: "row-3", linkedItems: over }).allowed, false);
});

test("7. tentativas sobre o mesmo saldo com tela desatualizada: a revalidação usa os vínculos gravados", () => {
  // A tela (estado em memória) acha que nada foi vinculado...
  const staleScreenItems = [
    { id: "row-1", value: 120.51, matchedTransactionId: undefined },
    { id: "row-2", value: 120.51, matchedTransactionId: undefined },
    { id: "row-3", value: 241.02, matchedTransactionId: undefined },
  ];
  assert.deepEqual(candidateIds(staleScreenItems), [bluefit.id]);
  // ...mas outra aba já gravou um vínculo de 241,02 para row-3.
  const persistedNow = [{ statementItemId: "row-3", transactionId: bluefit.id, value: 241.02 }];
  const first = checkReconciliationAvailability({ transaction: bluefit, statementItemId: "row-1", linkedItems: mergeLinkedItems([], persistedNow) });
  assert.equal(first.allowed, false);
  // Sequência normal: row-1 gravado, row-2 ainda cabe; com row-1 e row-2 gravados, row-3 bloqueia.
  const partialPersisted = [{ statementItemId: "row-1", transactionId: bluefit.id, value: 120.51 }];
  assert.equal(
    checkReconciliationAvailability({ transaction: bluefit, statementItemId: "row-2", linkedItems: mergeLinkedItems([], partialPersisted) }).allowed,
    true
  );
  const bothPersisted = [...partialPersisted, { statementItemId: "row-2", transactionId: bluefit.id, value: 120.51 }];
  assert.equal(
    checkReconciliationAvailability({ transaction: bluefit, statementItemId: "row-3", linkedItems: mergeLinkedItems([], bothPersisted) }).allowed,
    false
  );
});

test("8. edição do valor para conciliação: revalida com o valor digitado, sem mudar o cálculo dos candidatos", () => {
  const linkedItems = [
    { id: "row-1", value: 120.51, matchedTransactionId: bluefit.id },
    { id: "row-2", value: 120.51, matchedTransactionId: bluefit.id },
  ];
  const raised = checkReconciliationAvailability({ transaction: bluefit, statementItemId: "row-3", linkedItems, effectiveValue: 361.53 });
  assert.equal(raised.availableBalance, 120.51);
  assert.equal(raised.allowed, true);
  assert.equal(checkReconciliationAvailability({ transaction: bluefit, statementItemId: "row-3", linkedItems, effectiveValue: 241.02 }).allowed, false);
  const [candidate] = buildReconciliationCandidates({ statementItem: otherRow, transactions: [bluefit], linkedItems: [] });
  assert.equal(candidate.originalValue, 241.02);
});

test("9. vínculos de outras faturas/competências contam no saldo; os da fatura aberta seguem o estado da tela", () => {
  const currentItems = [{ id: "row-1", value: 120.51, matchedTransactionId: bluefit.id }];
  const persisted = [
    { statementItemId: "row-1", transactionId: bluefit.id, value: 120.51 },
    { statementItemId: "other-statement-row", transactionId: bluefit.id, value: 120.51 },
    { statementItemId: "unrelated", transactionId: "another-transaction", value: 50 },
  ];
  const merged = mergeLinkedItems(currentItems, persisted);
  assert.equal(merged.length, 3, "row-1 não é contado duas vezes");
  assert.deepEqual(candidateIds(merged), []);
  // Só com o estado da tela (comportamento anterior) o lançamento continuaria disponível.
  assert.deepEqual(candidateIds(currentItems), [bluefit.id]);
  // Desvincular na tela aberta prevalece sobre o vínculo antigo lido antes.
  const unlinkedOnScreen = mergeLinkedItems([{ id: "row-1", value: 120.51, matchedTransactionId: undefined }], persisted.slice(0, 1));
  const [candidate] = buildReconciliationCandidates({ statementItem: otherRow, transactions: [bluefit], linkedItems: unlinkedOnScreen });
  assert.equal(candidate.availableBalance, 241.02);
});

test("9b. dois lançamentos iguais (duplicados): cada um tem o próprio saldo", () => {
  const duplicate = { ...bluefit, id: "bluefit-duplicado" };
  const linkedItems = [
    { id: "row-1", value: 120.51, matchedTransactionId: bluefit.id },
    { id: "row-2", value: 120.51, matchedTransactionId: bluefit.id },
  ];
  const candidates = buildReconciliationCandidates({ statementItem: otherRow, transactions: [bluefit, duplicate], linkedItems });
  assert.deepEqual(candidates.map((candidate) => candidate.id), ["bluefit-duplicado"]);
  assert.equal(candidates[0].alreadyReconciled, 0);
});

