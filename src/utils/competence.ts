export function toCompetenceKey(reference: string | Date) {
  if (reference instanceof Date) {
    if (Number.isNaN(reference.getTime())) {
      throw new Error("Data de competência inválida.");
    }

    return `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}`;
  }

  const normalized = reference.trim().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalized)) {
    throw new Error("Competência inválida. Use o formato AAAA-MM.");
  }

  return normalized;
}

export function addMonthsToCompetence(reference: string | Date, amount: number) {
  const key = toCompetenceKey(reference);
  const [year, month] = key.split("-").map(Number);
  const result = new Date(year, month - 1 + amount, 1);
  return toCompetenceKey(result);
}

export function countCompetenceMonths(startReference: string, endReference: string) {
  const [startYear, startMonth] = toCompetenceKey(startReference).split("-").map(Number);
  const [endYear, endMonth] = toCompetenceKey(endReference).split("-").map(Number);
  return (endYear - startYear) * 12 + endMonth - startMonth + 1;
}

