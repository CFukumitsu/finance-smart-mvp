export type LatestTransactionSortable = {
  id: string;
  due_date: string;
  created_at: string | null;
};

export type CashDirectionSortable = {
  due_date: string;
  type: string;
  account_id?: string | null;
  destination_account_id?: string | null;
  bankroll_operation_type?: "deposit" | "withdrawal" | null;
  investment_event_type?: "application" | "redemption" | null;
};

function isIncomingCash(
  transaction: CashDirectionSortable,
  accountId: string,
) {
  if (transaction.type === "Receita") return true;
  if (transaction.type !== "Transferência") return false;

  if (
    transaction.investment_event_type === "redemption" ||
    transaction.bankroll_operation_type === "withdrawal"
  ) {
    return !accountId || transaction.account_id === accountId;
  }

  return Boolean(
    accountId && transaction.destination_account_id === accountId,
  );
}

export function sortTransactionsByCashDirection<
  T extends CashDirectionSortable,
>(transactions: readonly T[], accountId = ""): T[] {
  return [...transactions].sort((a, b) => {
    const directionDifference =
      Number(!isIncomingCash(a, accountId)) -
      Number(!isIncomingCash(b, accountId));

    if (directionDifference !== 0) return directionDifference;

    return (
      new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    );
  });
}

export function sortLatestTransactionsForDisplay<
  T extends LatestTransactionSortable,
>(transactions: readonly T[]): T[] {
  return [...transactions].sort((a, b) => {
    const createdAtDifference = (b.created_at ?? "").localeCompare(
      a.created_at ?? "",
    );

    if (createdAtDifference !== 0) {
      return createdAtDifference;
    }

    return b.id.localeCompare(a.id);
  });
}
