\set ON_ERROR_STOP on

-- Finance Smart - Fase 1: transferências vinculadas.
-- Testes transacionais para banco Supabase LOCAL isolado, após aplicar
-- 202610060001_linked_transfers_phase_1.sql. Tudo é desfeito pelo ROLLBACK.
-- Execução sugerida:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/linked_transfers_phase_1_test.sql
-- Este arquivo não deve ser executado em DEV ou PROD.

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'FALHOU: %', p_message;
  end if;
  raise notice 'OK: %', p_message;
end $$;

create or replace function pg_temp.expect_error(
  p_sql text,
  p_expected_state text,
  p_expected_message text,
  p_test_name text
) returns void language plpgsql as $$
declare
  actual_state text;
  actual_message text;
begin
  begin
    execute p_sql;
    set constraints all immediate;
    raise exception 'FALHOU: % (nenhum erro)', p_test_name;
  exception when others then
    get stacked diagnostics
      actual_state = returned_sqlstate,
      actual_message = message_text;
    if actual_message like 'FALHOU:%' then raise; end if;
    if actual_state <> p_expected_state
       or position(p_expected_message in actual_message) = 0 then
      raise exception 'FALHOU: % (recebido [%] %, esperado [%] contendo %)',
        p_test_name, actual_state, actual_message,
        p_expected_state, p_expected_message;
    end if;
    raise notice 'OK: %', p_test_name;
  end;
  set constraints all deferred;
end $$;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000', 'af000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'transfer-a@example.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', 'af000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 'transfer-b@example.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.accounts(id, owner_id, name, type, currency, current_balance, active, show_on_investments_dashboard) values
  ('af100000-0000-0000-0000-000000000001', 'af000000-0000-0000-0000-000000000001', 'ITAÚ', 'Conta', 'BRL', 0, true, false),
  ('af100000-0000-0000-0000-000000000002', 'af000000-0000-0000-0000-000000000001', 'BMG', 'Conta', 'BRL', 0, true, false),
  ('af100000-0000-0000-0000-000000000003', 'af000000-0000-0000-0000-000000000001', 'NUBANK', 'Conta', 'BRL', 0, true, false),
  ('af100000-0000-0000-0000-000000000004', 'af000000-0000-0000-0000-000000000001', 'WISE EURO', 'Conta', 'EUR', 0, true, false),
  ('af100000-0000-0000-0000-000000000005', 'af000000-0000-0000-0000-000000000001', 'WISE EURO 2', 'Conta', 'EUR', 0, true, false),
  ('af100000-0000-0000-0000-000000000006', 'af000000-0000-0000-0000-000000000001', 'WISE GBP', 'Conta', 'GBP', 0, true, false),
  ('af100000-0000-0000-0000-000000000007', 'af000000-0000-0000-0000-000000000001', 'REVOLUT GBP', 'Conta', 'GBP', 0, true, false),
  ('af100000-0000-0000-0000-000000000008', 'af000000-0000-0000-0000-000000000001', 'CARTÃO', 'Cartão', 'BRL', 0, true, false),
  ('af100000-0000-0000-0000-000000000009', 'af000000-0000-0000-0000-000000000001', 'INVESTIMENTO', 'Conta', 'BRL', 0, true, true),
  ('af100000-0000-0000-0000-000000000010', 'af000000-0000-0000-0000-000000000001', 'INATIVA', 'Conta', 'BRL', 0, false, false),
  ('af100000-0000-0000-0000-000000000011', 'af000000-0000-0000-0000-000000000001', 'LEGADA 1', 'Conta', null, 0, true, false),
  ('af100000-0000-0000-0000-000000000012', 'af000000-0000-0000-0000-000000000001', 'LEGADA 2', 'Conta', null, 0, true, false),
  ('af100000-0000-0000-0000-000000000013', 'af000000-0000-0000-0000-000000000001', 'USD', 'Conta', 'USD', 0, true, false),
  ('af100000-0000-0000-0000-000000000021', 'af000000-0000-0000-0000-000000000002', 'CONTA B', 'Conta', 'BRL', 0, true, false);

