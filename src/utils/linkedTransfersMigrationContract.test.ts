import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202610060001_linked_transfers_phase_1.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(name: string) {
  const start = migration.indexOf(`create function public.${name}(`);
  assert.ok(start >= 0, `função ${name} não encontrada`);
  const end = migration.indexOf("\n$$;", start);
  return migration.slice(start, end);
}

test("transfer_group_id é nullable, sem default e sem backfill", () => {
  assert.ok(migration.includes("alter table public.transactions\n  add column transfer_group_id uuid;"));
  assert.ok(!/transfer_group_id\s+uuid[^;\n]*(default|not null)/i.test(migration));
  assert.ok(!/set\s+transfer_group_id/i.test(migration));
  assert.ok(!/update\s+public\.transactions\s+set/i.test(migration));
});

test("índices permitem duas pontas por grupo e consulta por dono", () => {
  assert.ok(migration.includes(
    "create unique index transactions_transfer_group_leg_key\n  on public.transactions (transfer_group_id, status)\n  where transfer_group_id is not null;",
  ));
  assert.ok(migration.includes(
    "create index transactions_owner_transfer_group_idx\n  on public.transactions (owner_id, transfer_group_id)",
  ));
  assert.ok(!/unique index[^;]*\(transfer_group_id\)/i.test(migration));
});

test("schema identifica as pontas pela estrutura e não exige valores iguais (Fase 2)", () => {
  const constraintStart = migration.indexOf("add constraint transactions_transfer_group_check");
  const constraint = migration.slice(constraintStart, migration.indexOf(");\n", constraintStart));
  assert.ok(constraint.includes("status = 'Pago' and account_id = origin_account_id"));
  assert.ok(constraint.includes("status = 'Recebido' and account_id = destination_account_id"));
  assert.ok(!constraint.includes("value"));
  assert.ok(!functionBody("assert_transfer_group_consistent").includes("value"));
});

test("RPCs públicas são SECURITY DEFINER com search_path fixo e auth.uid()", () => {
  for (const name of ["create_transfer", "update_transfer", "delete_transfer"]) {
    const body = functionBody(name);
    assert.ok(body.includes("security definer\nset search_path = pg_catalog"), name);
    assert.ok(body.includes("authenticated_owner_id uuid := auth.uid();"), name);
    assert.ok(body.includes("raise exception 'Usuário não autenticado.'"), name);
    assert.ok(!/p_owner_id/.test(body.split("as $$")[0]), `${name} não aceita owner do cliente`);
    assert.ok(!/\bexecute\s+format|\bexecute\s+'/i.test(body), `${name} sem SQL dinâmico`);
  }
});

test("somente authenticated executa as RPCs; helpers ficam privados", () => {
  assert.ok(migration.includes("grant execute on function public.create_transfer(uuid, uuid, date, uuid, numeric, text, uuid) to authenticated;"));
  assert.ok(migration.includes("grant execute on function public.update_transfer(uuid, uuid, uuid, date, uuid, numeric, text) to authenticated;"));
  assert.ok(migration.includes("grant execute on function public.delete_transfer(uuid) to authenticated;"));
  const grants = migration.match(/grant execute on function public\.\w+/g) ?? [];
  assert.deepEqual(grants.map((grant) => grant.split("public.")[1]).sort(), [
    "create_transfer",
    "delete_transfer",
    "update_transfer",
  ]);
});

test("moeda vem do banco e diferentes moedas são bloqueadas também na edição", () => {
  const accounts = functionBody("resolve_transfer_accounts");
  assert.ok(accounts.includes("from public.accounts account_row"));
  assert.ok(accounts.includes("origin_account.currency <> destination_account.currency"));
  assert.ok(accounts.includes("Transferências entre moedas diferentes ainda não estão disponíveis."));
  assert.ok(accounts.includes("p_origin_account_id = p_destination_account_id"));
  assert.ok(functionBody("create_transfer").includes("public.resolve_transfer_accounts("));
  assert.ok(functionBody("update_transfer").includes("public.resolve_transfer_accounts("));
});

test("status das pontas é fixo: saída Pago e entrada Recebido, sem cálculo por data", () => {
  for (const name of ["create_transfer", "update_transfer"]) {
    const body = functionBody(name);
    assert.ok(body.includes("'Pago'"), name);
    assert.ok(body.includes("'Recebido'"), name);
    assert.ok(!body.includes("'Pendente'"), name);
    assert.ok(!body.includes("current_date"), name);
  }
});

test("criação é idempotente pela chave e atômica numa única função", () => {
  const body = functionBody("create_transfer");
  assert.ok(body.includes("new_group_id uuid := p_idempotency_key;"));
  assert.ok(body.includes("perform public.lock_transfer_group(new_group_id);"));
  assert.ok(body.includes("A chave de idempotência já foi usada com dados diferentes."));
  assert.equal(body.match(/insert into public\.transactions/g)?.length, 2);
});

test("exclusão remove o grupo inteiro e não usa CASCADE novo", () => {
  const body = functionBody("delete_transfer");
  assert.ok(body.includes("movement.transfer_group_id = p_transfer_group_id"));
  assert.ok(body.includes("if affected <> 2 then"));
  assert.ok(body.includes("public.account_closures"));
  assert.ok(body.includes("public.credit_card_statements"));
  assert.ok(body.includes("public.transaction_reconciliations"));
  assert.ok(!/on delete cascade/i.test(migration));
});

test("guard bloqueia escrita direta somente em linhas vinculadas", () => {
  const guard = functionBody("transfer_group_mutation_guard");
  assert.ok(guard.includes("current_setting('app.transfer_group_mutation', true) is distinct from 'on'"));
  assert.ok(guard.includes("new.transfer_group_id is not null"));
  assert.ok(guard.includes("old.transfer_group_id is not null"));
  assert.ok(migration.includes("deferrable initially deferred\n  for each row execute function public.assert_transfer_group_invariant();"));
});
