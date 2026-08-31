import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { areRequiredClosuresComplete, isInvestmentAccount, requiresTraditionalAccountClosure } from "./closingAccounts.ts";

const checking = {
  id: "checking",
  type: "Conta" as const,
  show_on_investments_dashboard: false,
  investment_account_kind: null,
};
const broker = {
  id: "broker",
  type: "Conta" as const,
  show_on_investments_dashboard: true,
  investment_account_kind: null,
};
const savings = {
  id: "savings",
  type: "Conta" as const,
  show_on_investments_dashboard: true,
  investment_account_kind: "BALANCE" as const,
};
const card = {
  id: "card",
  type: "Cartão" as const,
  show_on_investments_dashboard: false,
  investment_account_kind: null,
};

test("somente conta transacional exige fechamento bancário", () => {
  assert.equal(requiresTraditionalAccountClosure(checking), true);
  assert.equal(requiresTraditionalAccountClosure(broker), false);
  assert.equal(requiresTraditionalAccountClosure(savings), false);
  assert.equal(isInvestmentAccount(broker), true);
  assert.equal(isInvestmentAccount(savings), true);
});

test("competência pode fechar sem fechamento das contas de investimento", () => {
  assert.equal(
    areRequiredClosuresComplete({
      accounts: [checking, broker, savings, card],
      closedAccountIds: new Set([checking.id]),
      closedCardIds: new Set([card.id]),
    }),
    true,
  );
});

test("conta transacional e cartão continuam obrigatórios", () => {
  assert.equal(
    areRequiredClosuresComplete({
      accounts: [checking, broker, savings, card],
      closedAccountIds: new Set(),
      closedCardIds: new Set([card.id]),
    }),
    false,
  );
  assert.equal(
    areRequiredClosuresComplete({
      accounts: [checking, broker, savings, card],
      closedAccountIds: new Set([checking.id]),
      closedCardIds: new Set(),
    }),
    false,
  );
});
