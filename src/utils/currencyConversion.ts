// Transferências entre moedas diferentes (Fase 2). A saída guarda o total
// debitado na moeda da origem e a entrada o total recebido na moeda do
// destino; a taxa é informativa (já incluída nos valores) e a cotação
// informada pelo provedor é só um metadado. O custo efetivo é sempre derivado.
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { formatMoney, normalizeCurrencyCode, parseMoneyInput, UNCONFIRMED_CURRENCY_TRANSFER_MESSAGE } from "./currencies.ts";

export const CONVERSION_FEE_HINT =
  "A taxa é informativa e já está incluída nos valores da conversão.";

export type TransferCurrencyMode =
  | { mode: "same" }
  | { mode: "conversion"; originCurrency: string; destinationCurrency: string }
  | { mode: "blocked"; message: string };

/**
 * Mesma moeda (ou duas contas legadas sem moeda): transferência comum.
 * Moedas confirmadas diferentes: conversão. Conta sem moeda + conta com
 * moeda continua bloqueada, como na Fase 0.
 */
export function getTransferCurrencyMode(
  originCurrency: unknown,
  destinationCurrency: unknown,
): TransferCurrencyMode {
  const origin = normalizeCurrencyCode(originCurrency);
  const destination = normalizeCurrencyCode(destinationCurrency);

  if (origin === null && destination === null) return { mode: "same" };
  if (origin === null || destination === null) {
    return { mode: "blocked", message: UNCONFIRMED_CURRENCY_TRANSFER_MESSAGE };
  }
  if (origin === destination) return { mode: "same" };
  return { mode: "conversion", originCurrency: origin, destinationCurrency: destination };
}

/** Custo real: unidades da moeda de origem por 1 unidade da moeda de destino. */
export function calculateEffectiveRate(sourceAmount: number, destinationAmount: number) {
  if (!(sourceAmount > 0) || !(destinationAmount > 0)) return null;
  return sourceAmount / destinationAmount;
}

/**
 * Cotação informada convertida para a direção do custo efetivo (origem por 1
 * destino). Uma cotação "€ por R$" é invertida; nada é gravado assim.
 */
export function normalizeQuotedRate(params: {
  quotedRate: number;
  baseCurrency: string;
  quoteCurrency: string;
  originCurrency: string;
  destinationCurrency: string;
}) {
  if (!(params.quotedRate > 0)) return null;
  if (params.baseCurrency === params.destinationCurrency && params.quoteCurrency === params.originCurrency) {
    return params.quotedRate;
  }
  if (params.baseCurrency === params.originCurrency && params.quoteCurrency === params.destinationCurrency) {
    return 1 / params.quotedRate;
  }
  return null;
}

/** Quanto o custo efetivo ficou acima (+) ou abaixo (-) da cotação informada. */
export function calculateQuotedRateDifference(effectiveRate: number, normalizedQuotedRate: number) {
  if (!(effectiveRate > 0) || !(normalizedQuotedRate > 0)) return null;
  return effectiveRate / normalizedQuotedRate - 1;
}

/**
 * Custo efetivo médio de várias conversões do mesmo par/direção:
 * SUM(debitado) / SUM(recebido). Não é a média simples das taxas.
 */
export function calculateWeightedEffectiveRate(
  conversions: readonly { sourceAmount: number; destinationAmount: number }[],
) {
  const totals = conversions.reduce(
    (sum, item) => ({
      source: sum.source + Number(item.sourceAmount),
      destination: sum.destination + Number(item.destinationAmount),
    }),
    { source: 0, destination: 0 },
  );
  return calculateEffectiveRate(totals.source, totals.destination);
}