insert into public.competences(owner_id, year, month, name, status, start_date, end_date)
select owner_id, year, month, format('%s-%s', year, lpad(month::text, 2, '0')), 'ABERTA',
       make_date(year, month, 1), (make_date(year, month, 1) + interval '1 month - 1 day')::date
  from (values
    ('af000000-0000-0000-0000-000000000001'::uuid, 2026, 10),
    ('af000000-0000-0000-0000-000000000001'::uuid, 2026, 11),
    ('af000000-0000-0000-0000-000000000001'::uuid, 2027, 1),
    ('af000000-0000-0000-0000-000000000002'::uuid, 2026, 10)
  ) as item(owner_id, year, month)
on conflict (owner_id, year, month) do nothing;

create temporary table test_ids(label text primary key, id uuid) on commit drop;
insert into test_ids
select 'A:' || competence.name, competence.id from public.competences competence
 where competence.owner_id = 'af000000-0000-0000-0000-000000000001'
   and competence.name in ('2026-10', '2026-11', '2027-01')
union all
select 'B:' || competence.name, competence.id from public.competences competence
 where competence.owner_id = 'af000000-0000-0000-0000-000000000002'
   and competence.name = '2026-10';
grant all on table test_ids to authenticated;

create or replace function pg_temp.tid(p_label text) returns uuid language sql as $$
  select id from test_ids where label = p_label
$$;

-- Força falha na inserção da segunda ponta para provar a atomicidade.
create function public.test_fail_incoming_leg() returns trigger language plpgsql as $$
begin
  if new.transfer_group_id = 'af900000-0000-0000-0000-00000000fa11' and new.status = 'Recebido' then
    raise exception 'falha simulada na ponta de entrada' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger zz_test_fail_incoming_leg before insert on public.transactions
  for each row execute function public.test_fail_incoming_leg();

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
select pg_temp.assert_true(
  has_function_privilege('authenticated', 'public.create_transfer'::regproc::oid, 'execute')
  and has_function_privilege('authenticated', 'public.update_transfer'::regproc::oid, 'execute')
  and has_function_privilege('authenticated', 'public.delete_transfer(uuid)', 'execute'),
  'authenticated executa as três RPCs públicas');
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.create_transfer'::regproc::oid, 'execute')
  and not has_function_privilege('anon', 'public.delete_transfer(uuid)', 'execute'),
  'anon não executa as RPCs');
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.resolve_transfer_accounts(uuid, uuid, uuid, uuid[])', 'execute')
  and not has_function_privilege('authenticated', 'public.lock_transfer_group(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.assert_transfer_group_consistent(uuid)', 'execute'),
  'helpers internos não são expostos');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);

select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000002',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1000, 'Sem login', 'af900000-0000-0000-0000-000000000000')
$sql$, '42501', 'Usuário não autenticado', 'sem autenticação é bloqueado');

select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000001', true);

-- ---------------------------------------------------------------------------
-- Criação
-- ---------------------------------------------------------------------------
create temporary table created_transfer on commit drop as
select * from public.create_transfer(
  'af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000002',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 1000, 'Reserva mensal',
  'af900000-0000-0000-0000-000000000001');

select pg_temp.assert_true((select group_id = 'af900000-0000-0000-0000-000000000001' from created_transfer),
  'BRL -> BRL: chave idempotente vira o transfer_group_id');
