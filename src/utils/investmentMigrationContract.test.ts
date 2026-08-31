import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202608310001_investment_balance_accounts.sql",
    import.meta.url,
  ),
  "utf8",
);

test("aplicação e resgate persistem uma única linha que aponta somente para a conta financeira", () => {
  assert.ok(migration.includes("account_id, description, due_date, type, mode"));
  assert.ok(migration.includes("authenticated_owner_id,\n      competence_row.id,\n      financial_account.id"));
  assert.ok(migration.includes("destination_account_id is null"));
  assert.ok(!migration.includes("destination_account_id = investment_account.id"));
});

test("saldo inicial, rendimento e ajuste não admitem contrapartida financeira", () => {
  assert.ok(migration.includes("event_type in ('opening_balance', 'yield', 'positive_adjustment')"));
  assert.ok(migration.includes("financial_account_id is null\n        and finance_transaction_id is null\n        and integration_group_id is null"));
});

test("saldo da conta de investimento é derivado exclusivamente dos eventos", () => {
  assert.ok(migration.includes("from public.investment_account_events event"));
  assert.ok(migration.includes("event.investment_account_id = p_account_id"));
  assert.ok(migration.includes("coalesce(current_balance, 0) = 0"));
  assert.ok(migration.includes("create unique index accounts_owner_id_id_investment_key"));
});

test("RPC de criação serializa a idempotência e restringe duplicidades", () => {
  assert.ok(migration.includes("pg_advisory_xact_lock"));
  assert.ok(migration.includes("unique (owner_id, idempotency_key)"));
  assert.ok(migration.includes("create unique index investment_account_events_group_key"));
  assert.ok(migration.includes("create unique index investment_account_events_finance_transaction_key"));
  assert.ok(migration.includes("create unique index investment_account_events_single_opening_balance_key"));
});

test("lançamentos integrados e eventos rejeitam mutação isolada", () => {
  assert.match(
    migration,
    /Movimentações de contas de investimento devem ser alteradas pelas RPCs oficiais/,
  );
  assert.match(
    migration,
    /Esta transferência pertence a uma conta de investimento e deve ser alterada no módulo de Investimentos/,
  );
});
