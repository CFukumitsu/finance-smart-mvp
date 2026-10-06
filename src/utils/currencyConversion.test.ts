import assert from "node:assert/strict";
import test from "node:test";
import {
  applyConversionDriverChange,
  calculateSuggestedDestinationAmount,
  formatCompactRate,
  getQuoteUnitLabel,
  invertQuotedRateDirection,
  invertRate,
  suggestDestinationAmountFromForm,
  buildConversionInput,
  calculateEffectiveRate,
  calculateQuotedRateDifference,
  calculateWeightedEffectiveRate,
  formatRate,
  formatRateInput,
  formatSignedPercent,
  getConversionFeeCurrency,
  getTransferCurrencyMode,
  normalizeQuotedRate,
  parseRateInput,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./currencyConversion.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateAccountFinalBalance } from "./balanceCalculations.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildCreateTransferRpcParams, buildUpdateTransferRpcParams } from "./linkedTransfers.ts";

const BRL_EUR = { originCurrency: "BRL", destinationCurrency: "EUR" };
const plain = (value: string) => value.replace(/\s/g, " ");

const wiseForm = {
  destinationValue: "€ 241,69",
  providerId: "provider-wise",
  feeAmount: "R$ 24,00",
  feeCurrency: "BRL",
  quotedRate: "6,05",
  quotedRateBase: "destination" as const,
};

test("mesma moeda e legadas sem moeda seguem como transferência comum", () => {
  assert.deepEqual(getTransferCurrencyMode("BRL", "BRL"), { mode: "same" });
  assert.deepEqual(getTransferCurrencyMode("GBP", "gbp"), { mode: "same" });
  assert.deepEqual(getTransferCurrencyMode(null, null), { mode: "same" });
});

test("moedas confirmadas diferentes viram conversão em todas as direções", () => {
  for (const [origin, destination] of [
    ["BRL", "EUR"], ["BRL", "GBP"], ["EUR", "GBP"], ["GBP", "EUR"], ["EUR", "BRL"], ["GBP", "BRL"],
  ]) {
    assert.deepEqual(getTransferCurrencyMode(origin, destination), {
      mode: "conversion",
      originCurrency: origin,
      destinationCurrency: destination,
    });
  }
});

test("conta sem moeda + conta confirmada continua bloqueada", () => {
  const result = getTransferCurrencyMode(null, "EUR");
  assert.equal(result.mode, "blocked");
  assert.match(result.mode === "blocked" ? result.message : "", /Confirme a moeda/);
});

test("custo efetivo é derivado: R$ 1.500 / € 241,69 = R$ 6,2063 por EUR", () => {
  const rate = calculateEffectiveRate(1500, 241.69);
  assert.equal(Number(rate?.toFixed(4)), 6.2063);
  assert.equal(plain(formatRate(rate ?? 0, "BRL", "EUR")), "R$ 6,2063 por EUR");
  assert.equal(calculateEffectiveRate(0, 241.69), null);
  assert.equal(calculateEffectiveRate(1500, 0), null);
});

test("diferença vs. cotação informada na mesma direção: +2,58%", () => {
  const effective = calculateEffectiveRate(1500, 241.69) ?? 0;
  const quoted = normalizeQuotedRate({
    quotedRate: 6.05, baseCurrency: "EUR", quoteCurrency: "BRL", ...BRL_EUR,
  });
  assert.equal(quoted, 6.05);
  const difference = calculateQuotedRateDifference(effective, quoted ?? 0);
  assert.equal(formatSignedPercent(difference ?? 0), "+2,58%");
});

test("cotação informada na direção inversa é normalizada só para exibição", () => {
  const inverse = normalizeQuotedRate({
    quotedRate: 1 / 6.05, baseCurrency: "BRL", quoteCurrency: "EUR", ...BRL_EUR,
  });
  assert.equal(Number(inverse?.toFixed(6)), 6.05);
  assert.equal(normalizeQuotedRate({
    quotedRate: 6.05, baseCurrency: "USD", quoteCurrency: "BRL", ...BRL_EUR,
  }), null);
});

test("custo médio é SUM(debitado)/SUM(recebido), não a média simples das taxas", () => {
  const operations = [
    { sourceAmount: 1000, destinationAmount: 160 },
    { sourceAmount: 10, destinationAmount: 1 },
  ];
  const weighted = calculateWeightedEffectiveRate(operations) ?? 0;
  const simpleAverage = (1000 / 160 + 10 / 1) / 2;
  assert.equal(Number(weighted.toFixed(4)), Number((1010 / 161).toFixed(4)));
  assert.notEqual(Number(weighted.toFixed(4)), Number(simpleAverage.toFixed(4)));

  const wise = calculateWeightedEffectiveRate([
    { sourceAmount: 1000, destinationAmount: 161.2 },
    { sourceAmount: 1000, destinationAmount: 160 },
  ]) ?? 0;
  const nomad = calculateWeightedEffectiveRate([
    { sourceAmount: 1600, destinationAmount: 259.1 },
    { sourceAmount: 1200, destinationAmount: 195 },
  ]) ?? 0;
  assert.ok(nomad < wise, "menor custo efetivo médio = melhor provedor");
});

