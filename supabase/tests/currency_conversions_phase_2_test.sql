\set ON_ERROR_STOP on

-- Finance Smart - Fase 2: transferências entre moedas diferentes.
-- Testes transacionais para banco Supabase LOCAL isolado, após aplicar
-- 202610060001 e 202610060002. Tudo é desfeito pelo ROLLBACK final.
-- Execução sugerida:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/currency_conversions_phase_2_test.sql
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
  '00000000-0000-0000-0000-000000000000', 'cf000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'conversion-a@example.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', 'cf000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 'conversion-b@example.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.accounts(id, owner_id, name, type, currency, current_balance, active, show_on_investments_dashboard) values
  ('cf100000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000001', 'ITAÚ', 'Conta', 'BRL', 0, true, false),
  ('cf100000-0000-0000-0000-000000000002', 'cf000000-0000-0000-0000-000000000001', 'BMG', 'Conta', 'BRL', 0, true, false),
  ('cf100000-0000-0000-0000-000000000003', 'cf000000-0000-0000-0000-000000000001', 'WISE EURO', 'Conta', 'EUR', 0, true, false),
  ('cf100000-0000-0000-0000-000000000004', 'cf000000-0000-0000-0000-000000000001', 'NOMAD EURO', 'Conta', 'EUR', 0, true, false),
  ('cf100000-0000-0000-0000-000000000005', 'cf000000-0000-0000-0000-000000000001', 'WISE GBP', 'Conta', 'GBP', 0, true, false),
  ('cf100000-0000-0000-0000-000000000006', 'cf000000-0000-0000-0000-000000000001', 'REVOLUT GBP', 'Conta', 'GBP', 0, true, false),
  ('cf100000-0000-0000-0000-000000000011', 'cf000000-0000-0000-0000-000000000001', 'LEGADA 1', 'Conta', null, 0, true, false),
  ('cf100000-0000-0000-0000-000000000012', 'cf000000-0000-0000-0000-000000000001', 'LEGADA 2', 'Conta', null, 0, true, false),
  ('cf100000-0000-0000-0000-000000000013', 'cf000000-0000-0000-0000-000000000001', 'LEGADA 3', 'Conta', null, 0, true, false),
  ('cf100000-0000-0000-0000-000000000014', 'cf000000-0000-0000-0000-000000000001', 'LEGADA 4', 'Conta', null, 0, true, false),
  ('cf100000-0000-0000-0000-000000000021', 'cf000000-0000-0000-0000-000000000002', 'CONTA B', 'Conta', 'BRL', 0, true, false);

insert into public.competences(owner_id, year, month, name, status, start_date, end_date)
values ('cf000000-0000-0000-0000-000000000001', 2026, 10, '2026-10', 'ABERTA', date '2026-10-01', date '2026-10-31')
on conflict (owner_id, year, month) do nothing;

insert into public.currency_conversion_providers(id, owner_id, name, active) values
  ('cf200000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000001', 'Wise', true),
  ('cf200000-0000-0000-0000-000000000002', 'cf000000-0000-0000-0000-000000000001', 'Nomad', true),
  ('cf200000-0000-0000-0000-000000000003', 'cf000000-0000-0000-0000-000000000001', 'Antigo', false),
  ('cf200000-0000-0000-0000-000000000021', 'cf000000-0000-0000-0000-000000000002', 'Wise B', true);

create temporary table test_ids(label text primary key, id uuid) on commit drop;
insert into test_ids
select 'A:2026-10', competence.id from public.competences competence
 where competence.owner_id = 'cf000000-0000-0000-0000-000000000001' and competence.name = '2026-10';
grant all on table test_ids to authenticated;

create or replace function pg_temp.tid(p_label text) returns uuid language sql as $$
  select id from test_ids where label = p_label
$$;

-- Conferências frequentes.
create or replace function pg_temp.leg_value(p_group uuid, p_status text) returns numeric language sql as $$
  select value from public.transactions where transfer_group_id = p_group and status = p_status
$$;
create or replace function pg_temp.leg_count(p_group uuid) returns bigint language sql as $$
  select count(*) from public.transactions where transfer_group_id = p_group
$$;
create or replace function pg_temp.conversion_count(p_group uuid) returns bigint language sql as $$
  select count(*) from public.currency_conversions where transfer_group_id = p_group
$$;

select pg_temp.assert_true(
  (select count(*) = 1 from pg_proc where proname = 'create_transfer' and pronamespace = 'public'::regnamespace)
  and (select count(*) = 1 from pg_proc where proname = 'update_transfer' and pronamespace = 'public'::regnamespace),
  'sem sobrecarga: uma única create_transfer e uma única update_transfer');
