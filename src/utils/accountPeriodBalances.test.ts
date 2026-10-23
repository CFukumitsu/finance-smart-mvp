import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAccountPeriodBalances,
  getAccountPeriodBalanceReferences,
  getCompetenceStartReference,
  getShortcutAccountBalanceReference,
  resolveAccountPeriodBalancesView,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./accountPeriodBalances.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateAccountBalanceAt, isValidIsoDate } from "./financialOverview.ts";

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

// Regressão: a referência de início de mês era "YYYY-MM-00". Ela ia para
// .lte("due_date", ...) e o Postgres (coluna date) respondia
// "22008: date/time field value out of range" → resumo "Indisponível".
test("referências de saldo são sempre datas válidas para a coluna date", () => {
  assert.deepEqual(getCompetenceStartReference(2026, 1), { asOf: "2026-01-01", exclusive: true });
  assert.deepEqual(getAccountPeriodBalanceReferences(2026, 10, TODAY), [
    { asOf: "2026-10-01", exclusive: true },
    { asOf: "2026-11-01", exclusive: true },
    { asOf: TODAY, exclusive: false },
  ]);
  // Virada de ano: fim de dezembro = antes de 01/01 do ano seguinte.
  assert.deepEqual(getAccountPeriodBalanceReferences(2026, 12, TODAY), [
    { asOf: "2026-12-01", exclusive: true },
    { asOf: "2027-01-01", exclusive: true },
  ]);
  // Todos os meses de uma década, incluindo fevereiro e anos bissextos.
  for (let year = 2020; year <= 2030; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      for (const reference of getAccountPeriodBalanceReferences(year, month, `${year}-${String(month).padStart(2, "0")}-15`)) {
        assert.ok(isValidIsoDate(reference.asOf), `${year}-${month}: ${reference.asOf}`);
      }
    }
  }
});

test("isValidIsoDate rejeita o que o Postgres rejeita", () => {
  for (const value of ["2026-10-00", "2026-02-29", "2026-02-30", "2026-13-01", "2026-04-31", "2026-1-01", ""]) {
    assert.equal(isValidIsoDate(value), false, value);
  }
  for (const value of ["2024-02-29", "2026-02-28", "2026-12-31", "2027-01-01"]) {
    assert.equal(isValidIsoDate(value), true, value);
  }
});

test("limites do mês: último dia entra no fim; dia 1 seguinte não entra", () => {
  const limits = [
    tx("c-10", "2026-09-30", "Receita", 7, "Recebido"),
    tx("c-10", "2026-10-01", "Receita", 10, "Recebido"),
    tx("c-10", "2026-10-31", "Receita", 100, "Recebido"),
    tx("c-11", "2026-11-01", "Receita", 1000, "Recebido"),
  ];
  const balances = calculateAccountPeriodBalances({
    account: account(0), year: 2026, month: 10, today: "2026-10-01", competences, closures: [], transactions: limits,
  });
  // Início de out: só o que tem data em setembro (mesmo de competência outubro).
  assert.equal(balances.openingBalance, 7);
  // Hoje (dia 1): inclui o próprio dia 1.
  assert.equal(balances.currentBalance, 17);
  // Fim de out: inclui 31/10, exclui 01/11.
  assert.equal(balances.closingBalance, 117);
});

test("fevereiro e virada de ano", () => {
  const yearCompetences = [
    { id: "c-2026-12", year: 2026, month: 12 },
    { id: "c-2027-01", year: 2027, month: 1 },
    { id: "c-2027-02", year: 2027, month: 2 },
    { id: "c-2027-03", year: 2027, month: 3 },
  ];
  const history = [
    tx("c-2026-12", "2026-12-31", "Receita", 1, "Recebido"),
    tx("c-2027-01", "2027-01-01", "Receita", 10, "Recebido"),
    tx("c-2027-02", "2027-02-28", "Receita", 100, "Recebido"),
    tx("c-2027-03", "2027-03-01", "Receita", 1000, "Recebido"),
  ];
  const january = calculateAccountPeriodBalances({
    account: account(0), year: 2027, month: 1, today: "2026-10-23", competences: yearCompetences, closures: [], transactions: history,
  });
  assert.equal(january.temporal, "future");
  assert.equal(january.openingBalance, 1);
  assert.equal(january.closingBalance, 11);
  const february = calculateAccountPeriodBalances({
    account: account(0), year: 2027, month: 2, today: "2027-02-28", competences: yearCompetences, closures: [], transactions: history,
  });
  assert.equal(february.openingBalance, 11);
  assert.equal(february.currentBalance, 111);
  assert.equal(february.closingBalance, 111);
  // Fechamento de dezembro vale a partir de janeiro.
  const closed = calculateAccountPeriodBalances({
    account: account(0), year: 2027, month: 1, today: "2026-10-23", competences: yearCompetences,
    closures: [{ account_id: "acc", competence_id: "c-2026-12", closing_balance: 500 }], transactions: history,
  });
  assert.equal(closed.openingBalance, 500);
  assert.equal(closed.closingBalance, 510);
});

