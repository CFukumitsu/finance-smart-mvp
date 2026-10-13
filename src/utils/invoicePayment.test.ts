import assert from "node:assert/strict";
import test from "node:test";
import {
  checkLinkedInvoicePaymentEdit,
  getInvoicePaymentStatusOnReclose,
  isInvoicePaymentOverdue,
  isSameMoneyAmount,
  LINKED_INVOICE_PAYMENT_TYPE_MESSAGE,
  LINKED_INVOICE_PAYMENT_VALUE_MESSAGE,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./invoicePayment.ts";

const today = "2026-10-13";

const payment = (overrides: Record<string, unknown> = {}) => ({
  type: "Pagamento de Fatura",
  status: "Pendente",
  due_date: "2026-10-05",
  value: 2865.68,
  ...overrides,
});

test("pagamento futuro não aparece como vencido", () => {
  assert.equal(isInvoicePaymentOverdue(payment({ due_date: "2026-11-05" }), today), false);
});

test("pagamento pendente com data passada aparece como Vencido sem mudar status", () => {
  const overdue = payment();
  assert.equal(isInvoicePaymentOverdue(overdue, today), true);
  assert.equal(overdue.status, "Pendente");
});

test("pagamento na data de hoje ainda não é vencido", () => {
  assert.equal(isInvoicePaymentOverdue(payment({ due_date: today }), today), false);
});

test("Vencido só se aplica a Pagamento de Fatura pendente", () => {
  assert.equal(isInvoicePaymentOverdue(payment({ status: "Pago" }), today), false);
  assert.equal(isInvoicePaymentOverdue(payment({ type: "Despesa" }), today), false);
});

test("comparação de valores usa a precisão da moeda (ruído de ponto flutuante)", () => {
  assert.equal(isSameMoneyAmount(0.1 + 0.2, 0.3, "BRL"), true);
  assert.equal(isSameMoneyAmount(10.005, 10.0049, "USD"), false);
  assert.equal(isSameMoneyAmount(1.23, 1.23, null), true);
});

test("fechar a fatura de novo preserva Pago e mantém Pendente nos demais casos", () => {
  assert.equal(getInvoicePaymentStatusOnReclose("Pago"), "Pago");
  assert.equal(getInvoicePaymentStatusOnReclose("Pendente"), "Pendente");
  assert.equal(getInvoicePaymentStatusOnReclose(null), "Pendente");
  assert.equal(getInvoicePaymentStatusOnReclose(undefined), "Pendente");
});

test("edição de pagamento vinculado: valor divergente da fatura é bloqueado", () => {
  assert.deepEqual(
    checkLinkedInvoicePaymentEdit({
      originalValue: 2865.68,
      newValue: 3000,
      newType: "Pagamento de Fatura",
      statementTotal: 2865.68,
      currency: "BRL",
    }),
    { ok: false, message: LINKED_INVOICE_PAYMENT_VALUE_MESSAGE },
  );
});

test("edição de pagamento vinculado: manter o valor ou alinhar ao total é permitido", () => {
  const base = { newType: "Pagamento de Fatura", statementTotal: 2865.68, currency: "BRL" };
  assert.deepEqual(
    checkLinkedInvoicePaymentEdit({ ...base, originalValue: 2865.68, newValue: 2865.68 }),
    { ok: true },
  );
  // Legado já divergente: editar outros campos sem mexer no valor continua possível.
  assert.deepEqual(
    checkLinkedInvoicePaymentEdit({ ...base, originalValue: 2800, newValue: 2800 }),
    { ok: true },
  );
  assert.deepEqual(
    checkLinkedInvoicePaymentEdit({ ...base, originalValue: 2800, newValue: 2865.68 }),
    { ok: true },
  );
});

test("edição de pagamento vinculado não pode mudar o tipo", () => {
  assert.deepEqual(
    checkLinkedInvoicePaymentEdit({
      originalValue: 100,
      newValue: 100,
      newType: "Despesa",
      statementTotal: 100,
    }),
    { ok: false, message: LINKED_INVOICE_PAYMENT_TYPE_MESSAGE },
  );
});
