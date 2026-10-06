import assert from "node:assert/strict";
import test from "node:test";
import {
  blockLinkedTransferIndividualChange,
  LINKED_TRANSFER_INDIVIDUAL_CHANGE_MESSAGE,
  buildCreateTransferRpcParams,
  buildUpdateTransferRpcParams,
  createTransferIdempotencyKey,
  getLinkedTransferFormValues,
  isLegacyTransfer,
  isLinkedTransfer,
  LINKED_TRANSFER_DELETE_CONFIRMATION,
  resolveLinkedTransferLegs,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./linkedTransfers.ts";

const ITAU = "acc-itau";
const BMG = "acc-bmg";
const GROUP = "11111111-1111-4111-8111-111111111111";

const outgoing = {
  id: "tx-out",
  description: "Reserva",
  due_date: "2026-10-05",
  value: 1000,
  status: "Pago",
  account_id: ITAU,
  competence_id: "comp-2026-10",
  origin_account_id: ITAU,
  destination_account_id: BMG,
  transfer_group_id: GROUP,
};

const incoming = {
  ...outgoing,
  id: "tx-in",
  status: "Recebido",
  account_id: BMG,
};

test("identifica saída e entrada pela estrutura, independente da ordem das linhas", () => {
  for (const rows of [
    [outgoing, incoming],
    [incoming, outgoing],
  ]) {
    const legs = resolveLinkedTransferLegs(rows);
    assert.equal(legs?.outgoing.id, "tx-out");
    assert.equal(legs?.incoming.id, "tx-in");
  }
});

test("editar pela ponta Recebido carrega a operação sem inverter origem e destino", () => {
  const legs = resolveLinkedTransferLegs([incoming, outgoing]);
  assert.ok(legs);

  assert.deepEqual(getLinkedTransferFormValues(legs), {
    transferGroupId: GROUP,
    originAccountId: ITAU,
    destinationAccountId: BMG,
    value: 1000,
    destinationValue: 1000,
    dueDate: "2026-10-05",
    competenceId: "comp-2026-10",
    description: "Reserva",
  });
});

test("grupo incompleto ou incoerente não é tratado como transferência vinculada", () => {
  assert.equal(resolveLinkedTransferLegs([outgoing]), null);
  assert.equal(resolveLinkedTransferLegs([outgoing, incoming, incoming]), null);
  assert.equal(
    resolveLinkedTransferLegs([outgoing, { ...incoming, status: "Pago" }]),
    null,
  );
  assert.equal(
    resolveLinkedTransferLegs([
      outgoing,
      { ...incoming, transfer_group_id: "22222222-2222-4222-8222-222222222222" },
    ]),
    null,
  );
  assert.equal(
    resolveLinkedTransferLegs([
      outgoing,
      { ...incoming, account_id: "acc-nubank", destination_account_id: "acc-nubank" },
    ]),
    null,
  );
  assert.equal(
    resolveLinkedTransferLegs([
      { ...outgoing, transfer_group_id: null },
      { ...incoming, transfer_group_id: null },
    ]),
    null,
  );
});

test("vinculada usa o novo fluxo; Transferência sem grupo é legada", () => {
  assert.equal(isLinkedTransfer({ type: "Transferência", transfer_group_id: GROUP }), true);
  assert.equal(isLegacyTransfer({ type: "Transferência", transfer_group_id: GROUP }), false);
  assert.equal(isLinkedTransfer({ type: "Transferência", transfer_group_id: null }), false);
  assert.equal(isLegacyTransfer({ type: "Transferência", transfer_group_id: null }), true);
  assert.equal(isLegacyTransfer({ type: "Transferência" }), true);
  assert.equal(isLegacyTransfer({ type: "Despesa", transfer_group_id: null }), false);
});

test("parâmetros da criação levam a chave idempotente e não definem status, tipo ou dono", () => {
  const params = buildCreateTransferRpcParams({
    originAccountId: ITAU,
    destinationAccountId: BMG,
    dueDate: "2026-12-20",
    competenceId: "comp-2026-12",
    amount: 1000,
    description: "Reserva",
    idempotencyKey: GROUP,
  });

  assert.deepEqual(params, {
    p_origin_account_id: ITAU,
    p_destination_account_id: BMG,
    p_date: "2026-12-20",
    p_competence_id: "comp-2026-12",
    p_amount: 1000,
    p_description: "Reserva",
    p_destination_amount: null,
    p_provider_id: null,
    p_fee_amount: null,
    p_fee_currency: null,
    p_quoted_rate: null,
    p_quoted_rate_base_currency: null,
    p_quoted_rate_quote_currency: null,
    p_idempotency_key: GROUP,
  });
});

test("parâmetros da edição identificam o grupo e enviam a operação completa", () => {
  const params = buildUpdateTransferRpcParams({
    transferGroupId: GROUP,
    originAccountId: ITAU,
    destinationAccountId: "acc-nubank",
    dueDate: "2026-11-03",
    competenceId: "comp-2026-11",
    amount: 1250.5,
    description: "Reserva ajustada",
  });

  assert.deepEqual(params, {
    p_transfer_group_id: GROUP,
    p_origin_account_id: ITAU,
    p_destination_account_id: "acc-nubank",
    p_date: "2026-11-03",
    p_competence_id: "comp-2026-11",
    p_amount: 1250.5,
    p_description: "Reserva ajustada",
    p_destination_amount: null,
    p_provider_id: null,
    p_fee_amount: null,
    p_fee_currency: null,
    p_quoted_rate: null,
    p_quoted_rate_base_currency: null,
    p_quoted_rate_quote_currency: null,
  });
});

test("cada formulário gera uma chave idempotente UUID própria", () => {
  const first = createTransferIdempotencyKey();
  const second = createTransferIdempotencyKey();

  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, second);
});

