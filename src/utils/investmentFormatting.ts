export function formatInvestmentMoneyInput(value: number) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

export function parseInvestmentMoney(value: string) {
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return Number.NaN;

  if (normalized.includes(",")) {
    return Number(normalized.replace(/\./g, "").replace(",", "."));
  }

  const usesPtBrThousands = /^\d{1,3}(\.\d{3})+$/.test(normalized);
  return Number(usesPtBrThousands ? normalized.replace(/\./g, "") : normalized);
}