select pg_temp.assert_true(
  has_function_privilege('authenticated', 'public.create_transfer'::regproc::oid, 'execute')
  and not has_function_privilege('anon', 'public.create_transfer'::regproc::oid, 'execute')
  and not has_function_privilege('authenticated',
    'public.validate_transfer_conversion(uuid, text, text, numeric, numeric, uuid, numeric, text, numeric, text, text, uuid)', 'execute'),
  'grants: RPC para authenticated; helper de validação privado');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cf000000-0000-0000-0000-000000000001', true);

-- ---------------------------------------------------------------------------
-- Provedores
-- ---------------------------------------------------------------------------
insert into public.currency_conversion_providers(owner_id, name)
values ('cf000000-0000-0000-0000-000000000001', 'Revolut');
select pg_temp.assert_true(
  (select count(*) = 4 from public.currency_conversion_providers),
  'usuário cria provedor e enxerga somente os seus (RLS)');
select pg_temp.expect_error($sql$
  insert into public.currency_conversion_providers(owner_id, name) values ('cf000000-0000-0000-0000-000000000001', 'WISE')
$sql$, '23505', 'currency_conversion_providers_owner_name_key', 'duplicidade normalizada (maiúsculas) bloqueada');
select pg_temp.expect_error($sql$
  insert into public.currency_conversion_providers(owner_id, name) values ('cf000000-0000-0000-0000-000000000001', ' Nomad ')
$sql$, '23514', 'currency_conversion_providers_name_check', 'nome com espaços nas pontas bloqueado');
select pg_temp.expect_error($sql$
  insert into public.currency_conversion_providers(owner_id, name) values ('cf000000-0000-0000-0000-000000000002', 'Invasor')
$sql$, '42501', 'row-level security', 'não cria provedor para outro usuário');

-- ---------------------------------------------------------------------------
-- Mesma moeda: igual à Fase 1, sem conversão
-- ---------------------------------------------------------------------------
select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000002',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 1000, 'BRL', 'cf900000-0000-0000-0000-000000000001');
select public.create_transfer('cf100000-0000-0000-0000-000000000003', 'cf100000-0000-0000-0000-000000000004',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 100, 'EUR', 'cf900000-0000-0000-0000-000000000002', 100);
select public.create_transfer('cf100000-0000-0000-0000-000000000005', 'cf100000-0000-0000-0000-000000000006',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 80, 'GBP', 'cf900000-0000-0000-0000-000000000003');
select pg_temp.assert_true(
  pg_temp.leg_count('cf900000-0000-0000-0000-000000000001') = 2
  and pg_temp.leg_value('cf900000-0000-0000-0000-000000000001', 'Pago') = 1000
  and pg_temp.leg_value('cf900000-0000-0000-0000-000000000001', 'Recebido') = 1000
  and pg_temp.conversion_count('cf900000-0000-0000-0000-000000000001') = 0,
  'BRL -> BRL continua igual e não cria conversão');
select pg_temp.assert_true(
  pg_temp.leg_value('cf900000-0000-0000-0000-000000000002', 'Recebido') = 100
  and pg_temp.conversion_count('cf900000-0000-0000-0000-000000000002') = 0,
  'EUR -> EUR continua igual (valor recebido igual é aceito)');
select pg_temp.assert_true(
  pg_temp.leg_value('cf900000-0000-0000-0000-000000000003', 'Recebido') = 80
  and pg_temp.conversion_count('cf900000-0000-0000-0000-000000000003') = 0,
  'GBP -> GBP continua igual e não cria conversão');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000002',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1000, 'x', 'cf900000-0000-0000-0000-000000000010', 999)
$sql$, '22023', 'valor recebido deve ser igual', 'mesma moeda com valor recebido diferente bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000002',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1000, 'x', 'cf900000-0000-0000-0000-000000000011', null,
    'cf200000-0000-0000-0000-000000000001')
$sql$, '22023', 'só se aplicam a transferências entre moedas diferentes', 'mesma moeda não aceita provedor');

-- ---------------------------------------------------------------------------
-- Multimoeda: caso real BRL -> EUR via Wise
-- ---------------------------------------------------------------------------
create temporary table wise_transfer on commit drop as
select * from public.create_transfer(
  'cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'Envio Wise', 'cf900000-0000-0000-0000-000000000020',
  241.69, 'cf200000-0000-0000-0000-000000000001', 24, 'brl', 6.05, 'EUR', 'BRL');