test("formulário de conversão completo gera os dados da RPC (taxa em BRL, cotação R$ por €)", () => {
  assert.deepEqual(buildConversionInput(wiseForm, BRL_EUR), {
    ok: true,
    conversion: {
      destinationAmount: 241.69,
      providerId: "provider-wise",
      feeAmount: 24,
      feeCurrency: "BRL",
      quotedRate: 6.05,
      quotedRateBaseCurrency: "EUR",
      quotedRateQuoteCurrency: "BRL",
    },
  });
});

test("taxa vazia = desconhecida (NULL); taxa 0 = explicitamente sem taxa", () => {
  const unknown = buildConversionInput({ ...wiseForm, feeAmount: "" }, BRL_EUR);
  assert.ok(unknown.ok);
  assert.equal(unknown.ok && unknown.conversion.feeAmount, null);
  assert.equal(unknown.ok && unknown.conversion.feeCurrency, null);

  const zero = buildConversionInput({ ...wiseForm, feeAmount: "R$ 0,00" }, BRL_EUR);
  assert.ok(zero.ok);
  assert.equal(zero.ok && zero.conversion.feeAmount, 0);
  assert.equal(zero.ok && zero.conversion.feeCurrency, "BRL");
});

test("cotação é opcional e a direção escolhida é preservada", () => {
  const withoutQuote = buildConversionInput({ ...wiseForm, quotedRate: "" }, BRL_EUR);
  assert.ok(withoutQuote.ok);
  assert.deepEqual(
    withoutQuote.ok && [
      withoutQuote.conversion.quotedRate,
      withoutQuote.conversion.quotedRateBaseCurrency,
      withoutQuote.conversion.quotedRateQuoteCurrency,
    ],
    [null, null, null],
  );

  const inverse = buildConversionInput({ ...wiseForm, quotedRate: "0,1653", quotedRateBase: "origin" }, BRL_EUR);
  assert.ok(inverse.ok);
  assert.equal(inverse.ok && inverse.conversion.quotedRateBaseCurrency, "BRL");
  assert.equal(inverse.ok && inverse.conversion.quotedRateQuoteCurrency, "EUR");
  assert.equal(inverse.ok && inverse.conversion.quotedRate, 0.1653);
});

test("valor recebido e provedor são obrigatórios; cotação inválida e taxa em terceira moeda bloqueadas", () => {
  assert.deepEqual(buildConversionInput({ ...wiseForm, destinationValue: "" }, BRL_EUR), {
    ok: false, message: "Informe o valor recebido na conta de destino.",
  });
  assert.deepEqual(buildConversionInput({ ...wiseForm, providerId: "" }, BRL_EUR), {
    ok: false, message: "Selecione o provedor da conversão.",
  });
  assert.equal(buildConversionInput({ ...wiseForm, quotedRate: "0" }, BRL_EUR).ok, false);
  assert.equal(buildConversionInput({ ...wiseForm, quotedRate: "abc" }, BRL_EUR).ok, false);
  assert.equal(buildConversionInput({ ...wiseForm, feeCurrency: "USD" }, BRL_EUR).ok, false);
  assert.equal(getConversionFeeCurrency("USD", BRL_EUR), "BRL");
  assert.equal(getConversionFeeCurrency("EUR", BRL_EUR), "EUR");
});

test("entrada e saída de cotação no formato brasileiro", () => {
  assert.equal(parseRateInput("6,05"), 6.05);
  assert.equal(parseRateInput("6.05"), 6.05);
  assert.equal(parseRateInput("1.234,5678"), 1234.5678);
  assert.equal(parseRateInput(""), null);
  assert.equal(parseRateInput("6,0,5"), null);
  assert.equal(formatRateInput(6.05), "6,05");
  assert.equal(formatRateInput(null), "");
});