test("conta em EUR/GBP: valores na moeda da conta, sem conversão", () => {
  for (const currency of ["EUR", "GBP"]) {
    const balances = calculateAccountPeriodBalances({
      account: { ...account(250), currency }, year: 2026, month: 10, today: TODAY, competences, closures: [],
      transactions: [tx("c-10", "2026-10-02", "Despesa", 40)],
    });
    assert.deepEqual(
      [balances.openingBalance, balances.currentBalance, balances.closingBalance],
      [250, 210, 210],
    );
  }
});

test("resumo só mostra o resultado da seleção atual", () => {
  const balances = calculateAccountPeriodBalances({
    account: account(1000), year: 2026, month: 10, today: TODAY, competences, closures: [], transactions,
  });
  const conta = { id: "acc", type: "Conta" as const };
  const ready = { accountId: "acc", competenceId: "c-10", status: "ready" as const, balances };

  assert.deepEqual(resolveAccountPeriodBalancesView({ selectedAccount: conta, competenceId: "c-10", request: ready }), {
    status: "ready", balances,
  });
  // Troca rápida de conta ou de mês: resultado anterior não aparece.
  assert.deepEqual(
    resolveAccountPeriodBalancesView({ selectedAccount: { id: "outra", type: "Conta" }, competenceId: "c-10", request: ready }),
    { status: "loading", balances: null },
  );
  assert.deepEqual(
    resolveAccountPeriodBalancesView({ selectedAccount: conta, competenceId: "c-09", request: ready }),
    { status: "loading", balances: null },
  );
  // Erro da seleção anterior também não vaza para a nova.
  const failed = { accountId: "acc", competenceId: "c-10", status: "error" as const, balances: null };
  assert.equal(resolveAccountPeriodBalancesView({ selectedAccount: conta, competenceId: "c-10", request: failed }).status, "error");
  assert.equal(
    resolveAccountPeriodBalancesView({ selectedAccount: { id: "outra", type: "Conta" }, competenceId: "c-10", request: failed }).status,
    "loading",
  );
  // Cartão (ou nenhuma conta) não usa estes saldos.
  assert.equal(resolveAccountPeriodBalancesView({ selectedAccount: { id: "acc", type: "Cartão" }, competenceId: "c-10", request: ready }).status, "none");
  assert.equal(resolveAccountPeriodBalancesView({ selectedAccount: null, competenceId: "c-10", request: ready }).status, "none");
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

test("atalho da conta acompanha a competência: hoje no mês atual, fim do mês nas demais", () => {
  assert.deepEqual(getShortcutAccountBalanceReference(2026, 10, TODAY), { asOf: TODAY, exclusive: false });
  assert.deepEqual(getShortcutAccountBalanceReference(2026, 9, TODAY), { asOf: "2026-10-01", exclusive: true });
  assert.deepEqual(getShortcutAccountBalanceReference(2026, 11, TODAY), { asOf: "2026-12-01", exclusive: true });
  assert.deepEqual(getShortcutAccountBalanceReference(2026, 12, TODAY), { asOf: "2027-01-01", exclusive: true });

  // Mesmo valor que o resumo inferior da conta na mesma competência.
  for (const month of [9, 10, 11]) {
    const balances = calculateAccountPeriodBalances({
      account: account(1000), year: 2026, month, today: TODAY, competences, closures: [], transactions,
    });
    const reference = getShortcutAccountBalanceReference(2026, month, TODAY);
    const shortcut = calculateAccountBalanceAt({
      account: account(1000), asOf: reference.asOf, exclusive: reference.exclusive, competences, closures: [], transactions,
    });
    assert.equal(shortcut, month === 10 ? balances.currentBalance : balances.closingBalance);
  }
});