export function getCurrencySymbol(currency: string) {
  try {
    return (
      new Intl.NumberFormat("pt-BR", { style: "currency", currency })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}

/** "R$ 6,2063 por EUR": valor na moeda quote por 1 unidade da base. */
export function formatRate(rate: number, quoteCurrency: string, baseCurrency: string) {
  let amount: string;
  try {
    amount = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: quoteCurrency,
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(rate);
  } catch {
    amount = `${quoteCurrency} ${rate.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  }
  return `${amount} por ${baseCurrency}`;
}

export function formatSignedPercent(value: number) {
  const formatted = (Math.abs(value) * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? "-" : "+"}${formatted}%`;
}

/** Aceita "6,05", "6.05" e "1.234,5678"; vazio ou inválido -> null. */
export function parseRateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export type ConversionFormValues = {
  destinationValue: string;
  providerId: string;
  feeAmount: string;
  feeCurrency: string;
  quotedRate: string;
  /** "destination": origem por 1 destino (R$ por €); "origin": o inverso. */
  quotedRateBase: "destination" | "origin";
};

export type TransferConversionInput = {
  destinationAmount: number;
  providerId: string;
  feeAmount: number | null;
  feeCurrency: string | null;
  quotedRate: number | null;
  quotedRateBaseCurrency: string | null;
  quotedRateQuoteCurrency: string | null;
};

/**
 * Converte o formulário em dados da RPC. Obrigatórios: valor recebido e
 * provedor. Taxa vazia = desconhecida (NULL); "0,00" = sem taxa. Cotação
 * vazia = não informada.
 */
export function buildConversionInput(
  values: ConversionFormValues,
  currencies: { originCurrency: string; destinationCurrency: string },
): { ok: true; conversion: TransferConversionInput } | { ok: false; message: string } {
  const destinationAmount = parseMoneyInput(values.destinationValue);
  if (!(destinationAmount > 0)) {
    return { ok: false, message: "Informe o valor recebido na conta de destino." };
  }
  if (!values.providerId) {
    return { ok: false, message: "Selecione o provedor da conversão." };
  }

  let feeAmount: number | null = null;
  let feeCurrency: string | null = null;
  if (values.feeAmount.replace(/\D/g, "")) {
    feeAmount = parseMoneyInput(values.feeAmount);
    feeCurrency = values.feeCurrency || currencies.originCurrency;
    if (feeCurrency !== currencies.originCurrency && feeCurrency !== currencies.destinationCurrency) {
      return { ok: false, message: "A moeda da taxa deve ser a moeda de origem ou a de destino." };
    }
  }

  let quotedRate: number | null = null;
  let quotedRateBaseCurrency: string | null = null;
  let quotedRateQuoteCurrency: string | null = null;
  if (values.quotedRate.trim()) {
    quotedRate = parseRateInput(values.quotedRate);
    if (quotedRate === null || quotedRate <= 0) {
      return { ok: false, message: "Informe uma cotação válida, maior que zero, ou deixe-a vazia." };
    }
    const baseIsDestination = values.quotedRateBase === "destination";
    quotedRateBaseCurrency = baseIsDestination ? currencies.destinationCurrency : currencies.originCurrency;
    quotedRateQuoteCurrency = baseIsDestination ? currencies.originCurrency : currencies.destinationCurrency;
  }

  return {
    ok: true,
    conversion: {
      destinationAmount,
      providerId: values.providerId,
      feeAmount,
      feeCurrency,
      quotedRate,
      quotedRateBaseCurrency,
      quotedRateQuoteCurrency,
    },
  };
}

/** "R$ 6,1483/€": forma compacta para o resumo do formulário. */
export function formatCompactRate(rate: number, quoteCurrency: string, baseCurrency: string) {
  return formatRate(rate, quoteCurrency, baseCurrency).replace(
    / por .+$/,
    `/${getCurrencySymbol(baseCurrency)}`,
  );
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Valor recebido SUGERIDO a partir do debitado, da cotação e da taxa.
 * Taxa na origem: (debitado - taxa) / cotação. Taxa no destino:
 * debitado / cotação - taxa. Taxa vazia entra como zero só na sugestão
 * (continua NULL no banco). A cotação pode estar em qualquer direção.
 * Resultado em 2 casas; null quando não há dados suficientes ou dá <= 0.
 */
export function calculateSuggestedDestinationAmount(params: {
  sourceAmount: number;
  feeAmount: number | null;
  feeCurrency: string;
  quotedRate: number | null;
  quotedRateBaseCurrency: string;
  quotedRateQuoteCurrency: string;
  originCurrency: string;
  destinationCurrency: string;
}) {
  if (!(params.sourceAmount > 0) || params.quotedRate === null) return null;
  const rate = normalizeQuotedRate({
    quotedRate: params.quotedRate,
    baseCurrency: params.quotedRateBaseCurrency,
    quoteCurrency: params.quotedRateQuoteCurrency,
    originCurrency: params.originCurrency,
    destinationCurrency: params.destinationCurrency,
  });
  if (rate === null) return null;

  const fee = params.feeAmount ?? 0;
  const received =
    params.feeCurrency === params.destinationCurrency
      ? params.sourceAmount / rate - fee
      : (params.sourceAmount - fee) / rate;
  const rounded = roundMoney(received);
  return rounded > 0 ? rounded : null;
}

type ConversionCurrencies = { originCurrency: string; destinationCurrency: string };

/** Unidade da cotação para o campo: "R$/€" (padrão) ou "€/R$" (invertida). */
export function getQuoteUnitLabel(
  quotedRateBase: ConversionFormValues["quotedRateBase"],
  currencies: ConversionCurrencies,
) {
  const { base, quote } = getQuotedRateCurrencies(quotedRateBase, currencies);
  return `${getCurrencySymbol(quote)}/${getCurrencySymbol(base)}`;
}

/** Moedas da cotação conforme a direção do formulário (padrão: origem por 1 destino). */
export function getQuotedRateCurrencies(
  quotedRateBase: ConversionFormValues["quotedRateBase"],
  currencies: ConversionCurrencies,
) {
  return quotedRateBase === "destination"
    ? { base: currencies.destinationCurrency, quote: currencies.originCurrency }
    : { base: currencies.originCurrency, quote: currencies.destinationCurrency };
}

/** Sugestão de valor recebido a partir do formulário; null se insuficiente. */
export function suggestDestinationAmountFromForm(
  form: ConversionFormValues,
  sourceAmount: number,
  currencies: ConversionCurrencies,
) {
  const { base, quote } = getQuotedRateCurrencies(form.quotedRateBase, currencies);
  return calculateSuggestedDestinationAmount({
    sourceAmount,
    feeAmount: form.feeAmount.replace(/\D/g, "") ? parseMoneyInput(form.feeAmount) : null,
    feeCurrency: getConversionFeeCurrency(form.feeCurrency, currencies),
    quotedRate: parseRateInput(form.quotedRate),
    quotedRateBaseCurrency: base,
    quotedRateQuoteCurrency: quote,
    ...currencies,
  });
}

/**
 * Aplica a mudança de um campo DETERMINANTE (valor debitado, taxa, moeda da
 * taxa, cotação ou direção) e recalcula o valor recebido quando possível.
 * Só deve ser chamada nos eventos desses campos: abrir uma edição ou editar
 * o valor recebido à mão nunca recalcula, então o valor real digitado fica
 * preservado até o próximo ajuste determinante. Sem dados suficientes, o
 * valor recebido atual é mantido.
 */
export function applyConversionDriverChange(
  form: ConversionFormValues,
  patch: Partial<Omit<ConversionFormValues, "destinationValue" | "providerId">>,
  context: ConversionCurrencies & { sourceAmount: number },
): ConversionFormValues {
  const next = { ...form, ...patch };
  const suggestion = suggestDestinationAmountFromForm(next, context.sourceAmount, context);
  return suggestion === null
    ? next
    : { ...next, destinationValue: formatMoney(suggestion, context.destinationCurrency) };
}

/**
 * Inverso de uma cotação com o menor número de dígitos que ainda reproduz a
 * cotação original, para a ida e volta ser exata (6,05 -> 0,1652892562 -> 6,05).
 */
export function invertRate(rate: number) {
  const inverse = 1 / rate;
  for (let precision = 1; precision <= 15; precision += 1) {
    const candidate = Number(inverse.toPrecision(precision));
    if (Math.abs(1 / candidate - rate) / rate < 1e-9) return candidate;
  }
  return inverse;
}

/**
 * Inverte a direção da cotação mantendo o mesmo significado (R$ 6,05/€ ->
 * € 0,1652892562/R$), então o valor sugerido não muda.
 */
export function invertQuotedRateDirection(form: ConversionFormValues): Pick<
  ConversionFormValues,
  "quotedRate" | "quotedRateBase"
> {
  const rate = parseRateInput(form.quotedRate);
  return {
    quotedRateBase: form.quotedRateBase === "destination" ? "origin" : "destination",
    quotedRate: rate && rate > 0 ? formatRateInput(invertRate(rate)) : form.quotedRate,
  };
}

/** Moeda da taxa válida para o par atual; fora do par volta para a origem. */
export function getConversionFeeCurrency(
  feeCurrency: string,
  currencies: { originCurrency: string; destinationCurrency: string },
) {
  return feeCurrency === currencies.originCurrency ||
    feeCurrency === currencies.destinationCurrency
    ? feeCurrency
    : currencies.originCurrency;
}

/** Cotação gravada -> texto do campo (ex.: 6.05 -> "6,05"). */
export function formatRateInput(rate: number | null | undefined) {
  if (rate === null || rate === undefined || !Number.isFinite(Number(rate))) return "";
  return String(Number(rate)).replace(".", ",");
}
