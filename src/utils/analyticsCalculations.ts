import type {
  AnalyticsBreakdown,
  AnalyticsCompetence,
  AnalyticsFilters,
  AnalyticsTransaction,
  MonthlyAnalytics,
} from "@/src/types/analytics";

function toValue(transaction: AnalyticsTransaction) {
  return Math.abs(Number(transaction.value ?? 0));
}

export function isAnalyticalIncome(transaction: AnalyticsTransaction) {
  return transaction.type === "Receita";
}

export function isAnalyticalExpense(transaction: AnalyticsTransaction) {
  return transaction.type === "Despesa";
}

function getCashMovement(
  transaction: AnalyticsTransaction,
  accountId: string,
  includePending: boolean
) {
  const value = toValue(transaction);
  const isCashAccount = transaction.account?.type !== "Cartão";

  if (transaction.type === "Transferência") {
    if (!accountId) return { cashIn: 0, cashOut: 0 };

    const originAccountId = transaction.origin_account_id;
    const destinationAccountId = transaction.destination_account_id;
    const isPendingIncluded = includePending && transaction.status === "Pendente";

    if (
      !originAccountId ||
      !destinationAccountId ||
      originAccountId === destinationAccountId ||
      transaction.account_id !== accountId
    ) {
      return { cashIn: 0, cashOut: 0 };
    }

    if (
      accountId === originAccountId &&
      (transaction.status === "Pago" || isPendingIncluded)
    ) {
      return { cashIn: 0, cashOut: value };
    }

    if (
      accountId === destinationAccountId &&
      (transaction.status === "Recebido" || isPendingIncluded)
    ) {
      return { cashIn: value, cashOut: 0 };
    }

    return { cashIn: 0, cashOut: 0 };
  }

  const isPendingIncluded = includePending && transaction.status === "Pendente";

  if (
    transaction.type === "Receita" &&
    isCashAccount &&
    (transaction.status === "Recebido" || isPendingIncluded)
  ) {
    return { cashIn: value, cashOut: 0 };
  }

  if (
    isCashAccount &&
    (transaction.type === "Despesa" ||
      transaction.type === "Pagamento de Fatura") &&
    (transaction.status === "Pago" || isPendingIncluded)
  ) {
    return { cashIn: 0, cashOut: value };
  }

  return { cashIn: 0, cashOut: 0 };
}

export function buildMonthlyAnalytics(params: {
  competences: AnalyticsCompetence[];
  transactions: AnalyticsTransaction[];
  filters: AnalyticsFilters;
  openingBalance: number;
  includePendingCashFlow?: boolean;
}): MonthlyAnalytics[] {
  let cumulativeBalance = 0;
  let cumulativeCashBalance = params.openingBalance;

  return params.competences.map((competence) => {
    const monthTransactions = params.transactions.filter(
      (transaction) => transaction.competence_id === competence.id
    );
    const income = monthTransactions
      .filter(isAnalyticalIncome)
      .reduce((sum, transaction) => sum + toValue(transaction), 0);
    const expenses = monthTransactions
      .filter(isAnalyticalExpense)
      .reduce((sum, transaction) => sum + toValue(transaction), 0);
    const balance = income - expenses;
    cumulativeBalance += balance;

    const cash = monthTransactions.reduce(
      (result, transaction) => {
        const movement = getCashMovement(
          transaction,
          params.filters.accountId,
          params.includePendingCashFlow ?? false
        );
        result.cashIn += movement.cashIn;
        result.cashOut += movement.cashOut;
        return result;
      },
      { cashIn: 0, cashOut: 0 }
    );
    const cashBalance = cash.cashIn - cash.cashOut;
    cumulativeCashBalance += cashBalance;

    return {
      competenceId: competence.id,
      competenceName: competence.name,
      monthLabel: new Intl.DateTimeFormat("pt-BR", {
        month: "short",
        year: "2-digit",
      })
        .format(new Date(competence.year, competence.month - 1, 1))
        .replace(".", ""),
      income,
      expenses,
      balance,
      cumulativeBalance,
      cashIn: cash.cashIn,
      cashOut: cash.cashOut,
      cashBalance,
      cumulativeCashBalance,
    };
  });
}

export function buildBreakdown(
  transactions: AnalyticsTransaction[],
  type: "Receita" | "Despesa",
  dimension: "category" | "account" | "card"
): AnalyticsBreakdown[] {
  const grouped = new Map<string, AnalyticsBreakdown>();

  transactions
    .filter((transaction) => transaction.type === type)
    .filter((transaction) =>
      dimension === "card" ? transaction.account?.type === "Cartão" : true
    )
    .forEach((transaction) => {
      const id =
        dimension === "category"
          ? transaction.category_id ?? "uncategorized"
          : transaction.account_id ?? "unassigned";
      const name =
        dimension === "category"
          ? transaction.category?.name ?? "Sem categoria"
          : transaction.account?.name ?? "Sem conta";
      const current = grouped.get(id) ?? { id, name, value: 0, count: 0 };
      current.value += toValue(transaction);
      current.count += 1;
      grouped.set(id, current);
    });

  return [...grouped.values()].sort((left, right) => right.value - left.value);
}

export function summarizeMonthlyValues(
  monthly: MonthlyAnalytics[],
  key: "income" | "expenses"
) {
  const total = monthly.reduce((sum, item) => sum + item[key], 0);
  const ordered = [...monthly].sort((left, right) => right[key] - left[key]);

  return {
    total,
    average: monthly.length > 0 ? total / monthly.length : 0,
    highest: ordered[0] ?? null,
    lowest: ordered.at(-1) ?? null,
  };
}