select pg_temp.assert_true(
  pg_temp.leg_count('cf900000-0000-0000-0000-000000000020') = 2
  and (select count(*) = 1 from public.transactions movement, wise_transfer created
        where movement.id = created.outgoing_id and movement.status = 'Pago'
          and movement.account_id = 'cf100000-0000-0000-0000-000000000001' and movement.value = 1500)
  and (select count(*) = 1 from public.transactions movement, wise_transfer created
        where movement.id = created.incoming_id and movement.status = 'Recebido'
          and movement.account_id = 'cf100000-0000-0000-0000-000000000003' and movement.value = 241.69),
  'BRL -> EUR: saída R$ 1.500 (Pago) e entrada € 241,69 (Recebido), valores diferentes permitidos');
select pg_temp.assert_true(
  (select provider_id = 'cf200000-0000-0000-0000-000000000001' and fee_amount = 24 and fee_currency = 'BRL'
          and quoted_rate = 6.05 and quoted_rate_base_currency = 'EUR' and quoted_rate_quote_currency = 'BRL'
     from public.currency_conversions where transfer_group_id = 'cf900000-0000-0000-0000-000000000020'),
  'conversão gravada com provedor, taxa normalizada (BRL) e direção da cotação preservada (EUR -> BRL)');
select pg_temp.assert_true(
  (select count(*) = 2 from public.transactions where transfer_group_id = 'cf900000-0000-0000-0000-000000000020')
  and (select count(*) = 0 from public.transactions
        where owner_id = 'cf000000-0000-0000-0000-000000000001' and type in ('Despesa', 'Receita')),
  'taxa não gera lançamento adicional nem Receita/Despesa');
select pg_temp.assert_true(
  (select sum(case when status = 'Recebido' then value else -value end) = -1500
     from public.transactions
    where account_id = 'cf100000-0000-0000-0000-000000000001'
      and transfer_group_id = 'cf900000-0000-0000-0000-000000000020')
  and (select sum(case when status = 'Recebido' then value else -value end) = 241.69
     from public.transactions
    where account_id = 'cf100000-0000-0000-0000-000000000003'
      and transfer_group_id = 'cf900000-0000-0000-0000-000000000020'),
  'saldo nativo: ITAÚ -R$ 1.500 (taxa não debitada de novo) e WISE EURO +€ 241,69');
select pg_temp.assert_true(
  (select round(outgoing.value / incoming.value, 4) = 6.2063
     from public.transactions outgoing
     join public.transactions incoming on incoming.transfer_group_id = outgoing.transfer_group_id and incoming.status = 'Recebido'
    where outgoing.transfer_group_id = 'cf900000-0000-0000-0000-000000000020' and outgoing.status = 'Pago'),
  'custo efetivo derivado das pontas: R$ 6,2063 por EUR (não persistido)');

select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000005',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 700, 'BRL -> GBP', 'cf900000-0000-0000-0000-000000000021',
  98.5, 'cf200000-0000-0000-0000-000000000002', null, null, null, null, null);
select public.create_transfer('cf100000-0000-0000-0000-000000000003', 'cf100000-0000-0000-0000-000000000005',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 100, 'EUR -> GBP', 'cf900000-0000-0000-0000-000000000022',
  85.1, 'cf200000-0000-0000-0000-000000000001', 0, 'EUR', null, null, null);
select public.create_transfer('cf100000-0000-0000-0000-000000000006', 'cf100000-0000-0000-0000-000000000004',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 50, 'GBP -> EUR', 'cf900000-0000-0000-0000-000000000023',
  57.4, 'cf200000-0000-0000-0000-000000000001', 0.5, 'GBP', 1.16, 'GBP', 'EUR');
select public.create_transfer('cf100000-0000-0000-0000-000000000004', 'cf100000-0000-0000-0000-000000000002',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 100, 'EUR -> BRL', 'cf900000-0000-0000-0000-000000000024',
  598.3, 'cf200000-0000-0000-0000-000000000002', 1.2, 'EUR', 6.0, 'EUR', 'BRL');
select public.create_transfer('cf100000-0000-0000-0000-000000000005', 'cf100000-0000-0000-0000-000000000002',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 40, 'GBP -> BRL', 'cf900000-0000-0000-0000-000000000025',
  280.9, 'cf200000-0000-0000-0000-000000000001', null, null, 0.1407, 'BRL', 'GBP');
select pg_temp.assert_true(
  (select count(*) = 5 from public.currency_conversions where transfer_group_id in (
     'cf900000-0000-0000-0000-000000000021', 'cf900000-0000-0000-0000-000000000022', 'cf900000-0000-0000-0000-000000000023',
     'cf900000-0000-0000-0000-000000000024', 'cf900000-0000-0000-0000-000000000025'))
  and pg_temp.leg_value('cf900000-0000-0000-0000-000000000021', 'Recebido') = 98.5
  and pg_temp.leg_value('cf900000-0000-0000-0000-000000000022', 'Recebido') = 85.1
  and pg_temp.leg_value('cf900000-0000-0000-0000-000000000023', 'Recebido') = 57.4
  and pg_temp.leg_value('cf900000-0000-0000-0000-000000000024', 'Recebido') = 598.3
  and pg_temp.leg_value('cf900000-0000-0000-0000-000000000025', 'Recebido') = 280.9,
  'BRL -> GBP, EUR -> GBP, GBP -> EUR, EUR -> BRL e GBP -> BRL criam pontas com valor nativo e conversão');
