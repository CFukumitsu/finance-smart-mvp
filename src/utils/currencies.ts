// Moedas oferecidas no cadastro de contas. accounts.currency continua sendo
// texto ISO 4217 de três letras; códigos históricos fora desta lista seguem
// válidos para exibição e cálculo.
export const SUPPORTED_CURRENCIES = [
  { code: "BRL", label: "Real" },
  { code: "USD", label: "Dólar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "Libra Esterlina" },
] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

// Moeda dos agregados principais (Dashboard, fechamento de competência,
// metas e totais gerais). Não há conversão cambial nesta fase.
export const PRIMARY_CURRENCY: SupportedCurrencyCode = "BRL";

export const CURRENCY_MISMATCH_TRANSFER_MESSAGE =
  "Transferências entre moedas diferentes ainda não estão disponíveis. Utilize contas da mesma moeda.";

export const UNCONFIRMED_CURRENCY_TRANSFER_MESSAGE =
  "Confirme a moeda da conta em Contas/Cartões antes de realizar a transferência.";

export const CURRENCY_MISMATCH_CARD_PAYMENT_MESSAGE =
  "Pagamentos de fatura entre moedas diferentes ainda não estão disponíveis. Utilize uma conta de pagamento na mesma moeda do cartão.";

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
const LOCALE = "pt-BR";

/** Código ISO normalizado ou null quando ausente/inválido (mesma regra do banco). */
export function normalizeCurrencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return CURRENCY_CODE_PATTERN.test(code) ? code : null;
}

export function isSupportedCurrency(value: unknown): value is SupportedCurrencyCode {
  const code = normalizeCurrencyCode(value);
  return SUPPORTED_CURRENCIES.some((currency) => currency.code === code);
}

export function getCurrencyLabel(value: unknown) {
  const code = normalizeCurrencyCode(value);
  const currency = SUPPORTED_CURRENCIES.find((item) => item.code === code);
  if (currency) return `${currency.code} — ${currency.label}`;
  return code ?? "Moeda não confirmada";
}

/**
 * Moeda usada para exibir e agrupar valores de uma conta. Contas legadas sem
 * moeda confirmada (NULL) foram criadas antes do suporte multimoeda e
 * permanecem tratadas como BRL, preservando o comportamento anterior.
 */
export function resolveAccountCurrency(value: unknown): string {
  return normalizeCurrencyCode(value) ?? PRIMARY_CURRENCY;
}

export function isPrimaryCurrency(value: unknown) {
  return resolveAccountCurrency(value) === PRIMARY_CURRENCY;
}

const formatters = new Map<string, Intl.NumberFormat | null>();

function getFormatter(code: string) {
  if (!formatters.has(code)) {
    try {
      formatters.set(
        code,
        new Intl.NumberFormat(LOCALE, { style: "currency", currency: code }),
      );
    } catch {
      formatters.set(code, null);
    }
  }
  return formatters.get(code) ?? null;
}

export function formatMoney(value: number, currency?: string | null) {
  const code = resolveAccountCurrency(currency);
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const formatter = getFormatter(code);
  if (formatter) return formatter.format(safeAmount);

  return `${code} ${safeAmount.toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Valor numérico de um campo mascarado em centavos ("€ 50,00" → 50). */
export function parseMoneyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}

/** Máscara de digitação em centavos na moeda informada; vazio permanece vazio. */
export function formatMoneyInput(value: string, currency?: string | null) {
  if (!value.replace(/\D/g, "")) return "";
  return formatMoney(parseMoneyInput(value), currency);
}

export function getMoneyInputPlaceholder(currency?: string | null) {
  return formatMoney(0, currency);
}

export type CurrencyTotal = { currency: string; total: number };

/** Soma separada por moeda, com a moeda principal primeiro e as demais em ordem alfabética. */
export function sumByCurrency<T>(
  items: readonly T[],
  getCurrency: (item: T) => unknown,
  getValue: (item: T) => number,
): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const currency = resolveAccountCurrency(getCurrency(item));
    totals.set(currency, (totals.get(currency) ?? 0) + Number(getValue(item) ?? 0));
  }

  return [...totals.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((left, right) => {
      if (left.currency === PRIMARY_CURRENCY) return -1;
      if (right.currency === PRIMARY_CURRENCY) return 1;
      return left.currency.localeCompare(right.currency);
    });
}

/** Moedas presentes nos itens, com a moeda principal primeiro. */
export function listCurrencies<T>(
  items: readonly T[],
  getCurrency: (item: T) => unknown,
): string[] {
  return sumByCurrency(items, getCurrency, () => 0).map((item) => item.currency);
}

export function filterByCurrency<T>(
  items: readonly T[],
  currency: string,
  getCurrency: (item: T) => unknown,
): T[] {
  const target = resolveAccountCurrency(currency);
  return items.filter((item) => resolveAccountCurrency(getCurrency(item)) === target);
}

/** Separa itens da moeda principal dos itens em outras moedas. */
export function partitionByPrimaryCurrency<T>(
  items: readonly T[],
  getCurrency: (item: T) => unknown,
): { primary: T[]; others: T[] } {
  const primary: T[] = [];
  const others: T[] = [];
  for (const item of items) {
    (isPrimaryCurrency(getCurrency(item)) ? primary : others).push(item);
  }
  return { primary, others };
}

export type TransferCurrencyCheck =
  | { allowed: true }
  | { allowed: false; message: string };

/**
 * Regra temporária até existir conversão cambial: as duas pontas precisam ter
 * a mesma moeda confirmada. Duas contas legadas sem moeda (NULL) mantêm o
 * comportamento anterior; misturar conta sem moeda com conta confirmada exige
 * confirmação, sem inferir BRL silenciosamente.
 */
export function checkTransferCurrencies(
  originCurrency: unknown,
  destinationCurrency: unknown,
): TransferCurrencyCheck {
  const origin = normalizeCurrencyCode(originCurrency);
  const destination = normalizeCurrencyCode(destinationCurrency);

  if (origin === null && destination === null) return { allowed: true };
  if (origin === null || destination === null) {
    return { allowed: false, message: UNCONFIRMED_CURRENCY_TRANSFER_MESSAGE };
  }
  if (origin !== destination) {
    return { allowed: false, message: CURRENCY_MISMATCH_TRANSFER_MESSAGE };
  }
  return { allowed: true };
}

/**
 * O pagamento de fatura grava o total do cartão na conta pagadora sem
 * conversão. Bloqueia apenas moedas confirmadas e diferentes; cartões e contas
 * legados sem moeda mantêm o fluxo anterior para não interromper pagamentos.
 */
export function checkCardPaymentCurrencies(
  cardCurrency: unknown,
  paymentAccountCurrency: unknown,
): TransferCurrencyCheck {
  const card = normalizeCurrencyCode(cardCurrency);
  const payment = normalizeCurrencyCode(paymentAccountCurrency);

  if (card !== null && payment !== null && card !== payment) {
    return { allowed: false, message: CURRENCY_MISMATCH_CARD_PAYMENT_MESSAGE };
  }
  return { allowed: true };
}
