import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202610240001_brokerage_contribution_transfers.sql",
    import.meta.url,
  ),
  "utf8",
).replace(/\r\n/g, "\n");

test("só substitui resolve_transfer_accounts, com a mesma assinatura e segurança", () => {
  assert.ok(migration.includes("create or replace function public.resolve_transfer_accounts(\n  p_owner_id uuid,\n  p_origin_account_id uuid,\n  p_destination_account_id uuid,\n  p_allowed_inactive_account_ids uuid[]\n)"));
  assert.ok(migration.includes("security definer\nset search_path = pg_catalog"));
  assert.ok(migration.includes("revoke all on function public.resolve_transfer_accounts(uuid, uuid, uuid, uuid[]) from public, anon, authenticated, service_role;"));
  assert.ok(!/grant execute on function public\.resolve_transfer_accounts/i.test(migration));
  assert.equal((migration.match(/create (or replace )?function/gi) ?? []).length, 1);
});

test("sem mudança de tabela, backfill ou alteração de dados", () => {
  assert.ok(!/alter table|create table|drop table/i.test(migration));
  assert.ok(!/\b(insert into|update public\.|delete from)\b/i.test(migration));
  assert.ok(!/current_balance\s*=/.test(migration));
});

test("regras: cartão, conta por saldo, corretora <-> corretora e moeda", () => {
  assert.ok(migration.includes("raise exception 'Transferências só podem movimentar contas, não cartões.'"));
  assert.ok(migration.includes("origin_account.investment_account_kind is not null\n     or destination_account.investment_account_kind is not null"));
  assert.ok(migration.includes("if origin_is_brokerage and destination_is_brokerage then"));
  assert.ok(migration.includes("if origin_account.currency <> destination_account.currency then"));
  assert.ok(migration.includes("exigem a mesma moeda nas duas contas"));
  // Contas e titularidade continuam lidas pelo dono.
  assert.ok(migration.includes("where account_row.id = p_origin_account_id and account_row.owner_id = p_owner_id"));
  assert.ok(migration.includes("where account_row.id = p_destination_account_id and account_row.owner_id = p_owner_id"));
});
