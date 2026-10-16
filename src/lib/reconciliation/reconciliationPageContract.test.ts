import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../../app/reconciliation/page.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../../services/reconciliationLinkService.ts", import.meta.url), "utf8");

function functionBody(name: string) {
  const start = page.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `${name} não encontrada`);
  const next = page.indexOf("\n  async function ", start + 1);
  return page.slice(start, next < 0 ? undefined : next);
}

test("candidatos somam os vínculos gravados de outras faturas, não só os itens da tela", () => {
  assert.ok(page.includes("linkedItems: mergeLinkedItems(items, persistedLinks)"));
  assert.ok(service.includes('.in("transaction_id", idsChunk)'));
  // Sem filtro por competência/conta: o vínculo vale em qualquer fatura.
  assert.ok(!/credit_card_statement_item_transactions[\s\S]{0,300}competence_id/.test(service));
});

test("conciliar revalida no banco antes de gravar, inclusive com valor editado", () => {
  const body = functionBody("manuallyReconcile");
  const validation = body.indexOf("validateReconciliationAgainstDatabase(item, selectedTransaction");
  assert.ok(validation >= 0);
  assert.ok(body.includes("effectiveValue: reconciledValue"));
  assert.ok(validation < body.indexOf("saveReconciliation(item, transactionId)"));
  assert.ok(validation < body.indexOf('"reconcile_transaction_with_value"'));
});

test("vincular e ajustar total confere o já conciliado gravado antes de alterar o lançamento", () => {
  const body = functionBody("reconcileAndAdjustLinkedTotal");
  const validation = body.indexOf("expectedAlreadyReconciled: transaction.alreadyReconciled");
  assert.ok(validation >= 0);
  assert.ok(validation < body.indexOf("saveReconciliation(item, transaction.id)"));
});

test("conciliação automática não reutiliza lançamentos que já têm vínculo gravado", () => {
  const body = functionBody("runAutoReconciliation");
  assert.ok(body.includes("new Set<string>(alreadyLinkedLinks.map((link) => link.transactionId))"));
  assert.ok(body.indexOf("loadPersistedLinksForTransactions") < body.indexOf("findGroupedMatchingTransaction("));
});
