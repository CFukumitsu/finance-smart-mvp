export type BankrollMoneyParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

export function parseBankrollMoney(input: string): BankrollMoneyParseResult {
  const value = input.trim().replace(/\s/g, "");
  if (!value) return { ok: false, error: "Informe um valor." };
  if (value.startsWith("-")) return { ok: false, error: "O valor não pode ser negativo." };

  let normalized: string;
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(value) || /^\d+,\d{1,2}$/.test(value)) {
    normalized = value.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+(\.\d{1,2})?$/.test(value)) {
    normalized = value;
  } else {
    return { ok: false, error: "Use um valor como 1.234,56." };
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed)
    ? { ok: true, value: Math.round((parsed + Number.EPSILON) * 100) / 100 }
    : { ok: false, error: "Informe um valor monetário válido." };
}

export function requireBankrollMoney(input: string, label: string, emptyValue?: number) {
  if (!input.trim() && emptyValue !== undefined) return emptyValue;
  const parsed = parseBankrollMoney(input);
  if (!parsed.ok) throw new Error(`${label}: ${parsed.error}`);
  return parsed.value;
}
