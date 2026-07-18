import assert from "node:assert/strict";
import test from "node:test";
import type { ImportLayout, ImportLayoutInput, ImportLayoutRepository } from "./importLayoutManagement";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { removeImportLayoutWithRepository, replaceImportLayoutWithRepository } from "./importLayoutManagement.ts";

const input: ImportLayoutInput = { name: "Novo", header_row_index: 1, date_header: "Data", description_header: "Descrição", value_header: "Valor", installment_header: null, amount_sign: "auto" };

function layout(id = "active"): ImportLayout {
  return { id, account_id: "account", active: true, ...input };
}

function fakeRepository(options: { active?: ImportLayout | null; insertError?: Error; removeError?: Error } = {}) {
  const calls: string[] = [];
  let active = options.active === undefined ? null : options.active;
  const repository: ImportLayoutRepository = {
    async loadActive(ownerId, accountId) { calls.push(`load:${ownerId}:${accountId}`); return active; },
    async deactivate(ownerId, accountId, id) { calls.push(`deactivate:${ownerId}:${accountId}:${id}`); if (options.removeError) throw options.removeError; if (active?.id === id) active = null; },
    async reactivate(ownerId, accountId, id) { calls.push(`reactivate:${ownerId}:${accountId}:${id}`); active = layout(id); },
    async insert(ownerId, accountId) { calls.push(`insert:${ownerId}:${accountId}`); if (options.insertError) throw options.insertError; active = layout("new"); return active; },
  };
  return { repository, calls, getActive: () => active };
}

test("layout inexistente é criado com owner e conta explícitos", async () => {
  const fake = fakeRepository();
  const result = await replaceImportLayoutWithRepository({ ownerId: "owner-a", accountId: "account", input, confirmed: true, repository: fake.repository });
  assert.equal(result.status, "created");
  assert.ok(fake.calls.every((call) => call.includes("owner-a")));
});

test("layout ativo é desativado antes da substituição", async () => {
  const fake = fakeRepository({ active: layout() });
  const result = await replaceImportLayoutWithRepository({ ownerId: "owner-a", accountId: "account", input, confirmed: true, repository: fake.repository });
  assert.equal(result.status, "replaced");
  assert.deepEqual(fake.calls.slice(0, 3), ["load:owner-a:account", "deactivate:owner-a:account:active", "insert:owner-a:account"]);
});

test("cancelamento não consulta nem modifica o repositório", async () => {
  const fake = fakeRepository({ active: layout() });
  const result = await replaceImportLayoutWithRepository({ ownerId: "owner-a", accountId: "account", input, confirmed: false, repository: fake.repository });
  assert.equal(result.status, "cancelled");
  assert.deepEqual(fake.calls, []);
});

test("erro ao salvar restaura o layout anterior", async () => {
  const fake = fakeRepository({ active: layout(), insertError: new Error("save failed") });
  await assert.rejects(() => replaceImportLayoutWithRepository({ ownerId: "owner-a", accountId: "account", input, confirmed: true, repository: fake.repository }), /save failed/);
  assert.equal(fake.getActive()?.id, "active");
  assert.ok(fake.calls.includes("reactivate:owner-a:account:active"));
});

test("remoção é lógica e respeita cancelamento, ausência e erro", async () => {
  const cancelled = fakeRepository({ active: layout() });
  assert.equal((await removeImportLayoutWithRepository({ ownerId: "owner-a", accountId: "account", confirmed: false, repository: cancelled.repository })).status, "cancelled");
  assert.deepEqual(cancelled.calls, []);

  const missing = fakeRepository();
  assert.equal((await removeImportLayoutWithRepository({ ownerId: "owner-a", accountId: "account", confirmed: true, repository: missing.repository })).status, "not-found");

  const failing = fakeRepository({ active: layout(), removeError: new Error("remove failed") });
  await assert.rejects(() => removeImportLayoutWithRepository({ ownerId: "owner-a", accountId: "account", confirmed: true, repository: failing.repository }), /remove failed/);
});

