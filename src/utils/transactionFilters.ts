export type LatestTransactionSortable = {
  id: string;
  due_date: string;
  created_at: string | null;
};

export function sortLatestTransactionsForDisplay<
  T extends LatestTransactionSortable,
>(transactions: readonly T[]): T[] {
  return [...transactions].sort((a, b) => {
    const dueDateDifference = b.due_date.localeCompare(a.due_date);

    if (dueDateDifference !== 0) {
      return dueDateDifference;
    }

    const createdAtDifference = (b.created_at ?? "").localeCompare(
      a.created_at ?? "",
    );

    if (createdAtDifference !== 0) {
      return createdAtDifference;
    }

    return b.id.localeCompare(a.id);
  });
}
