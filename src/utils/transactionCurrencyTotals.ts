// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { PRIMARY_CURRENCY, resolveAccountCurrency } from "./currencies.ts";

export type TotalsTransaction = {
  type: string;
  value: number;
  account?: {
    type?: string | null;
    currency?: string | null;
  } | null;
};

export type TransactionTotals = {
  income: number;
  directExpenses: number;
  cashExpenses: number;
  invoicePayments: number;
  cashFlowResult: number;
};

export type CurrencyTransactionTotals = {
  currency: string;
  totals: TransactionTotals;
};

/** Totais da tela Lançamentos para um conjunto de lançamentos de UMA moeda. */
export function calculateTransactionTotals(
  transactions: readonly TotalsTransaction[],
): TransactionTotals {
  const sum = (predicate: (transaction: TotalsTransaction) => boolean) =>
    transactions
      .filter(predicate)
      .reduce((total, transaction) => total + Number(transaction.value), 0);

  const income = sum((transaction) => transaction.type === "Receita");
  const directExpenses = sum((transaction) => transaction.type === "Despesa");
  const cashExpenses = sum(
    (transaction) =>
      transaction.type === "Despesa" && transaction.account?.type === "Conta",
  );
  const invoicePayments = sum(
    (transaction) => transaction.type === "Pagamento de Fatura",
  );

  return {
    income,
    directExpenses,
    cashExpenses,
    invoicePayments,
    cashFlowResult: income - cashExpenses - invoicePayments,
  };
}

/**
 * Agrupa pela moeda da conta de cada lançamento antes de somar, para que
 * valores de moedas diferentes nunca componham o mesmo total. A moeda
 * principal vem primeiro e sempre existe, mesmo sem lançamentos.
 */
export function summarizeTransactionTotalsByCurrency(
  transactions: readonly TotalsTransaction[],
): CurrencyTransactionTotals[] {
  const groups = new Map<string, TotalsTransaction[]>([[PRIMARY_CURRENCY, []]]);

  for (const transaction of transactions) {
    const currency = resolveAccountCurrency(transaction.account?.currency);
    const group = groups.get(currency) ?? [];
    group.push(transaction);
    groups.set(currency, group);
  }

  return [...groups.entries()]
    .map(([currency, items]) => ({
      currency,
      totals: calculateTransactionTotals(items),
    }))
    .sort((left, right) => {
      if (left.currency === PRIMARY_CURRENCY) return -1;
      if (right.currency === PRIMARY_CURRENCY) return 1;
      return left.currency.localeCompare(right.currency);
    });
}