select pg_temp.assert_true(
  (select fee_amount is null and fee_currency is null and quoted_rate is null
     from public.currency_conversions where transfer_group_id = 'cf900000-0000-0000-0000-000000000021')
  and (select fee_amount = 0 and fee_currency = 'EUR'
     from public.currency_conversions where transfer_group_id = 'cf900000-0000-0000-0000-000000000022')
  and (select quoted_rate_base_currency = 'BRL' and quoted_rate_quote_currency = 'GBP'
     from public.currency_conversions where transfer_group_id = 'cf900000-0000-0000-0000-000000000025'),
  'taxa NULL (desconhecida), taxa zero e cotação na direção inversa são aceitas como informadas');

-- ---------------------------------------------------------------------------
-- Validações da conversão
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'cf900000-0000-0000-0000-000000000030')
$sql$, '22023', 'moedas diferentes', 'multimoeda sem valor recebido/provedor bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'cf900000-0000-0000-0000-000000000031', 241.69)
$sql$, '22023', 'provedor da conversão', 'provedor obrigatório em multimoeda');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'cf900000-0000-0000-0000-000000000032', 0,
    'cf200000-0000-0000-0000-000000000001')
$sql$, '22023', 'valor recebido deve ser maior que zero', 'valor recebido zero bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'cf900000-0000-0000-0000-000000000033', 241.69,
    'cf200000-0000-0000-0000-000000000021')
$sql$, '42501', 'Provedor de conversão não encontrado', 'provedor de outro usuário bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'cf900000-0000-0000-0000-000000000034', 241.69,
    'cf200000-0000-0000-0000-000000000003')
$sql$, '22023', 'inativo', 'provedor inativo bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'cf900000-0000-0000-0000-000000000035', 241.69,
    'cf200000-0000-0000-0000-000000000001', -1, 'BRL')
$sql$, '22023', 'não pode ser negativa', 'taxa negativa bloqueada');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'cf900000-0000-0000-0000-000000000036', 241.69,
    'cf200000-0000-0000-0000-000000000001', 5, 'USD')
$sql$, '22023', 'moeda da taxa', 'taxa em terceira moeda bloqueada');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'cf900000-0000-0000-0000-000000000037', 241.69,
    'cf200000-0000-0000-0000-000000000001', 24, null)
$sql$, '22023', 'valor e a moeda da taxa', 'taxa sem moeda bloqueada');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'cf900000-0000-0000-0000-000000000038', 241.69,
    'cf200000-0000-0000-0000-000000000001', null, null, 6.05, 'EUR', null)
$sql$, '22023', 'cotação completa', 'cotação parcial bloqueada');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'cf900000-0000-0000-0000-000000000039', 241.69,
    'cf200000-0000-0000-0000-000000000001', null, null, 0, 'EUR', 'BRL')
$sql$, '22023', 'maior que zero', 'cotação <= 0 bloqueada');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'cf900000-0000-0000-0000-00000000003a', 241.69,
    'cf200000-0000-0000-0000-000000000001', null, null, 6.05, 'USD', 'BRL')
$sql$, '22023', 'moedas da cotação', 'cotação com moeda fora da operação bloqueada');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'x', 'cf900000-0000-0000-0000-00000000003b', 241.69,
    'cf200000-0000-0000-0000-000000000001', null, null, 1, 'BRL', 'BRL')
$sql$, '22023', 'moedas da cotação', 'cotação com base = quote bloqueada');
select pg_temp.assert_true(
  (select count(*) = 0 from public.transactions where transfer_group_id::text like 'cf900000-0000-0000-0000-00000000003%')
  and (select count(*) = 0 from public.transactions where transfer_group_id::text like 'cf900000-0000-0000-0000-00000000001_')
  and (select count(*) = 0 from public.currency_conversions where transfer_group_id::text like 'cf900000-0000-0000-0000-00000000003%'),
  'tentativas bloqueadas não gravam pontas nem conversão');

-- ---------------------------------------------------------------------------
-- Idempotência
-- ---------------------------------------------------------------------------
create temporary table wise_retry on commit drop as
select * from public.create_transfer(
  'cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'Envio Wise', 'cf900000-0000-0000-0000-000000000020',
  241.69, 'cf200000-0000-0000-0000-000000000001', 24, 'BRL', 6.05, 'EUR', 'BRL');