select pg_temp.assert_true(
  (select count(*) = 2 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000001'),
  'BRL -> BRL: exatamente duas transactions');
select pg_temp.assert_true(exists (
  select 1 from public.transactions movement, created_transfer created
   where movement.id = created.outgoing_id
     and movement.transfer_group_id = created.group_id
     and movement.account_id = 'af100000-0000-0000-0000-000000000001'
     and movement.origin_account_id = 'af100000-0000-0000-0000-000000000001'
     and movement.destination_account_id = 'af100000-0000-0000-0000-000000000002'
     and movement.type = 'Transferência' and movement.status = 'Pago' and movement.mode = 'unico'
     and movement.category_id is null and movement.value = 1000
     and movement.due_date = date '2026-10-05' and movement.competence_id = pg_temp.tid('A:2026-10')
     and movement.description = 'Reserva mensal'),
  'BRL -> BRL: saída Pago na conta de origem');
select pg_temp.assert_true(exists (
  select 1 from public.transactions movement, created_transfer created
   where movement.id = created.incoming_id
     and movement.transfer_group_id = created.group_id
     and movement.account_id = 'af100000-0000-0000-0000-000000000002'
     and movement.origin_account_id = 'af100000-0000-0000-0000-000000000001'
     and movement.destination_account_id = 'af100000-0000-0000-0000-000000000002'
     and movement.type = 'Transferência' and movement.status = 'Recebido'
     and movement.value = 1000
     and movement.due_date = date '2026-10-05' and movement.competence_id = pg_temp.tid('A:2026-10')
     and movement.description = 'Reserva mensal'),
  'BRL -> BRL: entrada Recebido na conta de destino, mesmo valor/data/competência');

select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000003',
  date '2027-01-15', pg_temp.tid('A:2027-01'), 50, '   ', 'af900000-0000-0000-0000-000000000002');
select pg_temp.assert_true(
  (select count(*) = 1 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000002' and status = 'Pago' and account_id = 'af100000-0000-0000-0000-000000000001')
  and (select count(*) = 1 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000002' and status = 'Recebido' and account_id = 'af100000-0000-0000-0000-000000000003'),
  'data futura: saída continua Pago e entrada continua Recebido');
select pg_temp.assert_true(
  (select description = 'Transferência para NUBANK' from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000002' and status = 'Pago')
  and (select description = 'Transferência recebida de ITAÚ' from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000002' and status = 'Recebido'),
  'descrição vazia usa o texto padrão de cada ponta');

select public.create_transfer('af100000-0000-0000-0000-000000000004', 'af100000-0000-0000-0000-000000000005',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 241.69, 'EUR', 'af900000-0000-0000-0000-000000000003');
select pg_temp.assert_true(
  (select count(*) = 2 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000003'),
  'EUR -> EUR: sucesso');
select public.create_transfer('af100000-0000-0000-0000-000000000006', 'af100000-0000-0000-0000-000000000007',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 80, 'GBP', 'af900000-0000-0000-0000-000000000004');
select pg_temp.assert_true(
  (select count(*) = 2 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000004'),
  'GBP -> GBP: sucesso');
select public.create_transfer('af100000-0000-0000-0000-000000000011', 'af100000-0000-0000-0000-000000000012',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 10, 'Legadas', 'af900000-0000-0000-0000-000000000005');
select pg_temp.assert_true(
  (select count(*) = 2 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000005'),
  'duas contas legadas sem moeda mantêm o comportamento anterior');

select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000004',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'af900000-0000-0000-0000-000000000010')
$sql$, '22023', 'moedas diferentes', 'BRL -> EUR bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000006',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'af900000-0000-0000-0000-000000000011')
$sql$, '22023', 'moedas diferentes', 'BRL -> GBP bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000004', 'af100000-0000-0000-0000-000000000006',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'af900000-0000-0000-0000-000000000012')
$sql$, '22023', 'moedas diferentes', 'EUR -> GBP bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000013', 'af100000-0000-0000-0000-000000000004',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'af900000-0000-0000-0000-000000000013')
$sql$, '22023', 'moedas diferentes', 'USD -> EUR bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000011', 'af100000-0000-0000-0000-000000000001',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 10, 'x', 'af900000-0000-0000-0000-000000000014')
$sql$, '22023', 'Confirme a moeda', 'conta sem moeda -> conta com moeda bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000001',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 10, 'x', 'af900000-0000-0000-0000-000000000015')
$sql$, '22023', 'diferente da conta de destino', 'origem == destino bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000008',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 10, 'x', 'af900000-0000-0000-0000-000000000016')
$sql$, '22023', 'não cartões', 'cartão não participa de transferência');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000009',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 10, 'x', 'af900000-0000-0000-0000-000000000017')
$sql$, '22023', 'módulo Investimentos', 'conta de investimento bloqueada');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000010',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 10, 'x', 'af900000-0000-0000-0000-000000000018')
$sql$, '22023', 'inativa', 'conta inativa bloqueada na criação');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000021',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 10, 'x', 'af900000-0000-0000-0000-000000000019')
$sql$, '42501', 'não encontrada', 'conta de outro usuário bloqueada');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000002',
    date '2026-10-05', pg_temp.tid('B:2026-10'), 10, 'x', 'af900000-0000-0000-0000-00000000001a')
