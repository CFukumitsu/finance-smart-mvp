import assert from "node:assert/strict";
import test from "node:test";
import type { BankrollFinanceCreateOperation, BankrollWallet, EligibleFinanceAccount, FinanceAccount } from "../types/bankroll";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildBankrollFinanceCreateRpcParams, filterActiveFinanceAccountsForOwner, filterEligibleFinanceAccountsForWallet, getConsolidatedPatrimonialEffect, getFinanceAccountEmptyMessage, getIntegratedFinanceEffect, getNewBankrollMovementSelection, isEligibleFinanceAccount, shouldLoadFinanceAccounts, validateBankrollFinanceForm } from "./bankrollFinanceIntegration.ts";

const account = { id: "a", owner_id: "o", name: "Conta", type: "Conta", currency: "BRL", active: true } as EligibleFinanceAccount;
const wallet = { id: "w", owner_id: "o", name: "Poker", wallet_type: "online", currency: "BRL", initial_balance: 0, active: true, notes: null, created_at: "", updated_at: "" } as BankrollWallet;

test("conta ativa com moeda estruturada é elegível", () => assert.equal(isEligibleFinanceAccount(account), true));
test("conta inativa não é elegível", () => assert.equal(isEligibleFinanceAccount({ ...account, active: false }), false));
test("conta sem moeda confirmada não é elegível", () => assert.equal(isEligibleFinanceAccount({ ...account, currency: null }), false));
test("cartão de crédito não é elegível", () => assert.equal(isEligibleFinanceAccount({ ...account, type: "Cartão" }), false));
test("usuário com uma conta ativa recebe a própria conta", () => {
  assert.deepEqual(
    filterActiveFinanceAccountsForOwner([account], "o").map((item) => item.id),
    ["a"]
  );
});
test("usuário com várias contas ativas recebe todas em ordem de entrada", () => {
  const second = { ...account, id: "b", name: "Reserva" };
  assert.deepEqual(
    filterActiveFinanceAccountsForOwner([account, second], "o").map((item) => item.name),
    ["Conta", "Reserva"]
  );
});
test("contas inativas e de outro owner não aparecem", () => {
  const rows: FinanceAccount[] = [
    account,
    { ...account, id: "inactive", active: false },
    { ...account, id: "other-owner", owner_id: "other" },
  ];
  assert.deepEqual(
    filterActiveFinanceAccountsForOwner(rows, "o").map((item) => item.id),
    ["a"]
  );
});
test("nova movimentação inicia sem conta e sem carteira", () => assert.deepEqual(getNewBankrollMovementSelection(), { walletId: "", financeAccountId: "" }));
test("sem carteira selecionada exibe todas as contas elegíveis", () => {
  const usdAccount = { ...account, id: "usd", currency: "USD" };
  assert.deepEqual(filterEligibleFinanceAccountsForWallet([account, usdAccount], null).map((item) => item.id), ["a", "usd"]);
});
test("após seleção manual filtra contas pela moeda da carteira", () => {
  const usdAccount = { ...account, id: "usd", currency: "USD" };
  assert.deepEqual(filterEligibleFinanceAccountsForWallet([account, usdAccount], wallet).map((item) => item.id), ["a"]);
});
test("troca para Integrado dispara carga em depósito e saque", () => {
  assert.equal(shouldLoadFinanceAccounts({ open: true, mode: "integrated", type: "deposit" }), true);
  assert.equal(shouldLoadFinanceAccounts({ open: true, mode: "integrated", type: "withdrawal" }), true);
});
test("modo Manual não dispara carga de contas", () => {
  assert.equal(shouldLoadFinanceAccounts({ open: true, mode: "bankroll_only", type: "deposit" }), false);
});
test("fechar interrompe a carga e reabrir volta a habilitá-la", () => {
  assert.equal(shouldLoadFinanceAccounts({ open: false, mode: "integrated", type: "deposit" }), false);
  assert.equal(shouldLoadFinanceAccounts({ open: true, mode: "integrated", type: "deposit" }), true);
});
test("ausência de conta válida produz mensagem em vez de campo vazio", () => {
  assert.equal(
    getFinanceAccountEmptyMessage([], wallet),
    "Nenhuma conta financeira ativa foi encontrada."
  );
  assert.match(
    getFinanceAccountEmptyMessage([{ ...account, currency: null }], wallet) ?? "",
    /moeda confirmada/i
  );
});
test("conta ativa compatível não produz mensagem de ausência", () => {
  assert.equal(getFinanceAccountEmptyMessage([account], wallet), null);
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
