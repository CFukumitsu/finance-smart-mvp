import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

function slice(from: string, to: string) {
  const start = page.indexOf(from);
  assert.ok(start >= 0, `${from} não encontrado`);
  const end = page.indexOf(to, start + from.length);
  assert.ok(end > start, `${to} não encontrado após ${from}`);
  return page.slice(start, end);
}

test("recálculo só acontece pelo helper central, nunca em efeito/renderização", () => {
  assert.equal(page.match(/applyConversionDriverChange\(/g)?.length, 1);
  assert.ok(!/useEffect\([\s\S]{0,400}?applyConversionDriverChange/.test(page));
  assert.ok(!page.includes("calculateSuggestedDestinationAmount"));
});

test("valor debitado, cotação, taxa, moeda da taxa e direção são os campos determinantes", () => {
  assert.ok(page.includes("changeConversionDriver({}, parseCurrencyInput(value));"));
  assert.ok(page.includes("changeConversionDriver({\n                                  quotedRate:"));
  assert.ok(page.includes("changeConversionDriver({\n                                feeAmount:"));
  assert.ok(page.includes("feeCurrency: currency,"));
  assert.ok(page.includes("invertQuotedRateDirection(conversionForm)"));
});

test("valor recebido digitado à mão não recalcula", () => {
  const received = slice("Valor recebido\n", "placeholder={getMoneyInputPlaceholder(");
  assert.ok(!received.includes("changeConversionDriver"));
  assert.ok(received.includes("destinationValue: formatCurrencyInput("));
});

test("abrir a edição carrega o valor salvo sem recalcular", () => {
  const openEdit = slice("async function openLinkedTransferEditDrawer(", "async function saveTransaction(");
  assert.ok(openEdit.includes("formatCurrencyFromNumber(\n              values.destinationValue,"));
  assert.ok(!openEdit.includes("changeConversionDriver"));
  assert.ok(!openEdit.includes("applyConversionDriverChange"));
});

test("moeda da taxa e direção da cotação ficam em 'Mais opções', sem selects no fluxo padrão", () => {
  const block = slice("{conversionCurrencies && (", "{showConversionOptions && (");
  assert.ok(!block.includes("Moeda da taxa"));
  assert.ok(!block.includes("Direção"));
  assert.equal(block.match(/<select/g)?.length, 1, "somente o select de provedor");
  assert.ok(page.includes('{showConversionOptions ? "Menos opções" : "Mais opções"}'));
});

test("mesma moeda não mostra campos de conversão", () => {
  assert.ok(page.includes('transferFormCurrencyMode?.mode === "conversion"'));
  assert.ok(page.includes('{conversionCurrencies ? "Valor debitado" : "Valor"}'));
});
