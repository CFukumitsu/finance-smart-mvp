import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateAccountFinalBalance } from "./balanceCalculations.ts";
import {
  checkCardPaymentCurrencies,
  checkTransferCurrencies,
  CURRENCY_MISMATCH_CARD_PAYMENT_MESSAGE,
  CURRENCY_MISMATCH_TRANSFER_MESSAGE,
  filterByCurrency,
  formatMoney,
  formatMoneyInput,
  getCurrencyLabel,
  getMoneyInputPlaceholder,
  isPrimaryCurrency,
  isSupportedCurrency,
  listCurrencies,
  normalizeCurrencyCode,
  parseMoneyInput,
  partitionByPrimaryCurrency,
  PRIMARY_CURRENCY,
  resolveAccountCurrency,
  sumByCurrency,
  SUPPORTED_CURRENCIES,
  UNCONFIRMED_CURRENCY_TRANSFER_MESSAGE,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./currencies.ts";

// Intl usa espaço não separável entre símbolo e número em pt-BR.
const nbsp = " ";

test("lista central contém BRL, USD, EUR e GBP com rótulos", () => {
  assert.deepEqual(
    SUPPORTED_CURRENCIES.map((currency: { code: string }) => currency.code),
    ["BRL", "USD", "EUR", "GBP"],
  );
  assert.equal(getCurrencyLabel("GBP"), "GBP — Libra Esterlina");
  assert.equal(getCurrencyLabel("eur"), "EUR — Euro");
  assert.equal(getCurrencyLabel(null), "Moeda não confirmada");
  assert.equal(getCurrencyLabel("CHF"), "CHF");
  assert.equal(PRIMARY_CURRENCY, "BRL");
});

test("normaliza e valida códigos ISO como o banco", () => {
  assert.equal(normalizeCurrencyCode(" gbp "), "GBP");
  assert.equal(normalizeCurrencyCode(""), null);
  assert.equal(normalizeCurrencyCode("EURO"), null);
  assert.equal(normalizeCurrencyCode("R$"), null);
  assert.equal(normalizeCurrencyCode(null), null);
  assert.equal(isSupportedCurrency("GBP"), true);
  assert.equal(isSupportedCurrency("CHF"), false);
});

test("formata as moedas suportadas em pt-BR", () => {
  assert.equal(formatMoney(1500, "BRL"), `R$${nbsp}1.500,00`);
  assert.equal(formatMoney(241.69, "EUR"), `€${nbsp}241,69`);
  assert.equal(formatMoney(210, "GBP"), `£${nbsp}210,00`);
  assert.equal(formatMoney(300, "USD"), `US$${nbsp}300,00`);
  assert.equal(formatMoney(-12.5, "EUR"), `-€${nbsp}12,50`);
});

test("conta legada sem moeda usa BRL somente para exibição e valor inválido vira zero", () => {
  assert.equal(formatMoney(10, null), `R$${nbsp}10,00`);
  assert.equal(formatMoney(10, undefined), `R$${nbsp}10,00`);
  assert.equal(formatMoney(Number.NaN, "EUR"), `€${nbsp}0,00`);
  assert.equal(resolveAccountCurrency(null), "BRL");
  assert.equal(resolveAccountCurrency("gbp"), "GBP");
  assert.equal(isPrimaryCurrency(null), true);
  assert.equal(isPrimaryCurrency("EUR"), false);
});

test("código histórico fora da lista continua formatado pelo Intl", () => {
  assert.equal(formatMoney(5, "CHF"), `CHF${nbsp}5,00`);
});

test("saldo individual de conta EUR e GBP é exibido na moeda da conta", () => {
  const euroBalance = calculateAccountFinalBalance({
    accountId: "wise-eur",
    openingBalance: 200,
    transactions: [
      { account_id: "wise-eur", type: "Receita", value: 41.69, status: "Recebido" },
    ],
  });
  const poundBalance = calculateAccountFinalBalance({
    accountId: "wise-gbp",
    openingBalance: 250,
    transactions: [
      { account_id: "wise-gbp", type: "Despesa", value: 40, status: "Pago" },
    ],
  });

  assert.equal(formatMoney(euroBalance, "EUR"), `€${nbsp}241,69`);
  assert.equal(formatMoney(poundBalance, "GBP"), `£${nbsp}210,00`);
});

test("máscara de digitação acompanha a moeda e o parse ignora símbolos", () => {
  assert.equal(formatMoneyInput("150000", "BRL"), `R$${nbsp}1.500,00`);
  assert.equal(formatMoneyInput("5000", "EUR"), `€${nbsp}50,00`);
  assert.equal(formatMoneyInput("2500", "GBP"), `£${nbsp}25,00`);
  assert.equal(formatMoneyInput("", "GBP"), "");
  assert.equal(formatMoneyInput("€ ", "EUR"), "");
  // Trocar a conta reaproveita os mesmos centavos com outro símbolo.
  assert.equal(formatMoneyInput(`R$${nbsp}1.500,00`, "EUR"), `€${nbsp}1.500,00`);

  assert.equal(parseMoneyInput(`R$${nbsp}1.500,00`), 1500);
  assert.equal(parseMoneyInput(`€${nbsp}241,69`), 241.69);
  assert.equal(parseMoneyInput(`£${nbsp}210,00`), 210);
  assert.equal(parseMoneyInput(`US$${nbsp}300,00`), 300);
  assert.equal(parseMoneyInput("1.234,56"), 1234.56);
  assert.equal(parseMoneyInput(""), 0);
  assert.equal(getMoneyInputPlaceholder("GBP"), `£${nbsp}0,00`);
});

test("soma por moeda nunca mistura BRL e EUR", () => {
  const expenses = [
    { currency: "BRL", value: 1000 },
    { currency: "EUR", value: 100 },
  ];
  const totals = sumByCurrency(
    expenses,
    (item: { currency: string }) => item.currency,
    (item: { value: number }) => item.value,
  );

  assert.deepEqual(totals, [
    { currency: "BRL", total: 1000 },
    { currency: "EUR", total: 100 },
  ]);
  assert.equal(
    totals.some((item: { total: number }) => item.total === 1100),
    false,
  );
});

test("agrupa conta legada sem moeda junto com BRL e ordena BRL primeiro", () => {
  const items = [
    { currency: "GBP", value: 1 },
    { currency: null, value: 2 },
    { currency: "EUR", value: 3 },
    { currency: "BRL", value: 4 },
  ];
  const getCurrency = (item: { currency: string | null }) => item.currency;

  assert.deepEqual(listCurrencies(items, getCurrency), ["BRL", "EUR", "GBP"]);
  assert.deepEqual(
    filterByCurrency(items, "BRL", getCurrency).map(
      (item: { value: number }) => item.value,
    ),
    [2, 4],
  );

  const { primary, others } = partitionByPrimaryCurrency(items, getCurrency);
  assert.deepEqual(primary.map((item: { value: number }) => item.value), [2, 4]);
  assert.deepEqual(others.map((item: { value: number }) => item.value), [1, 3]);
});

test("transferências da mesma moeda continuam permitidas", () => {
  assert.deepEqual(checkTransferCurrencies("BRL", "BRL"), { allowed: true });
  assert.deepEqual(checkTransferCurrencies("EUR", "EUR"), { allowed: true });
  assert.deepEqual(checkTransferCurrencies("GBP", "gbp"), { allowed: true });
  assert.deepEqual(checkTransferCurrencies("USD", "USD"), { allowed: true });
});

test("transferências entre moedas diferentes ficam bloqueadas", () => {
  for (const [origin, destination] of [
    ["BRL", "EUR"],
    ["BRL", "GBP"],
    ["EUR", "GBP"],
    ["GBP", "BRL"],
    ["USD", "BRL"],
  ]) {
    assert.deepEqual(checkTransferCurrencies(origin, destination), {
      allowed: false,
      message: CURRENCY_MISMATCH_TRANSFER_MESSAGE,
    });
  }
});

test("conta sem moeda confirmada não infere BRL em transferência", () => {
  assert.deepEqual(checkTransferCurrencies(null, "BRL"), {
    allowed: false,
    message: UNCONFIRMED_CURRENCY_TRANSFER_MESSAGE,
  });
  assert.deepEqual(checkTransferCurrencies("EUR", ""), {
    allowed: false,
    message: UNCONFIRMED_CURRENCY_TRANSFER_MESSAGE,
  });
  // Duas contas legadas sem moeda mantêm o comportamento anterior.
  assert.deepEqual(checkTransferCurrencies(null, null), { allowed: true });
});

test("pagamento de fatura bloqueia somente moedas confirmadas diferentes", () => {
  assert.deepEqual(checkCardPaymentCurrencies("BRL", "BRL"), { allowed: true });
  assert.deepEqual(checkCardPaymentCurrencies(null, "BRL"), { allowed: true });
  assert.deepEqual(checkCardPaymentCurrencies("EUR", null), { allowed: true });
  assert.deepEqual(checkCardPaymentCurrencies("EUR", "BRL"), {
    allowed: false,
    message: CURRENCY_MISMATCH_CARD_PAYMENT_MESSAGE,
  });
});
