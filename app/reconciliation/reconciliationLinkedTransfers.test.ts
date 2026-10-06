import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const GUARD = "blockLinkedTransferIndividualChange(";

function functionBody(signature: string) {
  const start = page.indexOf(signature);
  assert.ok(start >= 0, `${signature} não encontrado`);
  const next = page.slice(start + signature.length).search(/\n  (async )?function /);
  return page.slice(start, next < 0 ? undefined : start + signature.length + next);
}

function assertGuardBefore(body: string, writes: string[], name: string) {
  const guard = body.indexOf(GUARD);
  assert.ok(guard >= 0, `${name} precisa do guard`);
  for (const write of writes) {
    const position = body.indexOf(write);
    assert.ok(position >= 0, `${name}: ${write} não encontrado`);
    assert.ok(guard < position, `${name}: guard deve vir antes de ${write}`);
  }
}

test("lançamentos da conciliação carregam transfer_group_id", () => {
  assert.equal(page.match(/category_id, transfer_group_id"/g)?.length, 6);
  assert.ok(!page.includes('status, category_id")'));
});

test("corrigir lançamento: bloqueado ao abrir e antes do UPDATE", () => {
  assertGuardBefore(functionBody("function openEditTransactionDrawer("), ["setItemToEditTransaction(item)"], "abrir correção");
  assertGuardBefore(functionBody("async function updateTransactionFromReconciliation("), [".update({"], "salvar correção");
});

test("ajustar total vinculado: bloqueado antes de vincular e do UPDATE de valor", () => {
  assertGuardBefore(
    functionBody("async function reconcileAndAdjustLinkedTotal("),
    ["window.confirm(", "saveReconciliation(item, transaction.id)", ".update({"],
    "ajustar total",
  );
});

test("conciliar com valor diferente: bloqueado antes da RPC; sem mudança de valor só vincula", () => {
  const body = functionBody("async function manuallyReconcile(");
  assertGuardBefore(body, ['rpc("reconcile_transaction_with_value"', "saveReconciliation(item, transactionId)"], "conciliar");
  assert.ok(body.includes(`valueChanged &&\n      ${GUARD}`), "o guard só se aplica quando o valor muda");
});

test("operações que só criam/removem vínculo continuam sem bloqueio", () => {
  for (const signature of [
    "async function saveReconciliation(",
    "async function unlinkReconciliation(",
    "async function ignoreStatementItem(",
    "async function unlinkAllReconciliations(",
    "async function runAutoReconciliation(",
    "async function createTransactionFromImportedItem(",
  ]) {
    const body = functionBody(signature);
    assert.ok(!body.includes(GUARD), `${signature} não deve ser bloqueada`);
    assert.ok(!/from\("transactions"\)\s*\.(update|delete)\(/.test(body), `${signature} não altera transactions`);
  }
});
