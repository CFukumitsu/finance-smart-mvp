export type BalanceTransaction = {
  account_id: string | null;
  destination_account_id?: string | null;
  category_id?: string | null;
  type: string;
  value: number;
  description?: string | null;
  status?: string | null;
  due_date?: string | null;
  account?: {
    name?: string | null;
    type?: string | null;
    limit_amount?: number | null;
  } | null;
  category?: {
    name?: string | null;
    monthly_limit?: number | null;
    monthly_goal?: number | null;
    show_on_dashboard?: boolean | null;
    dashboard_order?: number | null;
    active?: boolean | null;
  } | null;
};

export function isLegacyOpeningBalance(transaction: BalanceTransaction) {
  const description = String(transaction.description ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return description === "saldo anterior";
}

export function calculateAccountCredits(
  accountId: string,
  transactions: BalanceTransaction[]
) {
  return transactions
    .filter((transaction) => !isLegacyOpeningBalance(transaction))
    .reduce((sum, transaction) => {
      const value = Math.abs(Number(transaction.value));

      if (
        transaction.account_id === accountId &&
        transaction.type === "Receita"
      ) {
        return sum + value;
      }

      if (
        transaction.destination_account_id === accountId &&
        transaction.type === "Transferência"
      ) {
        return sum + value;
      }

      return sum;
    }, 0);
}

export function calculateAccountDebits(
  accountId: string,
  transactions: BalanceTransaction[]
) {
  return transactions
    .filter((transaction) => !isLegacyOpeningBalance(transaction))
    .reduce((sum, transaction) => {
      const value = Math.abs(Number(transaction.value));

      if (
        transaction.account_id === accountId &&
        (transaction.type === "Despesa" ||
          transaction.type === "Pagamento de Fatura")
      ) {
        return sum + value;
      }

      if (
        transaction.account_id === accountId &&
        transaction.type === "Transferência"
      ) {
        return sum + value;
      }

      return sum;
    }, 0);
}

export function calculateAccountFinalBalance(params: {
  accountId: string;
  openingBalance: number;
  transactions: BalanceTransaction[];
}) {
  const credits = calculateAccountCredits(params.accountId, params.transactions);
  const debits = calculateAccountDebits(params.accountId, params.transactions);

  return params.openingBalance + credits - debits;
}

export function filterTransactionsUntilDate(
  transactions: BalanceTransaction[],
  date: string
) {
  return transactions.filter((transaction) => {
    if (!transaction.due_date) return true;

    return transaction.due_date <= date;
  });
}

export function calculateAccountMovement(
  accountId: string,
  transactions: BalanceTransaction[]
) {
  return (
    calculateAccountCredits(accountId, transactions) -
    calculateAccountDebits(accountId, transactions)
  );
}

export function calculateCashFlowTotals(
  cashFlowTransactions: BalanceTransaction[],
  previousCardTransactions: BalanceTransaction[]
) {
  const income = cashFlowTransactions
    .filter((transaction) => transaction.type === "Receita")
    .reduce((sum, transaction) => sum + Number(transaction.value), 0);

  const accountExpenses = cashFlowTransactions
    .filter(
      (transaction) =>
        transaction.type === "Despesa" &&
        transaction.account?.type === "Conta"
    )
    .reduce((sum, transaction) => sum + Number(transaction.value), 0);

  const creditCardInvoices = previousCardTransactions.reduce(
    (sum, transaction) => {
      if (transaction.type === "Despesa") {
        return sum + Number(transaction.value);
      }

      if (transaction.type === "Receita") {
        return sum - Number(transaction.value);
      }

      return sum;
    },
    0
  );

  return {
    income,
    accountExpenses,
    creditCardInvoices,
    projectedBalance: income - accountExpenses - creditCardInvoices,
  };
}

export function calculateCardRealizedValue(
  transactions: BalanceTransaction[]
) {
  return transactions.reduce((sum, transaction) => {
    if (transaction.type === "Despesa") {
      return sum + Number(transaction.value);
    }

    if (transaction.type === "Receita") {
      return sum - Number(transaction.value);
    }

    return sum;
  }, 0);
}

export function calculateCategoryRealizedValue(
  transactions: BalanceTransaction[]
) {
  return transactions
    .filter((transaction) => transaction.type === "Despesa")
    .reduce((sum, transaction) => sum + Number(transaction.value), 0);
}

export function calculateComparisonPending(planned: number, realized: number) {
  return Number(planned) - Number(realized);
}