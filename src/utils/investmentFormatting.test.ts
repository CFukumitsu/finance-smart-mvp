import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { formatInvestmentMoneyInput, parseInvestmentMoney } from "./investmentFormatting.ts";

test("interpreta milhar pt-BR como valor monetário", () => {
  assert.equal(parseInvestmentMoney("10.000"), 10_000);
});

test("interpreta moeda pt-BR com milhar e casas decimais", () => {
  assert.equal(parseInvestmentMoney("10.000,50"), 10_000.5);
});

test("mantém ponto decimal quando não representa grupo de milhar pt-BR", () => {
  assert.equal(parseInvestmentMoney("10.5"), 10.5);
});

test("formata valor monetário inteiro com casas decimais", () => {
  assert.equal(formatInvestmentMoneyInput(10_000), "10.000,00");
});

test("calcula corretamente a prévia da operação do exemplo", () => {
  assert.equal(1 * parseInvestmentMoney("10.000"), 10_000);
});