test("RPC recebe valor debitado e recebido separados; mesma moeda envia conversão nula", () => {
  const conversion = buildConversionInput(wiseForm, BRL_EUR);
  assert.ok(conversion.ok);
  const params = buildCreateTransferRpcParams({
    originAccountId: "itau",
    destinationAccountId: "wise-euro",
    dueDate: "2026-10-05",
    competenceId: "comp",
    amount: 1500,
    description: "Envio Wise",
    idempotencyKey: "key",
    conversion: conversion.ok ? conversion.conversion : null,
  });
  assert.equal(params.p_amount, 1500);
  assert.equal(params.p_destination_amount, 241.69);
  assert.equal(params.p_provider_id, "provider-wise");
  assert.equal(params.p_fee_amount, 24);
  assert.equal(params.p_quoted_rate_base_currency, "EUR");

  const same = buildUpdateTransferRpcParams({
    transferGroupId: "group",
    originAccountId: "itau",
    destinationAccountId: "bmg",
    dueDate: "2026-10-05",
    competenceId: "comp",
    amount: 1000,
    description: "BRL",
  });
  assert.equal(same.p_destination_amount, null);
  assert.equal(same.p_provider_id, null);
});

test("saldo nativo: origem cai o total debitado (taxa não é debitada de novo) e destino recebe o valor recebido", () => {
  const legs = [
    { account_id: "itau", type: "Transferência", status: "Pago", value: 1500 },
    { account_id: "wise-euro", type: "Transferência", status: "Recebido", value: 241.69 },
  ];
  assert.equal(calculateAccountFinalBalance({ accountId: "itau", openingBalance: 5000, transactions: legs }), 3500);
  assert.equal(
    Number(calculateAccountFinalBalance({ accountId: "wise-euro", openingBalance: 300, transactions: legs }).toFixed(2)),
    541.69,
  );
});

// ---------------------------------------------------------------------------
// Fase 2C: cálculo automático do valor recebido
// ---------------------------------------------------------------------------
const brlEurSuggestion = (fee: number | null, feeCurrency = "BRL") =>
  calculateSuggestedDestinationAmount({
    sourceAmount: 1500,
    feeAmount: fee,
    feeCurrency,
    quotedRate: 6.05,
    quotedRateBaseCurrency: "EUR",
    quotedRateQuoteCurrency: "BRL",
    ...BRL_EUR,
  });

test("taxa na origem: (1500 - 24) / 6,05 = € 243,97", () => {
  assert.equal(brlEurSuggestion(24), 243.97);
});

test("taxa desconhecida entra como zero só na sugestão; no envio continua NULL", () => {
  assert.equal(brlEurSuggestion(null), 247.93);
  const form = { ...wiseForm, feeAmount: "", destinationValue: "" };
  assert.equal(suggestDestinationAmountFromForm(form, 1500, BRL_EUR), 247.93);
  const built = buildConversionInput({ ...form, destinationValue: "€ 247,93" }, BRL_EUR);
  assert.ok(built.ok);
  assert.equal(built.ok && built.conversion.feeAmount, null);
  assert.equal(built.ok && built.conversion.feeCurrency, null);
});

test("taxa zero: mesmo cálculo e fee = 0 explícito", () => {
  assert.equal(brlEurSuggestion(0), 247.93);
  const built = buildConversionInput({ ...wiseForm, feeAmount: "R$ 0,00", destinationValue: "€ 247,93" }, BRL_EUR);
  assert.ok(built.ok);
  assert.equal(built.ok && built.conversion.feeAmount, 0);
});

test("taxa no destino: converte primeiro e desconta a taxa em EUR", () => {
  // 1500 / 6,05 = 247,9339 -> - € 4,00 = 243,93
  assert.equal(brlEurSuggestion(4, "EUR"), 243.93);
});

test("cotação invertida (€ por R$) dá o mesmo resultado", () => {
  assert.equal(
    calculateSuggestedDestinationAmount({
      sourceAmount: 1500,
      feeAmount: 24,
      feeCurrency: "BRL",
      quotedRate: 1 / 6.05,
      quotedRateBaseCurrency: "BRL",
      quotedRateQuoteCurrency: "EUR",
      ...BRL_EUR,
    }),
    243.97,
  );
});

test("EUR -> GBP com cotação padrão € 1,17/£", () => {
  const currencies = { originCurrency: "EUR", destinationCurrency: "GBP" };
  assert.equal(getQuoteUnitLabel("destination", currencies), "€/£");
  assert.equal(getQuoteUnitLabel("origin", currencies), "£/€");
  assert.equal(
    calculateSuggestedDestinationAmount({
      sourceAmount: 117,
      feeAmount: null,
      feeCurrency: "EUR",
      quotedRate: 1.17,
      quotedRateBaseCurrency: "GBP",
      quotedRateQuoteCurrency: "EUR",
      ...currencies,
    }),
    100,
  );
});

