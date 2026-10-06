import type { TransferConversionInput } from "./currencyConversion";

// Transferências vinculadas (Fase 1): as duas pontas compartilham o
// transfer_group_id e são criadas, editadas e excluídas juntas pelas RPCs
// create_transfer, update_transfer e delete_transfer. Pontas com
// transfer_group_id NULL são transferências legadas e seguem o fluxo antigo.

export const LINKED_TRANSFER_DELETE_CONFIRMATION =
  "Excluir esta transferência?\nAs movimentações nas duas contas serão removidas.";

export const LINKED_TRANSFER_INCONSISTENT_MESSAGE =
  "Não foi possível carregar as duas pontas desta transferência.";

export const LINKED_TRANSFER_INDIVIDUAL_CHANGE_MESSAGE =
  "Esta movimentação faz parte de uma transferência entre contas.\nPara alterar valor, data ou descrição, edite a transferência em Lançamentos.";

export type TransferLeg = {
  id: string;
  description: string;
  due_date: string;
  value: number;
  status: string | null;
  account_id: string;
  competence_id: string;
  origin_account_id?: string | null;
  destination_account_id?: string | null;
  transfer_group_id?: string | null;
};

type TransactionLike = {
  type: string;
  transfer_group_id?: string | null;
};

export function isLinkedTransfer(transaction: TransactionLike) {
  return Boolean(transaction.transfer_group_id);
}

export function isLegacyTransfer(transaction: TransactionLike) {
  return transaction.type === "Transferência" && !transaction.transfer_group_id;
}

/**
 * Bloqueia correções que alteram uma única ponta (ex.: Conciliação). Deve ser
 * chamado antes de qualquer escrita; retorna true e avisa quando bloqueou.
 * Vincular/desvincular a conciliação não altera a transaction e não usa isto.
 */
export function blockLinkedTransferIndividualChange(
  transaction: { transfer_group_id?: string | null } | null | undefined,
  notify: (message: string) => void,
) {
  if (!transaction?.transfer_group_id) return false;
  notify(LINKED_TRANSFER_INDIVIDUAL_CHANGE_MESSAGE);
  return true;
}

/**
 * Identifica as pontas pela estrutura (a mesma regra da constraint do banco),
 * nunca pela ordem das linhas: saída = Pago na conta de origem; entrada =
 * Recebido na conta de destino. Retorna null se o grupo estiver incompleto.
 */
export function resolveLinkedTransferLegs<T extends TransferLeg>(legs: readonly T[]) {
  if (legs.length !== 2) return null;

  const outgoing = legs.find(
    (leg) => leg.status === "Pago" && leg.account_id === leg.origin_account_id,
  );
  const incoming = legs.find(
    (leg) =>
      leg.status === "Recebido" && leg.account_id === leg.destination_account_id,
  );

  if (
    !outgoing ||
    !incoming ||
    !outgoing.transfer_group_id ||
    outgoing.transfer_group_id !== incoming.transfer_group_id ||
    outgoing.origin_account_id !== incoming.origin_account_id ||
    outgoing.destination_account_id !== incoming.destination_account_id
  ) {
    return null;
  }

  return { outgoing, incoming };
}

/**
 * Dados da operação para o formulário, independentemente da ponta clicada:
 * origem e destino nunca são invertidos ao editar pela ponta recebida.
 */
export function getLinkedTransferFormValues(legs: {
  outgoing: TransferLeg;
  incoming: TransferLeg;
}) {
  return {
    transferGroupId: legs.outgoing.transfer_group_id as string,
    originAccountId: legs.outgoing.account_id,
    destinationAccountId: legs.incoming.account_id,
    value: Number(legs.outgoing.value ?? 0),
    // Na conversão a entrada tem o valor recebido na moeda do destino; na
    // mesma moeda é igual ao valor debitado.
    destinationValue: Number(legs.incoming.value ?? 0),
    dueDate: legs.outgoing.due_date,
    competenceId: legs.outgoing.competence_id,
    description: legs.outgoing.description ?? "",
  };
}

export type LinkedTransferInput = {
  originAccountId: string;
  destinationAccountId: string;
  dueDate: string;
  competenceId: string;
  /** Valor DEBITADO da conta de origem. */
  amount: number;
  description: string;
  /** Somente entre moedas diferentes; ausente/null = mesma moeda. */
  conversion?: TransferConversionInput | null;
};

function buildTransferRpcParams(input: LinkedTransferInput) {
  const conversion = input.conversion ?? null;
  return {
    p_origin_account_id: input.originAccountId,
    p_destination_account_id: input.destinationAccountId,
    p_date: input.dueDate,
    p_competence_id: input.competenceId,
    p_amount: input.amount,
    p_description: input.description,
    p_destination_amount: conversion?.destinationAmount ?? null,
    p_provider_id: conversion?.providerId ?? null,
    p_fee_amount: conversion?.feeAmount ?? null,
    p_fee_currency: conversion?.feeCurrency ?? null,
    p_quoted_rate: conversion?.quotedRate ?? null,
    p_quoted_rate_base_currency: conversion?.quotedRateBaseCurrency ?? null,
    p_quoted_rate_quote_currency: conversion?.quotedRateQuoteCurrency ?? null,
  };
}

export function buildCreateTransferRpcParams(
  input: LinkedTransferInput & { idempotencyKey: string },
) {
  return {
    ...buildTransferRpcParams(input),
    p_idempotency_key: input.idempotencyKey,
  };
}

export function buildUpdateTransferRpcParams(
  input: LinkedTransferInput & { transferGroupId: string },
) {
  return {
    p_transfer_group_id: input.transferGroupId,
    ...buildTransferRpcParams(input),
  };
}

/** Uma chave por formulário: reenviar o mesmo formulário não duplica a transferência. */
export function createTransferIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}
