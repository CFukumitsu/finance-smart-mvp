import type {
  AnalyticsCategory,
  AnalyticsFinancialTarget,
  AnalyticsTransaction,
} from "../types/analytics";

export type AnalyticsDateRange = {
  startDate: string;
  endDate: string;
};

export type BudgetStatus = "Normal" | "Atenção" | "Risco" | "Estourado";

export type CategoryBudgetInsight = {
  categoryId: string;
  categoryName: string;
  realized: number;
  planned: number;
  percentage: number;
  remaining: number;
  projected: number | null;
  dailyAvailable: number | null;
  remainingDays: number;
  probableOverrunDate: string | null;
  status: BudgetStatus;
};

export type ExpenseIncreaseDriver = {
  categoryId: string;
  categoryName: string;
  current: number;
  previous: number;
  difference: number;
  percentageChange: number | null;
};

const DAY_MS = 86_400_000;

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function monthStart(value: string) {
  const date = parseDate(value);
  return formatDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

function monthEnd(value: string) {
  const date = parseDate(value);
  return formatDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

export function normalizeAnalyticsDateRange(
  startDate: string,
  endDate: string
): AnalyticsDateRange {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new RangeError("Informe uma data inicial e uma data final válidas.");
  }
  if (startDate > endDate) {
    throw new RangeError("A data inicial não pode ser posterior à data final.");
  }
  return { startDate, endDate };
}

export function countInclusiveDays(range: AnalyticsDateRange) {
  return Math.floor((parseDate(range.endDate).getTime() - parseDate(range.startDate).getTime()) / DAY_MS) + 1;
}

export function getComparisonDateRange(range: AnalyticsDateRange): AnalyticsDateRange {
  const isFullMonth = range.startDate === monthStart(range.startDate) && range.endDate === monthEnd(range.startDate);
  if (isFullMonth) {
    const previousMonthLastDay = addDays(range.startDate, -1);
    return { startDate: monthStart(previousMonthLastDay), endDate: previousMonthLastDay };
  }

  const endDate = addDays(range.startDate, -1);
  return { startDate: addDays(endDate, -(countInclusiveDays(range) - 1)), endDate };
}

export function getAnalyticsQuickRange(
  shortcut: "current-month" | "last-7" | "last-30" | "previous-month" | "current-year",
  today = formatDate(new Date())
): AnalyticsDateRange {
  if (shortcut === "current-month") return { startDate: monthStart(today), endDate: today };
  if (shortcut === "last-7") return { startDate: addDays(today, -6), endDate: today };
  if (shortcut === "last-30") return { startDate: addDays(today, -29), endDate: today };
  if (shortcut === "current-year") return { startDate: `${today.slice(0, 4)}-01-01`, endDate: today };
  const previousMonthLastDay = addDays(monthStart(today), -1);
  return { startDate: monthStart(previousMonthLastDay), endDate: previousMonthLastDay };
}

export function isDateInRange(value: string, range: AnalyticsDateRange) {
  return value >= range.startDate && value <= range.endDate;
}

export function filterTransactionsByDate(
  transactions: AnalyticsTransaction[],
  range: AnalyticsDateRange
) {
  return transactions.filter((transaction) => isDateInRange(transaction.due_date, range));
}

export function calculateDailyExpensePace(expenses: number, days: number) {
  return days > 0 ? expenses / days : 0;
}

export function calculatePercentageChange(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function getElapsedRangeDays(range: AnalyticsDateRange, today: string) {
  if (today < range.startDate) return 0;
  return countInclusiveDays({
    startDate: range.startDate,
    endDate: today < range.endDate ? today : range.endDate,
  });
}

export function calculateMonthlyProjection(
  expenses: number,
  range: AnalyticsDateRange,
  today: string
) {
  if (monthStart(range.startDate) !== monthStart(range.endDate) || monthStart(today) !== monthStart(range.startDate)) {
    return null;
  }
  const elapsedDays = getElapsedRangeDays(range, today);
  if (elapsedDays === 0) return null;
  return (expenses / elapsedDays) * countInclusiveDays({ startDate: monthStart(today), endDate: monthEnd(today) });
}

export function calculateBudgetPercentage(realized: number, planned: number) {
  return planned > 0 ? (realized / planned) * 100 : null;
}

export function calculateDailyAvailableLimit(
  planned: number,
  realized: number,
  remainingDays: number
) {
  if (planned <= 0) return null;
  if (realized >= planned) return 0;
  return remainingDays > 0 ? Math.max(0, (planned - realized) / remainingDays) : 0;
}

export function calculateProbableOverrunDate(params: {
  planned: number;
  realized: number;
  dailyPace: number;
  today: string;
  competenceEnd: string;
}) {
  const { planned, realized, dailyPace, today, competenceEnd } = params;
  if (planned <= 0 || dailyPace <= 0 || realized >= planned) return null;
  const daysUntilOverrun = Math.floor((planned - realized) / dailyPace) + 1;
  const date = addDays(today, daysUntilOverrun);
  return date <= competenceEnd ? date : null;
}

export function classifyBudgetStatus(params: {
  percentage: number;
  monthProgress: number;
  projected: number | null;
  planned: number;
}): BudgetStatus {
  if (params.percentage > 100) return "Estourado";
  if (params.projected !== null && params.projected > params.planned) return "Risco";
  if (params.percentage >= 75 && params.monthProgress < 75) return "Atenção";
  return "Normal";
}

function sumExpensesByCategory(transactions: AnalyticsTransaction[]) {
  const totals = new Map<string, number>();
  // Mantém a mesma definição pública de analyticsCalculations: somente o tipo
  // Despesa compõe os indicadores analíticos e preditivos.
  transactions.filter((transaction) => transaction.type === "Despesa").forEach((transaction) => {
    if (!transaction.category_id) return;
    totals.set(transaction.category_id, (totals.get(transaction.category_id) ?? 0) + Math.abs(Number(transaction.value ?? 0)));
  });
  return totals;
}

export function buildCategoryBudgetInsights(params: {
  transactions: AnalyticsTransaction[];
  targets: AnalyticsFinancialTarget[];
  categories: AnalyticsCategory[];
  range: AnalyticsDateRange;
  today: string;
}): CategoryBudgetInsight[] {
  const { transactions, targets, categories, range, today } = params;
  if (monthStart(range.startDate) !== monthStart(range.endDate)) return [];

  const totals = sumExpensesByCategory(transactions);
  const elapsedDays = getElapsedRangeDays(range, today);
  const competenceEnd = monthEnd(range.endDate);
  const currentCompetence = monthStart(today) === monthStart(range.endDate);
  const remainingDays = currentCompetence && today <= competenceEnd
    ? Math.max(0, countInclusiveDays({ startDate: addDays(today, 1), endDate: competenceEnd }))
    : 0;
  const totalMonthDays = countInclusiveDays({ startDate: monthStart(range.endDate), endDate: competenceEnd });
  const monthElapsedDays = currentCompetence ? Math.min(totalMonthDays, parseDate(today).getUTCDate()) : totalMonthDays;
  const monthProgress = (monthElapsedDays / totalMonthDays) * 100;

  return targets
    .filter((target) => Number(target.planned_value) > 0)
    .map((target) => {
      const realized = totals.get(target.target_id) ?? 0;
      const planned = Number(target.planned_value);
      const percentage = calculateBudgetPercentage(realized, planned) ?? 0;
      const projected = currentCompetence ? calculateMonthlyProjection(realized, range, today) : null;
      const dailyPace = calculateDailyExpensePace(realized, elapsedDays);
      const status = classifyBudgetStatus({ percentage, monthProgress, projected, planned });
      return {
        categoryId: target.target_id,
        categoryName: categories.find((category) => category.id === target.target_id)?.name ?? "Categoria removida",
        realized,
        planned,
        percentage,
        remaining: Math.max(0, planned - realized),
        projected,
        dailyAvailable: currentCompetence ? calculateDailyAvailableLimit(planned, realized, remainingDays) : null,
        remainingDays,
        probableOverrunDate: projected !== null && projected > planned
          ? calculateProbableOverrunDate({ planned, realized, dailyPace, today, competenceEnd })
          : null,
        status,
      };
    })
    .sort((left, right) => {
      const severity: Record<BudgetStatus, number> = { Estourado: 3, Risco: 2, Atenção: 1, Normal: 0 };
      return severity[right.status] - severity[left.status] || right.percentage - left.percentage;
    });
}

export function findExpenseIncreaseDrivers(params: {
  currentTransactions: AnalyticsTransaction[];
  previousTransactions: AnalyticsTransaction[];
  categories: AnalyticsCategory[];
  limit?: number;
}): ExpenseIncreaseDriver[] {
  const current = sumExpensesByCategory(params.currentTransactions);
  const previous = sumExpensesByCategory(params.previousTransactions);
  const categoryIds = new Set([...current.keys(), ...previous.keys()]);

  return [...categoryIds]
    .map((categoryId) => {
      const currentValue = current.get(categoryId) ?? 0;
      const previousValue = previous.get(categoryId) ?? 0;
      return {
        categoryId,
        categoryName: params.categories.find((category) => category.id === categoryId)?.name ?? "Sem categoria",
        current: currentValue,
        previous: previousValue,
        difference: currentValue - previousValue,
        percentageChange: calculatePercentageChange(currentValue, previousValue),
      };
    })
    .filter((item) => item.difference > 0)
    .sort((left, right) => right.difference - left.difference)
    .slice(0, params.limit ?? 3);
}
