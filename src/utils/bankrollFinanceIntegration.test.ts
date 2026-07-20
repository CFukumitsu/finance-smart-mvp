import assert from "node:assert/strict";
import test from "node:test";
import type { BankrollFinanceCreateOperation, BankrollWallet, EligibleFinanceAccount } from "../types/bankroll";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildBankrollFinanceCreateRpcParams, filterEligibleFinanceAccountsForWallet, getConsolidatedPatrimonialEffect, getIntegratedFinanceEffect, getNewBankrollMovementSelection, isEligibleFinanceAccount, validateBankrollFinanceForm } from "./bankrollFinanceIntegration.ts";

const account = { id: "a", owner_id: "o", name: "Conta", type: "Conta", currency: "BRL", active: true } as EligibleFinanceAccount;
const wallet = { id: "w", owner_id: "o", name: "Poker", wallet_type: "online", currency: "BRL", initial_balance: 0, active: true, notes: null, created_at: "", updated_at: "" } as BankrollWallet;

test("conta ativa com moeda estruturada é elegível", () => assert.equal(isEligibleFinanceAccount(account), true));
test("conta inativa não é elegível", () => assert.equal(isEligibleFinanceAccount({ ...account, active: false }), false));
test("conta sem moeda confirmada não é elegível", () => assert.equal(isEligibleFinanceAccount({ ...account, currency: null }), false));
test("cartão de crédito não é elegível", () => assert.equal(isEligibleFinanceAccount({ ...account, type: "Cartão" }), false));
test("nova movimentação inicia sem conta e sem carteira", () => assert.deepEqual(getNewBankrollMovementSelection(), { walletId: "", financeAccountId: "" }));
test("sem carteira selecionada exibe todas as contas elegíveis", () => {
  const usdAccount = { ...account, id: "usd", currency: "USD" };
  assert.deepEqual(filterEligibleFinanceAccountsForWallet([account, usdAccount], null).map((item) => item.id), ["a", "usd"]);
});
test("após seleção manual filtra contas pela moeda da carteira", () => {
  const usdAccount = { ...account, id: "usd", currency: "USD" };
  assert.deepEqual(filterEligibleFinanceAccountsForWallet([account, usdAccount], wallet).map((item) => item.id), ["a"]);
});
test("modo integrado exige conta financeira", () => assert.equal(validateBankrollFinanceForm({ mode: "integrated", operationType: "deposit", account: null, wallet, amount: 10 }), "Selecione a conta financeira de origem."));
test("modo somente Bankroll não exige conta", () => assert.equal(validateBankrollFinanceForm({ mode: "bankroll_only", operationType: "deposit", account: null, wallet, amount: 10 }), null));
test("moedas iguais são aceitas", () => assert.equal(validateBankrollFinanceForm({ mode: "integrated", operationType: "withdrawal", account, wallet, amount: 10 }), null));
test("moedas diferentes são bloqueadas", () => assert.equal(validateBankrollFinanceForm({ mode: "integrated", operationType: "withdrawal", account: { ...account, currency: "USD" }, wallet, amount: 10 }), "A conta financeira e a carteira precisam usar a mesma moeda."));
test("valor inválido é bloqueado", () => assert.equal(validateBankrollFinanceForm({ mode: "bankroll_only", operationType: "deposit", wallet, amount: 0 }), "O valor deve ser maior que zero."));
test("data futura integrada é bloqueada", () => assert.equal(validateBankrollFinanceForm({ mode: "integrated", operationType: "deposit", account, wallet, amount: 10, date: "2999-01-01" }), "Operações integradas futuras ainda não são permitidas."));
test("depósito reduz o saldo financeiro sem virar despesa", () => assert.equal(getIntegratedFinanceEffect("deposit", 100), -100));
test("saque aumenta o saldo financeiro sem virar receita", () => assert.equal(getIntegratedFinanceEffect("withdrawal", 100), 100));
test("transferência Financeiro-Bankroll tem efeito patrimonial consolidado zero", () => assert.equal(getConsolidatedPatrimonialEffect(), 0));
test("repetições preservam a mesma chave idempotente enviada à RPC", () => {
  const operation: BankrollFinanceCreateOperation = {
    operationType: "deposit",
    accountId: "a",
    walletId: "w",
    date: "2026-07-19",
    amount: 100,
    notes: null,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  };
  const firstAttempt = buildBankrollFinanceCreateRpcParams(operation);
  const retry = buildBankrollFinanceCreateRpcParams(operation);
  assert.equal(firstAttempt.p_idempotency_key, operation.idempotencyKey);
  assert.equal(retry.p_idempotency_key, firstAttempt.p_idempotency_key);
});
