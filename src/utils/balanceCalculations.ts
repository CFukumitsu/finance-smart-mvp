export type BalanceTransaction = {
  account_id: string;
  destination_account_id?: string | null;
  type: string;
  value: number;
  description?: string | null;
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

      if (transaction.account_id === accountId && transaction.type === "Receita") {
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
    const dueDate = (transaction as BalanceTransaction & { due_date?: string })
      .due_date;

    if (!dueDate) return true;

    return dueDate <= date;
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