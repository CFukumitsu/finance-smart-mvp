// Confirmação rápida de pagamento ("check verde") em Lançamentos.
// - Só muda status para "Pago" e grava a data efetiva em due_date; conta,
//   competência e valor ficam como estão. O saldo segue a regra por data
//   (balanceCalculations), então não há segundo débito.
// - Elegíveis: Pagamento de Fatura e Despesa em conta bancária, pendentes.
//   Compras no cartão são quitadas pela fatura; receitas, transferências,
//   lançamentos de Bankroll/Investimentos e abastecimentos têm fluxo próprio.
// - Divergência entre o lançamento e o total da fatura vinculada não bloqueia:
//   exige confirmação explícita e nunca é corrigida automaticamente.

// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { formatMoney } from "./currencies.ts";
import {
  getMinorUnitDigits,
  INVOICE_PAYMENT_TYPE,
  isSameMoneyAmount,
  toMinorUnits,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./invoicePayment.ts";

export type PaymentConfirmationTransaction = {
  type: string;
  status: string | null;
  value: number;
  bankroll_integration_group_id?: string | null;
  investment_integration_group_id?: string | null;
  transfer_group_id?: string | null;
};

export type PaymentConfirmationContext = {
  /** Conta bancária comum (Conta, fora de Investimentos). */
  isBankAccount: boolean;
  /** Categoria de abastecimento: data e registro de combustível andam juntos. */
  isFuel: boolean;
};

export function canConfirmPayment(
  transaction: PaymentConfirmationTransaction,
  context: PaymentConfirmationContext,
) {
  if (transaction.status !== "Pendente") return false;
  if (
    transaction.bankroll_integration_group_id ||
    transaction.investment_integration_group_id ||
    transaction.transfer_group_id
  ) {
    return false;
  }
  if (transaction.type === INVOICE_PAYMENT_TYPE) return true;
  return (
    transaction.type === "Despesa" && context.isBankAccount && !context.isFuel
  );
}

export type InvoiceDivergence = {
  transactionValue: number;
  statementTotal: number;
  /** Lançamento − fatura: positivo quando o lançamento é maior. */
  difference: number;
};

export function getInvoiceDivergence(
  transactionValue: number,
  statementTotal: number | null,
  currency?: string | null,
): InvoiceDivergence | null {
  if (statementTotal === null) return null;
  if (isSameMoneyAmount(transactionValue, statementTotal, currency)) return null;
  return {
    transactionValue,
    statementTotal,
    difference:
      (toMinorUnits(transactionValue, currency) -
        toMinorUnits(statementTotal, currency)) /
      10 ** getMinorUnitDigits(currency),
  };
}

/** Diferença com sinal explícito: "+R$ 10,00", "−R$ 10,00", "R$ 0,00". */
export function formatSignedMoney(value: number, currency?: string | null) {
  const formatted = formatMoney(Math.abs(value), currency);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

export type PaymentConfirmationResult =
  | { ok: true }
  | { ok: false; reason: "not-eligible" | "already-paid" | "invalid-date"; message: string }
  | { ok: false; reason: "divergence"; message: string; divergence: InvoiceDivergence };

export function validatePaymentConfirmation(input: {
  transaction: PaymentConfirmationTransaction;
  context: PaymentConfirmationContext;
  effectiveDate: string;
  today: string;
  /** Total da fatura vinculada (só Pagamento de Fatura); null sem fatura. */
  statementTotal: number | null;
  currency?: string | null;
  divergenceAcknowledged: boolean;
}): PaymentConfirmationResult {
  const { transaction } = input;

  if (transaction.status === "Pago") {
    return { ok: false, reason: "already-paid", message: "Este pagamento já foi confirmado." };
  }

  if (!canConfirmPayment(transaction, input.context)) {
    return {
      ok: false,
      reason: "not-eligible",
      message: "Este lançamento não pode ser confirmado por aqui. Use o fluxo próprio dele.",
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) {
    return { ok: false, reason: "invalid-date", message: "Informe a data efetiva do pagamento." };
  }

  if (input.effectiveDate > input.today) {
    return {
      ok: false,
      reason: "invalid-date",
      message: "A data efetiva não pode ser futura. Confirme depois que o pagamento for realizado.",
    };
  }

  if (transaction.type === INVOICE_PAYMENT_TYPE && !input.divergenceAcknowledged) {
    const divergence = getInvoiceDivergence(
      Number(transaction.value),
      input.statementTotal,
      input.currency,
    );
    if (divergence) {
      return {
        ok: false,
        reason: "divergence",
        message: "O valor do lançamento é diferente do total da fatura vinculada.",
        divergence,
      };
    }
  }

  return { ok: true };
}