select pg_temp.assert_true(
  (select retry.outgoing_id = created.outgoing_id and retry.incoming_id = created.incoming_id
     from wise_retry retry, wise_transfer created)
  and pg_temp.leg_count('cf900000-0000-0000-0000-000000000020') = 2
  and pg_temp.conversion_count('cf900000-0000-0000-0000-000000000020') = 1,
  'mesma chave + mesmos dados devolve a conversão existente');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'Envio Wise', 'cf900000-0000-0000-0000-000000000020',
    240.00, 'cf200000-0000-0000-0000-000000000001', 24, 'BRL', 6.05, 'EUR', 'BRL')
$sql$, '23505', 'dados diferentes', 'mesma chave + valor recebido diferente falha');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'Envio Wise', 'cf900000-0000-0000-0000-000000000020',
    241.69, 'cf200000-0000-0000-0000-000000000002', 24, 'BRL', 6.05, 'EUR', 'BRL')
$sql$, '23505', 'dados diferentes', 'mesma chave + provedor diferente falha');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'Envio Wise', 'cf900000-0000-0000-0000-000000000020',
    241.69, 'cf200000-0000-0000-0000-000000000001', null, null, 6.05, 'EUR', 'BRL')
$sql$, '23505', 'dados diferentes', 'mesma chave + taxa diferente falha');
select pg_temp.expect_error($sql$
  select public.create_transfer('cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1500, 'Envio Wise', 'cf900000-0000-0000-0000-000000000020',
    241.69, 'cf200000-0000-0000-0000-000000000001', 24, 'BRL', 6.05, 'BRL', 'EUR')
$sql$, '23505', 'dados diferentes', 'mesma chave + direção da cotação diferente falha');
select pg_temp.assert_true(
  pg_temp.leg_count('cf900000-0000-0000-0000-000000000020') = 2
  and (select fee_amount = 24 and provider_id = 'cf200000-0000-0000-0000-000000000001'
         from public.currency_conversions where transfer_group_id = 'cf900000-0000-0000-0000-000000000020'),
  'retries rejeitados não criam pontas nem alteram a conversão');

-- ---------------------------------------------------------------------------
-- Escrita direta bloqueada
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($sql$
  insert into public.currency_conversions(transfer_group_id, owner_id, provider_id)
  values ('cf900000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000001', 'cf200000-0000-0000-0000-000000000001')
$sql$, '42501', '', 'insert direto em currency_conversions bloqueado');
select pg_temp.expect_error($sql$
  update public.currency_conversions set fee_amount = 999 where transfer_group_id = 'cf900000-0000-0000-0000-000000000020'
$sql$, '42501', 'permission denied', 'update direto em currency_conversions bloqueado');
select pg_temp.expect_error($sql$
  delete from public.currency_conversions where transfer_group_id = 'cf900000-0000-0000-0000-000000000020'
$sql$, '42501', 'permission denied', 'delete direto em currency_conversions bloqueado');
select pg_temp.assert_true(
  (select fee_amount = 24 from public.currency_conversions where transfer_group_id = 'cf900000-0000-0000-0000-000000000020'),
  'conversão intacta após tentativas de escrita direta');

-- ---------------------------------------------------------------------------
-- Edição
-- ---------------------------------------------------------------------------
-- Multimoeda -> multimoeda, pelo grupo obtido da ponta Recebido.
select public.update_transfer(
  (select transfer_group_id from public.transactions where id = (select incoming_id from wise_transfer)),
  'cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000004',
  date '2026-10-06', pg_temp.tid('A:2026-10'), 1600, 'Envio Nomad',
  259.10, 'cf200000-0000-0000-0000-000000000002', 0, 'BRL', null, null, null);
select pg_temp.assert_true(
  pg_temp.leg_value('cf900000-0000-0000-0000-000000000020', 'Pago') = 1600
  and pg_temp.leg_value('cf900000-0000-0000-0000-000000000020', 'Recebido') = 259.10
  and (select account_id = 'cf100000-0000-0000-0000-000000000004' from public.transactions
        where id = (select incoming_id from wise_transfer))
  and (select provider_id = 'cf200000-0000-0000-0000-000000000002' and fee_amount = 0 and quoted_rate is null
         from public.currency_conversions where transfer_group_id = 'cf900000-0000-0000-0000-000000000020')
  and pg_temp.conversion_count('cf900000-0000-0000-0000-000000000020') = 1,
  'multimoeda -> multimoeda: valores, conta, provedor, taxa e cotação atualizados juntos');

