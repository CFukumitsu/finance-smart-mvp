export type CandidateTransaction = {
  id: string;
  description: string;
  due_date: string;
  value: number;
  type?: string;
  status?: string;
};

export type CandidateLinkedItem = {
  id?: string;
  value: number;
  matchedTransactionId?: string;
};

export type CandidateBadge = "Correspondência exata" | "Valor semelhante" | "Parcial";

type CandidateMetrics = {
  originalValue: number;
  alreadyReconciled: number;
  availableBalance: number;
  signedAvailableBalance: number;
  daysDifference: number;
  valueDifference: number;
  descriptionSimilarity: number;
  isExactValue: boolean;
  isPartial: boolean;
  badges: CandidateBadge[];
};

export type RankedReconciliationCandidate<T extends CandidateTransaction> = Omit<T, keyof CandidateMetrics> & CandidateMetrics;

export function moneyToCents(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100);
}

export function centsToMoney(value: number) {
  return value / 100;
}

export function calculateAdjustedTransactionValue(alreadyReconciled: number, statementValue: number) {
  return centsToMoney(Math.abs(moneyToCents(alreadyReconciled)) + Math.abs(moneyToCents(statementValue)));
}

export function signedTransactionCents(transaction: CandidateTransaction) {
  const value = Math.abs(moneyToCents(Number(transaction.value ?? 0)));
  return transaction.type === "Receita" ? -value : value;
}

function daysDifference(left: string, right: string) {
  const leftDate = new Date(`${left}T00:00:00Z`).getTime();
  const rightDate = new Date(`${right}T00:00:00Z`).getTime();
  return Math.abs(Math.round((leftDate - rightDate) / 86_400_000));
}

function normalizedWords(value: string) {
  return new Set(
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((word) => word.length > 1)
  );
}

export function descriptionSimilarity(left: string, right: string) {
  const leftWords = normalizedWords(left);
  const rightWords = normalizedWords(right);
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  const common = [...leftWords].filter((word) => rightWords.has(word)).length;
  return (2 * common) / (leftWords.size + rightWords.size);
}

export function buildReconciliationCandidates<T extends CandidateTransaction>(params: {
  statementItem: { id?: string; date: string; description: string; value: number };
  transactions: T[];
  linkedItems: CandidateLinkedItem[];
}) {
  const itemCents = moneyToCents(params.statementItem.value);
  if (itemCents === 0) return [] as RankedReconciliationCandidate<T>[];

  return params.transactions
    .filter((transaction) => transaction.type !== "Pagamento de Fatura" && transaction.type !== "Transferência")
    .map((transaction): RankedReconciliationCandidate<T> | null => {
      const originalCents = signedTransactionCents(transaction);
      const reconciledCents = params.linkedItems
        .filter((item) => item.matchedTransactionId === transaction.id && item.id !== params.statementItem.id)
        .reduce((sum, item) => sum + moneyToCents(item.value), 0);
      const availableMagnitudeCents = Math.max(0, Math.abs(originalCents) - Math.abs(reconciledCents));
      const signedAvailableCents = Math.sign(originalCents) * availableMagnitudeCents;

      if (availableMagnitudeCents <= 0 || Math.sign(signedAvailableCents) !== Math.sign(itemCents)) return null;

      const valueDifferenceCents = Math.abs(Math.abs(signedAvailableCents) - Math.abs(itemCents));
      const exact = valueDifferenceCents === 0;
      const partial = Math.abs(reconciledCents) > 0;
      const similarThreshold = Math.max(100, Math.round(Math.abs(itemCents) * 0.05));
      const badges: CandidateBadge[] = [];
      if (exact) badges.push("Correspondência exata");
      else if (valueDifferenceCents <= similarThreshold) badges.push("Valor semelhante");
      if (partial) badges.push("Parcial");

      return {
        ...transaction,
        originalValue: centsToMoney(Math.abs(originalCents)),
        alreadyReconciled: centsToMoney(Math.abs(reconciledCents)),
        availableBalance: centsToMoney(availableMagnitudeCents),
        signedAvailableBalance: centsToMoney(signedAvailableCents),
        daysDifference: daysDifference(params.statementItem.date, transaction.due_date),
        valueDifference: centsToMoney(valueDifferenceCents),
        descriptionSimilarity: descriptionSimilarity(params.statementItem.description, transaction.description),
        isExactValue: exact,
        isPartial: partial,
        badges,
      };
    })
    .filter((candidate): candidate is RankedReconciliationCandidate<T> => candidate !== null)
    .sort((left, right) => {
      if (left.isExactValue !== right.isExactValue) return left.isExactValue ? -1 : 1;
      if (left.valueDifference !== right.valueDifference) return left.valueDifference - right.valueDifference;
      if (left.daysDifference !== right.daysDifference) return left.daysDifference - right.daysDifference;
      if (left.descriptionSimilarity !== right.descriptionSimilarity) return right.descriptionSimilarity - left.descriptionSimilarity;
      if (left.due_date !== right.due_date) return right.due_date.localeCompare(left.due_date);
      return left.id.localeCompare(right.id);
    });
}