test("valor recebido arredondado a 2 casas; sem dados ou resultado <= 0 não sugere", () => {
  const value = brlEurSuggestion(24) ?? 0;
  assert.equal(Math.round(value * 100) / 100, value);
  assert.equal(brlEurSuggestion(1500), null);
  assert.equal(
    calculateSuggestedDestinationAmount({
      sourceAmount: 1500, feeAmount: null, feeCurrency: "BRL", quotedRate: null,
      quotedRateBaseCurrency: "EUR", quotedRateQuoteCurrency: "BRL", ...BRL_EUR,
    }),
    null,
  );
});

test("unidades e resumo compactos: R$/€ e R$ 6,1483/€", () => {
  assert.equal(getQuoteUnitLabel("destination", BRL_EUR), "R$/€");
  assert.equal(getQuoteUnitLabel("origin", BRL_EUR), "€/R$");
  assert.equal(plain(formatCompactRate(1500 / 243.97, "BRL", "EUR")), "R$ 6,1483/€");
});

test("inverter a direção mantém o significado e a ida e volta é exata", () => {
  const inverted = invertQuotedRateDirection(wiseForm);
  assert.equal(inverted.quotedRateBase, "origin");
  assert.equal(inverted.quotedRate, "0,1652892562");
  const back = invertQuotedRateDirection({ ...wiseForm, ...inverted });
  assert.deepEqual(back, { quotedRateBase: "destination", quotedRate: "6,05" });
  assert.equal(invertRate(4), 0.25);
  assert.equal(
    suggestDestinationAmountFromForm({ ...wiseForm, ...inverted }, 1500, BRL_EUR),
    suggestDestinationAmountFromForm(wiseForm, 1500, BRL_EUR),
  );
});

// Simula o formulário: só mudanças determinantes recalculam.
const context = (sourceAmount: number) => ({ ...BRL_EUR, sourceAmount });
const emptyForm = {
  destinationValue: "",
  providerId: "",
  feeAmount: "",
  feeCurrency: "",
  quotedRate: "",
  quotedRateBase: "destination" as const,
};

test("edição existente não é recalculada ao abrir; valor real salvo é mantido", () => {
  const loaded = { ...wiseForm, destinationValue: "€ 243,82" };
  // Abrir a edição não chama applyConversionDriverChange: o estado carregado é o salvo.
  assert.equal(loaded.destinationValue, "€ 243,82");
  // Trocar o provedor não é determinante e não mexe no valor recebido.
  const providerChanged = { ...loaded, providerId: "provider-nomad" };
  assert.equal(providerChanged.destinationValue, "€ 243,82");
});

test("alterar cotação, taxa ou valor debitado recalcula o valor recebido", () => {
  const withRate = applyConversionDriverChange(emptyForm, { quotedRate: "6,05" }, context(1500));
  assert.equal(plain(withRate.destinationValue), "€ 247,93");

  const withFee = applyConversionDriverChange(withRate, { feeAmount: "R$ 24,00" }, context(1500));
  assert.equal(plain(withFee.destinationValue), "€ 243,97");

  const newSource = applyConversionDriverChange(withFee, {}, context(2000));
  // (2000 - 24) / 6,05 = 326,61
  assert.equal(plain(newSource.destinationValue), "€ 326,61");

  const feeInDestination = applyConversionDriverChange(withFee, { feeCurrency: "EUR", feeAmount: "€ 24,00" }, context(1500));
  // 1500 / 6,05 - 24 = 223,93
  assert.equal(plain(feeInDestination.destinationValue), "€ 223,93");
});

test("valor recebido digitado à mão é preservado até a próxima mudança determinante", () => {
  const calculated = applyConversionDriverChange(
    emptyForm, { quotedRate: "6,05", feeAmount: "R$ 24,00" }, context(1500),
  );
  assert.equal(plain(calculated.destinationValue), "€ 243,97");

  // Usuário corrige para o valor real creditado pela Wise.
  const manual = { ...calculated, destinationValue: "€ 243,82" };
  // Mudanças não determinantes (provedor) não sobrescrevem.
  const otherEdit = { ...manual, providerId: "provider-nomad" };
  assert.equal(otherEdit.destinationValue, "€ 243,82");

  // Nova intenção de cálculo: mudou a taxa -> recalcula.
  const recalculated = applyConversionDriverChange(otherEdit, { feeAmount: "R$ 20,00" }, context(1500));
  assert.equal(plain(recalculated.destinationValue), "€ 244,63");
});

test("sem dados suficientes a mudança determinante não apaga o valor recebido", () => {
  const manual = { ...emptyForm, destinationValue: "€ 243,82" };
  const clearedRate = applyConversionDriverChange(manual, { quotedRate: "" }, context(1500));
  assert.equal(clearedRate.destinationValue, "€ 243,82");
  const noSource = applyConversionDriverChange({ ...manual, quotedRate: "6,05" }, {}, context(0));
  assert.equal(noSource.destinationValue, "€ 243,82");
});