-- Mesma moeda -> multimoeda.
select pg_temp.expect_error($sql$
  select public.update_transfer('cf900000-0000-0000-0000-000000000001',
    'cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 1000, 'BRL')
$sql$, '22023', 'moedas diferentes', 'mesma -> multimoeda sem dados de conversão bloqueado');
select pg_temp.assert_true(
  pg_temp.leg_value('cf900000-0000-0000-0000-000000000001', 'Recebido') = 1000
  and (select account_id = 'cf100000-0000-0000-0000-000000000002' from public.transactions
        where transfer_group_id = 'cf900000-0000-0000-0000-000000000001' and status = 'Recebido'),
  'edição bloqueada não altera a transferência');
select public.update_transfer('cf900000-0000-0000-0000-000000000001',
  'cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 1000, 'BRL',
  161.20, 'cf200000-0000-0000-0000-000000000001', 16, 'BRL', 6.1, 'EUR', 'BRL');
select pg_temp.assert_true(
  pg_temp.leg_value('cf900000-0000-0000-0000-000000000001', 'Recebido') = 161.20
  and pg_temp.conversion_count('cf900000-0000-0000-0000-000000000001') = 1,
  'mesma -> multimoeda cria a conversão');

-- Multimoeda -> mesma moeda.
select pg_temp.expect_error($sql$
  select public.update_transfer('cf900000-0000-0000-0000-000000000021',
    'cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000002',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 700, 'x',
    98.5, 'cf200000-0000-0000-0000-000000000002')
$sql$, '22023', 'mesma moeda', 'multimoeda -> mesma com dados de conversão é bloqueado');
select public.update_transfer('cf900000-0000-0000-0000-000000000021',
  'cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000002',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 700, 'Volta para BRL');
select pg_temp.assert_true(
  pg_temp.leg_value('cf900000-0000-0000-0000-000000000021', 'Recebido') = 700
  and pg_temp.leg_value('cf900000-0000-0000-0000-000000000021', 'Pago') = 700
  and pg_temp.conversion_count('cf900000-0000-0000-0000-000000000021') = 0,
  'multimoeda -> mesma remove a conversão e recebido volta a ser igual ao debitado');

-- Provedor inativo: mantê-lo na edição é permitido; trocar para inativo não.
update public.currency_conversion_providers set active = false where id = 'cf200000-0000-0000-0000-000000000002';
select public.update_transfer('cf900000-0000-0000-0000-000000000024',
  'cf100000-0000-0000-0000-000000000004', 'cf100000-0000-0000-0000-000000000002',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 100, 'EUR -> BRL corrigido',
  599.00, 'cf200000-0000-0000-0000-000000000002', 1.2, 'EUR', 6.0, 'EUR', 'BRL');
select pg_temp.assert_true(
  pg_temp.leg_value('cf900000-0000-0000-0000-000000000024', 'Recebido') = 599.00,
  'edição mantendo provedor já usado e agora inativo é permitida');
select pg_temp.expect_error($sql$
  select public.update_transfer('cf900000-0000-0000-0000-000000000022',
    'cf100000-0000-0000-0000-000000000003', 'cf100000-0000-0000-0000-000000000005',
    date '2026-10-05', pg_temp.tid('A:2026-10'), 100, 'x',
    85.1, 'cf200000-0000-0000-0000-000000000002', 0, 'EUR')
$sql$, '22023', 'inativo', 'trocar para provedor inativo é bloqueado');
update public.currency_conversion_providers set active = true where id = 'cf200000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- Exclusão
-- ---------------------------------------------------------------------------
select public.delete_transfer(
  (select transfer_group_id from public.transactions
    where transfer_group_id = 'cf900000-0000-0000-0000-000000000023' and status = 'Recebido'));
select pg_temp.assert_true(
  pg_temp.leg_count('cf900000-0000-0000-0000-000000000023') = 0
  and pg_temp.conversion_count('cf900000-0000-0000-0000-000000000023') = 0,
  'excluir conversão remove as duas pontas e a conversão');

-- ---------------------------------------------------------------------------
-- Análise histórica (estrutura para a futura tela Wise x Nomad)
-- ---------------------------------------------------------------------------
select public.create_transfer('cf100000-0000-0000-0000-000000000002', 'cf100000-0000-0000-0000-000000000003',
  date '2026-10-10', pg_temp.tid('A:2026-10'), 1000, 'Wise 2', 'cf900000-0000-0000-0000-000000000040',
  160, 'cf200000-0000-0000-0000-000000000001', null, null, null, null, null);
select public.create_transfer('cf100000-0000-0000-0000-000000000002', 'cf100000-0000-0000-0000-000000000004',
  date '2026-10-11', pg_temp.tid('A:2026-10'), 1200, 'Nomad 1', 'cf900000-0000-0000-0000-000000000041',
  195, 'cf200000-0000-0000-0000-000000000002', 0, 'BRL', null, null, null);

create temporary table conversion_analysis on commit drop as
select origin_account.currency as source_currency,
       destination_account.currency as destination_currency,
       provider.name as provider_name,
       count(*) as operations,
       sum(outgoing.value) as total_debited,
       sum(incoming.value) as total_received,
       sum(conversion.fee_amount) filter (where conversion.fee_currency = origin_account.currency) as fees_in_source_currency,
       count(*) filter (where conversion.fee_amount is null) as unknown_fee_operations,
       round(sum(outgoing.value) / sum(incoming.value), 4) as weighted_effective_rate
  from public.currency_conversions conversion
  join public.currency_conversion_providers provider on provider.id = conversion.provider_id
  join public.transactions outgoing
    on outgoing.transfer_group_id = conversion.transfer_group_id and outgoing.status = 'Pago'
  join public.transactions incoming
    on incoming.transfer_group_id = conversion.transfer_group_id and incoming.status = 'Recebido'
  join public.accounts origin_account on origin_account.id = outgoing.account_id
  join public.accounts destination_account on destination_account.id = incoming.account_id
 where outgoing.due_date between date '2026-10-01' and date '2026-10-31'
 group by 1, 2, 3;

-- BRL -> EUR no período: Wise = grupos ...01 (1000 / 161,20, taxa 16) e ...40
-- (1000 / 160, taxa desconhecida); Nomad = ...20 (1600 / 259,10, taxa 0) e
-- ...41 (1200 / 195, taxa 0).
select pg_temp.assert_true(
  (select operations = 2 and total_debited = 2000 and total_received = 321.20
          and fees_in_source_currency = 16 and unknown_fee_operations = 1
          and weighted_effective_rate = round(2000 / 321.20, 4)
     from conversion_analysis where source_currency = 'BRL' and destination_currency = 'EUR' and provider_name = 'Wise')
  and (select operations = 2 and total_debited = 2800 and total_received = 454.10
          and fees_in_source_currency = 0 and unknown_fee_operations = 0
          and weighted_effective_rate = round(2800 / 454.10, 4)
     from conversion_analysis where source_currency = 'BRL' and destination_currency = 'EUR' and provider_name = 'Nomad'),
  'análise por par + provedor + período: totais, taxas, taxa desconhecida e custo médio ponderado SUM/SUM');
select pg_temp.assert_true(
  (select weighted_effective_rate from conversion_analysis where source_currency = 'BRL' and destination_currency = 'EUR' and provider_name = 'Nomad')
  < (select weighted_effective_rate from conversion_analysis where source_currency = 'BRL' and destination_currency = 'EUR' and provider_name = 'Wise'),
  'comparação Wise x Nomad: menor custo médio ponderado identifica o melhor provedor');

-- ---------------------------------------------------------------------------
-- Legado e R1 (moeda NULL confirmada depois)
-- ---------------------------------------------------------------------------
insert into public.transactions(owner_id, competence_id, account_id, description, due_date, type, mode, value, status,
  category_id, origin_account_id, destination_account_id) values
  ('cf000000-0000-0000-0000-000000000001', pg_temp.tid('A:2026-10'), 'cf100000-0000-0000-0000-000000000001',
   'Legada', date '2026-10-01', 'Transferência', 'unico', 300, 'Pago', null,
   'cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003'),
  ('cf000000-0000-0000-0000-000000000001', pg_temp.tid('A:2026-10'), 'cf100000-0000-0000-0000-000000000003',
   'Legada', date '2026-10-01', 'Transferência', 'unico', 300, 'Recebido', null,
   'cf100000-0000-0000-0000-000000000001', 'cf100000-0000-0000-0000-000000000003');
update public.transactions set value = 301 where description = 'Legada' and status = 'Pago';
delete from public.transactions where description = 'Legada' and status = 'Recebido';
select pg_temp.assert_true(
  (select count(*) = 1 from public.transactions where description = 'Legada' and transfer_group_id is null),
  'legado (transfer_group_id NULL) continua com insert/update/delete direto e sem exigir conversão');

select public.create_transfer('cf100000-0000-0000-0000-000000000011', 'cf100000-0000-0000-0000-000000000012',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 10, 'Legadas sem moeda', 'cf900000-0000-0000-0000-000000000050');
select public.create_transfer('cf100000-0000-0000-0000-000000000013', 'cf100000-0000-0000-0000-000000000014',
  date '2026-10-05', pg_temp.tid('A:2026-10'), 10, 'Legadas sem moeda 2', 'cf900000-0000-0000-0000-000000000051');
update public.accounts set currency = 'BRL' where id = 'cf100000-0000-0000-0000-000000000011';
select pg_temp.assert_true(
  (select currency = 'BRL' from public.accounts where id = 'cf100000-0000-0000-0000-000000000011'),
  'R1: confirmar a primeira conta (outra ainda sem moeda) é permitido');
select pg_temp.expect_error($sql$
  update public.accounts set currency = 'EUR' where id = 'cf100000-0000-0000-0000-000000000012'
$sql$, '23514', 'outra moeda', 'R1: confirmação que criaria grupo multimoeda sem conversão é bloqueada');
update public.accounts set currency = 'BRL' where id = 'cf100000-0000-0000-0000-000000000012';
update public.accounts set currency = 'gbp' where id = 'cf100000-0000-0000-0000-000000000013';
update public.accounts set currency = 'GBP' where id = 'cf100000-0000-0000-0000-000000000014';
select pg_temp.assert_true(
  (select currency = 'BRL' from public.accounts where id = 'cf100000-0000-0000-0000-000000000012')
  and (select count(*) = 2 from public.accounts where id in ('cf100000-0000-0000-0000-000000000013', 'cf100000-0000-0000-0000-000000000014') and currency = 'GBP'),
  'R1: confirmação coerente (mesma moeda) continua permitida, inclusive com normalização');

-- ---------------------------------------------------------------------------
-- Invariantes (com o guard liberado)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.expect_error($sql$
  select set_config('app.transfer_group_mutation', 'on', true);
  insert into public.currency_conversions(transfer_group_id, owner_id, provider_id)
  values ('cf900000-0000-0000-0000-000000000002', 'cf000000-0000-0000-0000-000000000001', 'cf200000-0000-0000-0000-000000000001');
$sql$, '23514', 'mesma moeda não pode ter dados de conversão', 'mesma moeda + conversão é inválido');
select pg_temp.expect_error($sql$
  select set_config('app.transfer_group_mutation', 'on', true);
  delete from public.currency_conversions where transfer_group_id = 'cf900000-0000-0000-0000-000000000022';
$sql$, '23514', 'sem dados de conversão', 'moedas diferentes sem conversão é inválido');
select pg_temp.expect_error($sql$
  select set_config('app.transfer_group_mutation', 'on', true);
  insert into public.currency_conversions(transfer_group_id, owner_id, provider_id)
  values ('cf900000-0000-0000-0000-0000000000ff', 'cf000000-0000-0000-0000-000000000001', 'cf200000-0000-0000-0000-000000000001');
$sql$, '23514', 'não possui a transferência', 'conversão órfã é inválida');
select pg_temp.expect_error($sql$
  select set_config('app.transfer_group_mutation', 'on', true);
  update public.currency_conversions set fee_currency = 'USD' where transfer_group_id = 'cf900000-0000-0000-0000-000000000022';
$sql$, '23514', 'não correspondem às moedas', 'invariante rejeita taxa fora das moedas da operação');
select pg_temp.expect_error($sql$
  select set_config('app.transfer_group_mutation', 'on', true);
  update public.currency_conversions set fee_amount = 1, fee_currency = null where transfer_group_id = 'cf900000-0000-0000-0000-000000000022';
$sql$, '23514', 'currency_conversions_fee_check', 'CHECK rejeita taxa sem moeda');
select pg_temp.expect_error($sql$
  select set_config('app.transfer_group_mutation', 'on', true);
  update public.currency_conversions set quoted_rate = 1 where transfer_group_id = 'cf900000-0000-0000-0000-000000000022';
$sql$, '23514', 'currency_conversions_quote_check', 'CHECK rejeita cotação parcial');
select pg_temp.expect_error($sql$
  select set_config('app.transfer_group_mutation', 'on', true);
  delete from public.transactions where transfer_group_id = 'cf900000-0000-0000-0000-000000000022';
$sql$, '23514', 'não possui a transferência', 'remover as pontas deixando a conversão é inválido');

select set_config('app.transfer_group_mutation', 'on', true);
update public.transactions set value = 12345.67
 where transfer_group_id = 'cf900000-0000-0000-0000-000000000022' and status = 'Recebido';
set constraints all immediate;
set constraints all deferred;
select set_config('app.transfer_group_mutation', 'off', true);
select pg_temp.assert_true(
  pg_temp.leg_value('cf900000-0000-0000-0000-000000000022', 'Recebido') = 12345.67,
  'valores diferentes entre as pontas NÃO violam o invariante');

select pg_temp.assert_true(true, 'TODOS OS TESTES DA FASE 2 PASSARAM');

rollback;
