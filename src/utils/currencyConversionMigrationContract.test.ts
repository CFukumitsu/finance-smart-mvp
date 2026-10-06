import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202610060002_currency_conversion_transfers_phase_2.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(name: string) {
  const start = migration.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
  assert.ok(start >= 0, `função ${name} não encontrada`);
  const end = migration.indexOf("\n$$;", start);
  return migration.slice(start, end);
}

test("Fase 2 é uma migration nova; a da Fase 1 continua intacta", () => {
  const phaseOne = readFileSync(
    new URL("../../supabase/migrations/202610060001_linked_transfers_phase_1.sql", import.meta.url),
    "utf8",
  );
  assert.ok(phaseOne.includes("Transferências entre moedas diferentes ainda não estão disponíveis."));
  assert.ok(!phaseOne.includes("currency_conversions"));
});

test("conversão não duplica valores, moedas nem custo efetivo", () => {
  const tableStart = migration.indexOf("create table public.currency_conversions (");
  const table = migration.slice(tableStart, migration.indexOf(");\n", tableStart));
  assert.ok(table.includes("transfer_group_id uuid primary key"));
  for (const forbidden of ["source_amount", "destination_amount", "source_currency", "destination_currency", "effective_rate"]) {
    assert.ok(!table.includes(forbidden), `${forbidden} não deve existir em currency_conversions`);
  }
  assert.ok(!/effective_rate/.test(migration));
});

test("taxa e cotação têm CHECKs de forma com NULL explícito", () => {
  assert.ok(migration.includes("(fee_amount is null and fee_currency is null)"));
  assert.ok(migration.includes("fee_currency is not null and fee_currency ~ '^[A-Z]{3}$'"));
  assert.ok(migration.includes("quoted_rate is not null and quoted_rate > 0"));
  assert.ok(migration.includes("quoted_rate_base_currency <> quoted_rate_quote_currency"));
});

test("provedores por usuário, sem seeds e com nome único normalizado", () => {
  assert.ok(migration.includes("on public.currency_conversion_providers (owner_id, lower(btrim(name)))"));
  assert.ok(!/insert into public\.currency_conversion_providers/i.test(migration));
  assert.ok(!/'(Wise|Nomad|Revolut)'/i.test(migration));
  assert.ok(migration.includes("foreign key (owner_id, provider_id)"));
});

test("currency_conversions: leitura do dono e escrita só pelas RPCs", () => {
  assert.ok(migration.includes("on public.currency_conversions for select to authenticated\n  using (owner_id = auth.uid());"));
  assert.ok(!/on public\.currency_conversions for (insert|update|delete)/.test(migration));
  assert.ok(migration.includes("grant select on table public.currency_conversions to authenticated, service_role;"));
  assert.ok(migration.includes(
    "before insert or update or delete on public.currency_conversions\n  for each row execute function public.transfer_group_mutation_guard();",
  ));
  assert.ok(migration.includes("deferrable initially deferred\n  for each row execute function public.assert_transfer_group_invariant();"));
});

test("assinaturas antigas removidas: sem sobrecarga de create/update_transfer", () => {
  assert.ok(migration.includes("drop function public.create_transfer(uuid, uuid, date, uuid, numeric, text, uuid);"));
  assert.ok(migration.includes("drop function public.update_transfer(uuid, uuid, uuid, date, uuid, numeric, text);"));
  assert.equal(migration.match(/create function public\.create_transfer\(/g)?.length, 1);
  assert.equal(migration.match(/create function public\.update_transfer\(/g)?.length, 1);
});

test("RPCs seguem SECURITY DEFINER + auth.uid() e gravam a entrada com o valor recebido", () => {
  for (const name of ["create_transfer", "update_transfer", "delete_transfer"]) {
    const body = functionBody(name);
    assert.ok(body.includes("security definer\nset search_path = pg_catalog"), name);
    assert.ok(body.includes("authenticated_owner_id uuid := auth.uid();"), name);
  }
  assert.ok(functionBody("create_transfer").includes("conversion_info.destination_amount, 'Recebido'"));
  assert.ok(functionBody("update_transfer").includes("value = conversion_info.destination_amount"));
  assert.ok(functionBody("delete_transfer").includes("delete from public.currency_conversions conversion"));
});

test("invariante exige conversão só entre moedas confirmadas diferentes e nunca compara valores", () => {
  const invariant = functionBody("assert_transfer_group_consistent");
  assert.ok(invariant.includes("Transferência entre moedas diferentes sem dados de conversão."));
  assert.ok(invariant.includes("Transferência da mesma moeda não pode ter dados de conversão."));
  assert.ok(invariant.includes("A conversão não possui a transferência vinculada correspondente."));
  assert.ok(!/\bvalue\b/.test(invariant));
});

test("R1: confirmação de moeda NULL não pode criar grupo multimoeda sem conversão", () => {
  const guard = functionBody("protect_linked_transfer_currency_confirmation");
  assert.ok(guard.includes("if old.currency is not null or new.currency is null then"));
  assert.ok(guard.includes("counterpart_account.currency <> new.currency"));
  assert.ok(migration.includes("create trigger accounts_currency_20_linked_transfer_guard"));
});
