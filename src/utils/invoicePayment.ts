// Regras do lançamento "Pagamento de Fatura".
// - O status só vira "Pago" por confirmação explícita; a data não quita.
// - O saldo da conta pagadora continua sendo debitado pela data
//   (balanceCalculations), então confirmar nunca cria um segundo débito.
// - A confirmação (paymentConfirmation.ts) mantém o valor do lançamento.

// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { resolveAccountCurrency } from "./currencies.ts";

export const INVOICE_PAYMENT_TYPE = "Pagamento de Fatura";

export const LINKED_INVOICE_PAYMENT_DELETE_MESSAGE =
  "Este pagamento está vinculado a uma fatura de cartão fechada. Para excluí-lo, reabra a fatura em Conciliação e escolha excluir também o lançamento de pagamento.";

export const LINKED_INVOICE_PAYMENT_VALUE_MESSAGE =
  "O valor deste pagamento está vinculado ao total da fatura. Para ajustá-lo, reabra a fatura em Conciliação e feche-a novamente com o valor correto.";

export const LINKED_INVOICE_PAYMENT_TYPE_MESSAGE =
  "Este lançamento é o pagamento de uma fatura fechada e não pode mudar de tipo. Para desfazer o pagamento, reabra a fatura em Conciliação.";

export const INVOICE_PAYMENT_ACCOUNT_MESSAGE =
  "Pagamentos de fatura devem sair de uma conta bancária, não de um cartão de crédito.";

export type InvoicePaymentLike = {
  type: string;
  status: string | null;
  due_date: string;
};

export function isInvoicePayment(transaction: { type: string }) {
  return transaction.type === INVOICE_PAYMENT_TYPE;
}

/** Pendente com data anterior a hoje. Só exibição: o status salvo não muda. */
export function isInvoicePaymentOverdue(
  transaction: InvoicePaymentLike,
  today: string,
) {
  return (
    isInvoicePayment(transaction) &&
    transaction.status === "Pendente" &&
    transaction.due_date < today
  );
}

/**
 * Ao fechar novamente uma fatura, o lançamento de pagamento volta a Pendente,
 * exceto quando já foi confirmado: "Pago" é preservado.
 */
export function getInvoicePaymentStatusOnReclose(
  currentStatus: string | null | undefined,
) {
  return currentStatus === "Pago" ? "Pago" : "Pendente";
}

export function getMinorUnitDigits(currency?: string | null) {
  try {
    return (
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: resolveAccountCurrency(currency),
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** Valor inteiro na menor unidade da moeda (centavos para BRL/USD/EUR/GBP). */
export function toMinorUnits(value: number, currency?: string | null) {
  return Math.round(Number(value) * 10 ** getMinorUnitDigits(currency));
}

export function isSameMoneyAmount(
  left: number,
  right: number,
  currency?: string | null,
) {
  return toMinorUnits(left, currency) === toMinorUnits(right, currency);
}

export type InvoicePaymentCheckResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Edição de um pagamento vinculado: o valor só pode mudar se continuar igual
 * ao total da fatura (o total nunca acompanha o valor digitado) e o tipo não
 * pode deixar de ser Pagamento de Fatura.
 */
export function checkLinkedInvoicePaymentEdit(input: {
  originalValue: number;
  newValue: number;
  newType: string;
  statementTotal: number;
  currency?: string | null;
}): InvoicePaymentCheckResult {
  if (input.newType !== INVOICE_PAYMENT_TYPE) {
    return { ok: false, message: LINKED_INVOICE_PAYMENT_TYPE_MESSAGE };
  }

  const valueChanged = !isSameMoneyAmount(
    input.newValue,
    input.originalValue,
    input.currency,
  );

  if (
    valueChanged &&
    !isSameMoneyAmount(input.newValue, input.statementTotal, input.currency)
  ) {
    return { ok: false, message: LINKED_INVOICE_PAYMENT_VALUE_MESSAGE };
  }

  return { ok: true };
}
