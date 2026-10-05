import assert from "node:assert/strict";
import test from "node:test";
import {
  getAutomaticTransactionStatus,
  getStatusAfterDateChange,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./transactionStatus.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateAccountFinalBalance } from "./balanceCalculations.ts";

const today = "2026-10-05";
const past = "2026-10-01";
const future = "2026-11-10";

function editTransferDate(currentStatus: string, newDueDate: string) {
  return getStatusAfterDateChange({
    type: "Transferência",
    currentStatus,
    newDueDate,
    isEditing: true,
    today,
  });
}

test("transferência Pago: editar data continua Pago", () => {
  assert.equal(editTransferDate("Pago", past), "Pago");
  assert.equal(editTransferDate("Pago", today), "Pago");
});

test("transferência Recebido: editar data continua Recebido", () => {
  assert.equal(editTransferDate("Recebido", past), "Recebido");
  assert.equal(editTransferDate("Recebido", today), "Recebido");
});

test("transferência Recebido: mover para data futura continua Recebido", () => {
  assert.equal(editTransferDate("Recebido", future), "Recebido");
});

test("transferência Pago: mover para data futura continua Pago", () => {
  assert.equal(editTransferDate("Pago", future), "Pago");
});

test("ponta de entrada editada continua sendo crédito no saldo", () => {
  const status = editTransferDate("Recebido", future);
  const balance = calculateAccountFinalBalance({
    accountId: "bmg",
    openingBalance: 0,
    transactions: [
      { account_id: "bmg", type: "Transferência", value: 1000, status },
    ],
  });

  assert.equal(balance, 1000);
});

test("Receita e Despesa preservam o status automático atual ao editar a data", () => {
  for (const isEditing of [true, false]) {
    const change = (type: string, currentStatus: string, newDueDate: string) =>
      getStatusAfterDateChange({ type, currentStatus, newDueDate, isEditing, today });

    assert.equal(change("Receita", "Pendente", past), "Recebido");
    assert.equal(change("Receita", "Recebido", future), "Pendente");
    assert.equal(change("Despesa", "Pendente", today), "Pago");
    assert.equal(change("Despesa", "Pago", future), "Pendente");
    assert.equal(change("Pagamento de Fatura", "Pago", future), "Pendente");
  }
});

test("criação de transferência mantém o cálculo automático do formulário", () => {
  // Na criação as pontas são gravadas com Pago/Recebido fixos.
  assert.equal(
    getStatusAfterDateChange({
      type: "Transferência",
      currentStatus: "Pago",
      newDueDate: future,
      isEditing: false,
      today,
    }),
    "Pendente",
  );
});

test("status automático preserva a regra anterior", () => {
  assert.equal(getAutomaticTransactionStatus("Receita", past, today), "Recebido");
  assert.equal(getAutomaticTransactionStatus("Receita", today, today), "Recebido");
  assert.equal(getAutomaticTransactionStatus("Receita", future, today), "Pendente");
  assert.equal(getAutomaticTransactionStatus("Despesa", past, today), "Pago");
  assert.equal(getAutomaticTransactionStatus("Transferência", past, today), "Pago");
  assert.equal(getAutomaticTransactionStatus("Transferência", future, today), "Pendente");
});