$sql$, '42501', 'Competência não encontrada', 'competência de outro usuário bloqueada');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000002',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 0, 'x', 'af900000-0000-0000-0000-00000000001b')
$sql$, '22023', 'maior que zero', 'valor zero bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000002',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 10, 'x', null)
$sql$, '22023', 'chave idempotente', 'chave idempotente obrigatória');
select pg_temp.assert_true(
  (select count(*) = 0 from public.transactions where transfer_group_id::text like 'af900000-0000-0000-0000-0000000000_%'
     and transfer_group_id not in ('af900000-0000-0000-0000-000000000001', 'af900000-0000-0000-0000-000000000002',
       'af900000-0000-0000-0000-000000000003', 'af900000-0000-0000-0000-000000000004', 'af900000-0000-0000-0000-000000000005')),
  'tentativas bloqueadas não deixam pontas gravadas');

-- ---------------------------------------------------------------------------
-- Atomicidade
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000002',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 77, 'Falha', 'af900000-0000-0000-0000-00000000fa11')
$sql$, 'P0001', 'falha simulada', 'falha na segunda ponta aborta a criação');
select pg_temp.assert_true(
  (select count(*) = 0 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-00000000fa11'),
  'falha na criação: nenhuma ponta persiste');

-- ---------------------------------------------------------------------------
-- Duplo envio (idempotência)
-- ---------------------------------------------------------------------------
create temporary table repeated_transfer on commit drop as
select * from public.create_transfer(
  'af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000002',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 1000, 'Reserva mensal',
  'af900000-0000-0000-0000-000000000001');
select pg_temp.assert_true(
  (select repeated.outgoing_id = created.outgoing_id and repeated.incoming_id = created.incoming_id
     from repeated_transfer repeated, created_transfer created),
  'duplo envio devolve a mesma transferência');
select pg_temp.assert_true(
  (select count(*) = 2 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000001'),
  'duplo envio não duplica pontas');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000002',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 999, 'Reserva mensal', 'af900000-0000-0000-0000-000000000001')
$sql$, '23505', 'dados diferentes', 'mesma chave com dados diferentes é rejeitada');

-- ---------------------------------------------------------------------------
-- Guard de alteração individual
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($sql$
  update public.transactions set value = 1 where id = (select outgoing_id from created_transfer)
$sql$, '42501', 'fluxo de transferências', 'update direto em ponta vinculada bloqueado');
select pg_temp.expect_error($sql$
  delete from public.transactions where id = (select incoming_id from created_transfer)
$sql$, '42501', 'fluxo de transferências', 'delete direto em ponta vinculada bloqueado');
select pg_temp.expect_error($sql$
  insert into public.transactions(owner_id, competence_id, account_id, description, due_date, type, mode, value, status,
    origin_account_id, destination_account_id, transfer_group_id)
  values ('af000000-0000-0000-0000-000000000001', pg_temp.tid('A:2026-10'), 'af100000-0000-0000-0000-000000000001', 'forjada',
    date '2026-10-05', 'Transferência', 'unico', 1, 'Pago', 'af100000-0000-0000-0000-000000000001',
    'af100000-0000-0000-0000-000000000002', 'af900000-0000-0000-0000-0000000000ff')
$sql$, '42501', 'fluxo de transferências', 'insert direto com transfer_group_id bloqueado');

-- ---------------------------------------------------------------------------
-- Legado (transfer_group_id NULL) continua no fluxo antigo
-- ---------------------------------------------------------------------------
insert into public.transactions(owner_id, competence_id, account_id, description, due_date, type, mode, value, status,
  category_id, origin_account_id, destination_account_id) values
  ('af000000-0000-0000-0000-000000000001', pg_temp.tid('A:2026-10'), 'af100000-0000-0000-0000-000000000001',
   'Legada', date '2026-10-01', 'Transferência', 'unico', 300, 'Pago', null,
   'af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000002'),
  ('af000000-0000-0000-0000-000000000001', pg_temp.tid('A:2026-10'), 'af100000-0000-0000-0000-000000000002',
   'Legada', date '2026-10-01', 'Transferência', 'unico', 300, 'Recebido', null,
   'af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000002');
select pg_temp.expect_error($sql$
  update public.transactions set transfer_group_id = 'af900000-0000-0000-0000-000000000001'
   where owner_id = 'af000000-0000-0000-0000-000000000001' and description = 'Legada' and status = 'Pago'
$sql$, '42501', 'fluxo de transferências', 'legado não pode ser anexado a um grupo por update direto');
update public.transactions set due_date = date '2026-10-02', status = 'Recebido'
 where owner_id = 'af000000-0000-0000-0000-000000000001' and description = 'Legada' and status = 'Recebido';
select pg_temp.assert_true(
  (select count(*) = 1 from public.transactions where description = 'Legada' and due_date = date '2026-10-02' and transfer_group_id is null),
  'legado: insert/update direto continua permitido e sem vínculo');
delete from public.transactions where description = 'Legada' and status = 'Pago';
select pg_temp.assert_true(
  (select count(*) = 1 from public.transactions where description = 'Legada'),
  'legado: exclusão individual continua permitida');

-- ---------------------------------------------------------------------------
-- Edição
-- ---------------------------------------------------------------------------
-- O frontend obtém o grupo a partir de qualquer ponta; aqui, pela ponta Recebido.
select public.update_transfer(
  (select transfer_group_id from public.transactions where id = (select incoming_id from created_transfer)),
  'af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000002',
  date '2026-11-03', pg_temp.tid('A:2026-11'), 1250.50, 'Reserva ajustada');
select pg_temp.assert_true(
  (select count(*) = 2 from public.transactions movement
    where movement.transfer_group_id = 'af900000-0000-0000-0000-000000000001'
      and movement.value = 1250.50 and movement.due_date = date '2026-11-03'
      and movement.competence_id = pg_temp.tid('A:2026-11') and movement.description = 'Reserva ajustada'),
  'editar valor/data/competência/descrição atualiza as duas pontas');
select pg_temp.assert_true(
  (select status = 'Pago' and account_id = 'af100000-0000-0000-0000-000000000001' from public.transactions where id = (select outgoing_id from created_transfer))
  and (select status = 'Recebido' and account_id = 'af100000-0000-0000-0000-000000000002' from public.transactions where id = (select incoming_id from created_transfer)),
  'edição preserva saída Pago e entrada Recebido (ids preservados)');

select public.update_transfer('af900000-0000-0000-0000-000000000001',
  'af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000003',
  date '2027-01-20', pg_temp.tid('A:2027-01'), 1250.50, 'Reserva ajustada');
select pg_temp.assert_true(
  (select account_id = 'af100000-0000-0000-0000-000000000003' and destination_account_id = 'af100000-0000-0000-0000-000000000003'
     and origin_account_id = 'af100000-0000-0000-0000-000000000001' and status = 'Recebido'
     from public.transactions where id = (select incoming_id from created_transfer))
  and (select account_id = 'af100000-0000-0000-0000-000000000001' and destination_account_id = 'af100000-0000-0000-0000-000000000003' and status = 'Pago'
     from public.transactions where id = (select outgoing_id from created_transfer)),
  'alterar destino (ITAÚ -> NUBANK) mantém as duas pontas coerentes, inclusive com data futura');

select pg_temp.expect_error($sql$
  select public.update_transfer('af900000-0000-0000-0000-000000000001',
    'af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000004',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x')
$sql$, '22023', 'moedas diferentes', 'editar para destino de outra moeda (ITAÚ -> WISE EURO) bloqueado');
select pg_temp.expect_error($sql$
  select public.update_transfer('af900000-0000-0000-0000-000000000001',
    'af100000-0000-0000-0000-000000000003', 'af100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x')
$sql$, '22023', 'diferente da conta de destino', 'editar para origem == destino bloqueado');
select pg_temp.assert_true(
  (select count(*) = 2 from public.transactions movement
    where movement.transfer_group_id = 'af900000-0000-0000-0000-000000000001'
      and movement.value = 1250.50 and movement.due_date = date '2027-01-20'),
  'edição bloqueada não altera nenhuma ponta');

select public.update_transfer('af900000-0000-0000-0000-000000000001',
  'af100000-0000-0000-0000-000000000003', 'af100000-0000-0000-0000-000000000001',
  date '2026-10-06', pg_temp.tid('A:2026-10'), 10, '');
select pg_temp.assert_true(
  (select account_id = 'af100000-0000-0000-0000-000000000003' and status = 'Pago' and description = 'Transferência para ITAÚ'
     from public.transactions where id = (select outgoing_id from created_transfer))
  and (select account_id = 'af100000-0000-0000-0000-000000000001' and status = 'Recebido' and description = 'Transferência recebida de NUBANK'
     from public.transactions where id = (select incoming_id from created_transfer)),
  'inverter o sentido mantém saída Pago na nova origem e entrada Recebido no novo destino');

reset role;
update public.accounts set active = false where id = 'af100000-0000-0000-0000-000000000003';
set local role authenticated;
select public.update_transfer('af900000-0000-0000-0000-000000000001',
  'af100000-0000-0000-0000-000000000003', 'af100000-0000-0000-0000-000000000001',
  date '2026-10-07', pg_temp.tid('A:2026-10'), 11, 'Conta já inativada');
select pg_temp.assert_true(
  (select count(*) = 2 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000001' and value = 11),
  'transferência com conta inativada continua editável sem trocar a conta');
select pg_temp.expect_error($sql$
  select public.update_transfer('af900000-0000-0000-0000-000000000003',
    'af100000-0000-0000-0000-000000000004', 'af100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1, 'x')
$sql$, '22023', 'inativa', 'não é possível mover transferência para conta inativa');
reset role;
update public.accounts set active = true where id = 'af100000-0000-0000-0000-000000000003';
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Isolamento entre usuários
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000002', true);
select pg_temp.expect_error($sql$
  select public.update_transfer('af900000-0000-0000-0000-000000000001',
    'af100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000002',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1, 'invasão')
$sql$, '42501', 'não encontrada', 'outro usuário não edita a transferência');
select pg_temp.expect_error($sql$
  select public.delete_transfer('af900000-0000-0000-0000-000000000001')
$sql$, '42501', 'não encontrada', 'outro usuário não exclui a transferência');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000021', 'af100000-0000-0000-0000-000000000001',
    date '2026-10-05', pg_temp.tid('B:2026-10'), 1, 'x', 'af900000-0000-0000-0000-000000000001')
$sql$, '23505', 'dados diferentes', 'chave de outro usuário não é reaproveitada nem revelada');
select pg_temp.assert_true(
  (select count(*) = 0 from public.transactions where transfer_group_id is not null),
  'RLS: outro usuário não enxerga as pontas');
select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000001', true);

-- ---------------------------------------------------------------------------
-- Períodos fechados
-- ---------------------------------------------------------------------------
reset role;
insert into public.account_closures(owner_id, account_id, competence_id, account_type, status, closing_balance)
values ('af000000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000007',
        pg_temp.tid('A:2026-10'), 'Conta', 'Fechada', 0);
set local role authenticated;
select pg_temp.expect_error($sql$
  select public.update_transfer('af900000-0000-0000-0000-000000000004',
    'af100000-0000-0000-0000-000000000006', 'af100000-0000-0000-0000-000000000007',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 99, 'GBP')
$sql$, '55000', 'fechada', 'editar ponta em conta fechada é bloqueado');
select pg_temp.expect_error($sql$
  select public.delete_transfer('af900000-0000-0000-0000-000000000004')
$sql$, '55000', 'fechada', 'excluir ponta em conta fechada é bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('af100000-0000-0000-0000-000000000006', 'af100000-0000-0000-0000-000000000007',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 5, 'GBP', 'af900000-0000-0000-0000-00000000001c')
$sql$, '55000', 'fechada', 'criar com destino em conta fechada é bloqueado');
select pg_temp.assert_true(
  (select count(*) = 2 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000004' and value = 80),
  'transferência em período fechado permanece intacta');

-- ---------------------------------------------------------------------------
-- Exclusão
-- ---------------------------------------------------------------------------
reset role;
insert into public.transaction_reconciliations(account_id, competence_id, import_key, statement_date,
  statement_description, statement_value, transaction_id)
select 'af100000-0000-0000-0000-000000000005', pg_temp.tid('A:2026-10'), 'test', date '2026-10-05', 'EUR', 241.69, movement.id
  from public.transactions movement
 where movement.transfer_group_id = 'af900000-0000-0000-0000-000000000003' and movement.status = 'Recebido';
set local role authenticated;
select pg_temp.expect_error($sql$
  select public.delete_transfer('af900000-0000-0000-0000-000000000003')
$sql$, '23503', 'conciliação', 'referência sem CASCADE bloqueia a exclusão');
select pg_temp.assert_true(
  (select count(*) = 2 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000003'),
  'exclusão bloqueada não remove nenhuma ponta');

select public.delete_transfer(
  (select transfer_group_id from public.transactions where id = (select outgoing_id from created_transfer)));
select pg_temp.assert_true(
  (select count(*) = 0 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000001'),
  'excluir pela ponta Pago remove as duas pontas');

select public.delete_transfer(
  (select transfer_group_id from public.transactions
    where transfer_group_id = 'af900000-0000-0000-0000-000000000002' and status = 'Recebido'));
select pg_temp.assert_true(
  (select count(*) = 0 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000002'),
  'excluir pela ponta Recebido remove as duas pontas');

select pg_temp.expect_error($sql$
  select public.delete_transfer('af900000-0000-0000-0000-000000000001')
$sql$, '42501', 'não encontrada', 'excluir de novo informa transferência não encontrada');

-- ---------------------------------------------------------------------------
-- Invariantes estruturais (mesmo com o guard liberado)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.expect_error($sql$
  select set_config('app.transfer_group_mutation', 'on', true);
  delete from public.transactions
   where transfer_group_id = 'af900000-0000-0000-0000-000000000005' and status = 'Pago';
$sql$, '23514', 'exatamente uma saída e uma entrada', 'grupo não pode ficar com uma ponta só');
select pg_temp.expect_error($sql$
  select set_config('app.transfer_group_mutation', 'on', true);
  update public.transactions set type = 'Receita', status = 'Recebido'
   where transfer_group_id = 'af900000-0000-0000-0000-000000000005' and status = 'Pago';
$sql$, '23514', 'transactions_transfer_group_check', 'ponta vinculada não vira Receita/Despesa');
select pg_temp.expect_error($sql$
  select set_config('app.transfer_group_mutation', 'on', true);
  update public.transactions set destination_account_id = 'af100000-0000-0000-0000-000000000001'
   where transfer_group_id = 'af900000-0000-0000-0000-000000000005' and status = 'Pago';
$sql$, '23514', 'inconsistentes', 'pontas não podem divergir de origem/destino');

-- Fase 2: o schema não exige valores iguais; só a RPC da Fase 1 exige.
select set_config('app.transfer_group_mutation', 'on', true);
update public.transactions set value = 1.23
 where transfer_group_id = 'af900000-0000-0000-0000-000000000005' and status = 'Recebido';
set constraints all immediate;
set constraints all deferred;
select set_config('app.transfer_group_mutation', 'off', true);
select pg_temp.assert_true(
  (select count(distinct value) = 2 from public.transactions where transfer_group_id = 'af900000-0000-0000-0000-000000000005'),
  'schema aceita valores diferentes nas pontas (preparação para a Fase 2)');

select pg_temp.assert_true(true, 'TODOS OS TESTES DA FASE 1 PASSARAM');

rollback;
