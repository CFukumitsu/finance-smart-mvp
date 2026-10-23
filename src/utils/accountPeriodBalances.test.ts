import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAccountPeriodBalances,
  getAccountPeriodBalanceReferences,
  getCompetenceStartReference,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./accountPeriodBalances.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateAccountBalanceAt } from "./financialOverview.ts";

const TODAY = "2026-10-23";
const competences = [
  { id: "c-08", year: 2026, month: 8 },
  { id: "c-09", year: 2026, month: 9 },
  { id: "c-10", year: 2026, month: 10 },
  { id: "c-11", year: 2026, month: 11 },
];
const account = (current_balance: number) => ({
  id: "acc",
  name: "Conta",
  type: "Conta" as const,
  currency: "BRL",
  current_balance,
  active: true,
});
let seq = 0;
const tx = (competence_id: string, due_date: string, type: string, value: number, status = "Pago", account_id = "acc") => ({
  id: `t${++seq}`,
  account_id,
  competence_id,
  due_date,
  type,
  value,
  status,
});

// Histórico da conta: 1.000 de saldo inicial, setembro e outubro com
// receitas, despesas (pagas e pendentes), lançamento futuro e transferências
// vinculadas de saída (Pago) e de entrada (Recebido).
const transactions = [
  tx("c-09", "2026-09-15", "Despesa", 100),
  tx("c-10", "2026-10-05", "Receita", 5000, "Recebido"),
  tx("c-10", "2026-10-12", "Despesa", 1200),
  tx("c-10", "2026-10-14", "Transferência", 700, "Pago"),
  tx("c-10", "2026-10-15", "Transferência", 250, "Recebido"),
  tx("c-10", "2026-10-20", "Despesa", 80, "Pendente"),
  tx("c-10", "2026-10-28", "Despesa", 300, "Pendente"),
  tx("c-11", "2026-11-05", "Despesa", 40, "Pendente"),
  tx("c-10", "2026-10-10", "Despesa", 999, "Pago", "outra-conta"),
];

test("referência de início de mês fica antes de qualquer data do mês", () => {
  assert.equal(getCompetenceStartReference(2026, 1), "2026-01-00");
  assert.ok("2025-12-31" < getCompetenceStartReference(2026, 1));
  assert.ok("2026-01-01" > getCompetenceStartReference(2026, 1));
  assert.deepEqual(getAccountPeriodBalanceReferences(2026, 10, TODAY), ["2026-10-00", "2026-11-00", TODAY]);
  assert.deepEqual(getAccountPeriodBalanceReferences(2026, 9, TODAY), ["2026-09-00", "2026-10-00"]);
});

test("sem fechamento: saldo inicial do cadastro entra no saldo (antes o resumo usava zero)", () => {
  const balances = calculateAccountPeriodBalances({
    account: account(1000), year: 2026, month: 10, today: TODAY, competences, closures: [], transactions,
  });
  // Início de out: 1.000 − 100 (setembro).
  assert.equal(balances.openingBalance, 900);
  // Hoje: 900 + 5.000 − 1.200 − 700 + 250 − 80 (pendente com data passada conta, como na regra existente).
  assert.equal(balances.currentBalance, 4170);
  // Fim de out (previsto): inclui o futuro de 28/10; novembro não entra.
  assert.equal(balances.closingBalance, 3870);
  assert.equal(balances.temporal, "current");
});

test("saldo atual do resumo = saldo do atalho/Visão Financeira na mesma data", () => {
  const balances = calculateAccountPeriodBalances({
    account: account(1000), year: 2026, month: 10, today: TODAY, competences, closures: [], transactions,
  });
  const shortcut = calculateAccountBalanceAt({ account: account(1000), asOf: TODAY, competences, closures: [], transactions });
  assert.equal(balances.currentBalance, shortcut);
});

test("com fechamento anterior: usa o closing_balance conferido, não o saldo inicial", () => {
  const closures = [{ account_id: "acc", competence_id: "c-09", closing_balance: 2000 }];
  const balances = calculateAccountPeriodBalances({
    account: account(1000), year: 2026, month: 10, today: TODAY, competences, closures, transactions,
  });
  assert.equal(balances.openingBalance, 2000);
  assert.equal(balances.currentBalance, 2000 + 5000 - 1200 - 700 + 250 - 80);
  assert.equal(balances.closingBalance, 2000 + 5000 - 1200 - 700 + 250 - 80 - 300);
});

test("período passado: início e fim do próprio mês, sem saldo de hoje", () => {
  const balances = calculateAccountPeriodBalances({
    account: account(1000), year: 2026, month: 9, today: TODAY, competences, closures: [], transactions,
  });
  assert.equal(balances.temporal, "past");
  assert.equal(balances.openingBalance, 1000);
  assert.equal(balances.closingBalance, 900);
  assert.equal(balances.currentBalance, null);
});

test("período passado fechado: fim do mês é o próprio fechamento", () => {
  const closures = [{ account_id: "acc", competence_id: "c-09", closing_balance: 950 }];
  const balances = calculateAccountPeriodBalances({
    account: account(1000), year: 2026, month: 9, today: TODAY, competences, closures, transactions,
  });
  assert.equal(balances.openingBalance, 1000);
  assert.equal(balances.closingBalance, 950);
});

test("período futuro: previsões a partir do fim do mês atual", () => {
  const balances = calculateAccountPeriodBalances({
    account: account(1000), year: 2026, month: 11, today: TODAY, competences, closures: [], transactions,
  });
  assert.equal(balances.temporal, "future");
  assert.equal(balances.openingBalance, 3870);
  assert.equal(balances.closingBalance, 3830);
  assert.equal(balances.currentBalance, null);
});
