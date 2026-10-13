import assert from "node:assert/strict";
import test from "node:test";
import {
  canConfirmPayment,
  formatSignedMoney,
  getInvoiceDivergence,
  validatePaymentConfirmation,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./paymentConfirmation.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateAccountFinalBalance } from "./balanceCalculations.ts";

const today = "2026-10-13";
const bank = { isBankAccount: true, isFuel: false };
const card = { isBankAccount: false, isFuel: false };

const tx = (overrides: Record<string, unknown> = {}) => ({
  type: "Despesa",
  status: "Pendente",
  value: 150,
  ...overrides,
});

const invoice = (overrides: Record<string, unknown> = {}) =>
  tx({ type: "Pagamento de Fatura", value: 2865.68, ...overrides });

function validate(overrides: Partial<Parameters<typeof validatePaymentConfirmation>[0]> = {}) {
  return validatePaymentConfirmation({
    transaction: tx(),
    context: bank,
    effectiveDate: today,
    today,
    statementTotal: null,
    currency: "BRL",
    divergenceAcknowledged: false,
    ...overrides,
  });
}

test("despesa pendente em conta bancária permite confirmação", () => {
  assert.equal(canConfirmPayment(tx(), bank), true);
  assert.deepEqual(validate(), { ok: true });
});

test("despesa recorrente e parcela em conta bancária também são elegíveis", () => {
  assert.equal(canConfirmPayment(tx({ recurring_transaction_id: "r1" }), bank), true);
  assert.equal(canConfirmPayment(tx({ mode: "parcelado", parcel_number: 2 }), bank), true);
});

test("pagamento de fatura pendente permite confirmação", () => {
  assert.equal(canConfirmPayment(invoice(), bank), true);
  assert.deepEqual(validate({ transaction: invoice(), statementTotal: 2865.68 }), { ok: true });
});

test("já pago não mostra o check e não confirma de novo", () => {
  assert.equal(canConfirmPayment(tx({ status: "Pago" }), bank), false);
  assert.equal(canConfirmPayment(invoice({ status: "Pago" }), bank), false);
  const result = validate({ transaction: tx({ status: "Pago" }) });
  assert.equal(result.ok, false);
  assert.equal((result as { reason: string }).reason, "already-paid");
});

test("receitas, transferências e integrações não são elegíveis", () => {
  assert.equal(canConfirmPayment(tx({ type: "Receita" }), bank), false);
  assert.equal(canConfirmPayment(tx({ type: "Transferência" }), bank), false);
  assert.equal(canConfirmPayment(tx({ transfer_group_id: "g" }), bank), false);
  assert.equal(canConfirmPayment(tx({ bankroll_integration_group_id: "b" }), bank), false);
  assert.equal(canConfirmPayment(tx({ investment_integration_group_id: "i" }), bank), false);
});

test("compra no cartão não é elegível (é quitada pela fatura)", () => {
  assert.equal(canConfirmPayment(tx(), card), false);
  assert.equal(validate({ context: card }).ok, false);
});

test("abastecimento mantém o fluxo próprio", () => {
  assert.equal(canConfirmPayment(tx(), { isBankAccount: true, isFuel: true }), false);
});

test("pagamento antecipado (data anterior à prevista) é permitido", () => {
  assert.deepEqual(validate({ effectiveDate: "2026-10-01" }), { ok: true });
});

test("data efetiva futura ou inválida é recusada", () => {
  for (const effectiveDate of ["2026-10-14", "", "13/10/2026"]) {
    const result = validate({ effectiveDate });
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "invalid-date");
  }
});

test("divergência de fatura apresenta valores e diferença", () => {
  const result = validate({ transaction: invoice({ value: 2800 }), statementTotal: 2865.68 });
  assert.equal(result.ok, false);
  assert.equal((result as { reason: string }).reason, "divergence");
  assert.deepEqual((result as { divergence: unknown }).divergence, {
    transactionValue: 2800,
    statementTotal: 2865.68,
    difference: -65.68,
  });
});

test("usuário pode confirmar mesmo com divergência após aceitar o aviso", () => {
  assert.deepEqual(
    validate({
      transaction: invoice({ value: 2800 }),
      statementTotal: 2865.68,
      divergenceAcknowledged: true,
    }),
    { ok: true },
  );
});

test("sem fatura vinculada não há divergência", () => {
  assert.equal(getInvoiceDivergence(2800, null, "BRL"), null);
  assert.deepEqual(validate({ transaction: invoice({ value: 2800 }) }), { ok: true });
});

test("diferença é calculada na precisão da moeda", () => {
  assert.equal(getInvoiceDivergence(0.1 + 0.2, 0.3, "BRL"), null);
  assert.equal(getInvoiceDivergence(100.1, 100, "BRL")?.difference, 0.1);
});

test("diferença formatada com sinal", () => {
  const nbsp = (value: string) => value.replace(/\s/g, " ");
  assert.equal(nbsp(formatSignedMoney(65.68, "BRL")), "+R$ 65,68");
  assert.equal(nbsp(formatSignedMoney(-65.68, "BRL")), "−R$ 65,68");
  assert.equal(nbsp(formatSignedMoney(0, "BRL")), "R$ 0,00");
});

test("confirmar só muda status: nenhum débito duplicado nem ajuste na fatura", () => {
  const purchase = { account_id: "porto", type: "Despesa", value: 2865.68, status: "Pago" };
  const pending = { account_id: "itau", type: "Pagamento de Fatura", value: 2800, status: "Pendente" };
  const confirmed = { ...pending, status: "Pago" };

  const itauBefore = calculateAccountFinalBalance({ accountId: "itau", openingBalance: 5000, transactions: [purchase, pending] });
  const itauAfter = calculateAccountFinalBalance({ accountId: "itau", openingBalance: 5000, transactions: [purchase, confirmed] });
  assert.equal(itauBefore, itauAfter);
  assert.equal(itauAfter, 2200);

  const cardBefore = calculateAccountFinalBalance({ accountId: "porto", openingBalance: 0, transactions: [purchase, pending] });
  const cardAfter = calculateAccountFinalBalance({ accountId: "porto", openingBalance: 0, transactions: [purchase, confirmed] });
  assert.equal(cardBefore, cardAfter);
});

test("confirmar despesa comum não altera o saldo calculado", () => {
  const pending = { account_id: "itau", type: "Despesa", value: 150, status: "Pendente" };
  const before = calculateAccountFinalBalance({ accountId: "itau", openingBalance: 1000, transactions: [pending] });
  const after = calculateAccountFinalBalance({ accountId: "itau", openingBalance: 1000, transactions: [{ ...pending, status: "Pago" }] });
  assert.equal(before, after);
});