test("a confirmação de exclusão avisa que as duas contas serão afetadas", () => {
  assert.match(LINKED_TRANSFER_DELETE_CONFIRMATION, /Excluir esta transferência\?/);
  assert.match(LINKED_TRANSFER_DELETE_CONFIRMATION, /duas contas/);
});

// Simula o fluxo da Conciliação: o guard roda antes da escrita individual.
async function correctFromReconciliation(transaction: {
  type: string;
  transfer_group_id?: string | null;
}) {
  const notices: string[] = [];
  const updates: string[] = [];
  if (!blockLinkedTransferIndividualChange(transaction, (message: string) => notices.push(message))) {
    updates.push("update transactions");
  }
  return { notices, updates };
}

test("conciliação: lançamento comum continua sendo corrigido", async () => {
  assert.deepEqual(await correctFromReconciliation({ type: "Despesa", transfer_group_id: null }), {
    notices: [],
    updates: ["update transactions"],
  });
});

test("conciliação: transferência legada mantém o comportamento atual", async () => {
  assert.deepEqual(await correctFromReconciliation({ type: "Transferência", transfer_group_id: null }), {
    notices: [],
    updates: ["update transactions"],
  });
  assert.deepEqual(await correctFromReconciliation({ type: "Transferência" }), {
    notices: [],
    updates: ["update transactions"],
  });
});

test("conciliação: transferência vinculada bloqueia a correção individual sem chamar update", async () => {
  assert.deepEqual(await correctFromReconciliation({ type: "Transferência", transfer_group_id: GROUP }), {
    notices: [LINKED_TRANSFER_INDIVIDUAL_CHANGE_MESSAGE],
    updates: [],
  });
  assert.match(LINKED_TRANSFER_INDIVIDUAL_CHANGE_MESSAGE, /transferência entre contas/);
  assert.match(LINKED_TRANSFER_INDIVIDUAL_CHANGE_MESSAGE, /edite a transferência em Lançamentos/);
  assert.equal(blockLinkedTransferIndividualChange(undefined, () => assert.fail()), false);
});
