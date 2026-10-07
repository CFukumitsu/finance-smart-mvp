\set ON_ERROR_STOP on

-- Finance Smart - Visão Financeira: modelo da reserva estimada e meses
-- desconsiderados nas projeções.
-- Testes transacionais para banco Supabase LOCAL isolado, após aplicar
-- 202610070001_reserve_projection_settings.sql. Tudo é desfeito pelo ROLLBACK.
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
  p_sql text, p_expected_state text, p_expected_message text, p_test_name text
) returns void language plpgsql as $$
declare
  actual_state text;
  actual_message text;
begin
  begin
    execute p_sql;
    raise exception 'FALHOU: % (nenhum erro)', p_test_name;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate, actual_message = message_text;
    if actual_message like 'FALHOU:%' then raise; end if;
    if actual_state <> p_expected_state or position(p_expected_message in actual_message) = 0 then
      raise exception 'FALHOU: % (recebido [%] %, esperado [%] contendo %)',
        p_test_name, actual_state, actual_message, p_expected_state, p_expected_message;
    end if;
    raise notice 'OK: %', p_test_name;
  end;
end $$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'ef000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'reserve-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ef000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'reserve-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

select pg_temp.assert_true(
  (select count(*) = 0 from public.financial_overview_settings
    where owner_id in ('ef000000-0000-0000-0000-000000000001', 'ef000000-0000-0000-0000-000000000002')),
  'usuário existente não ganha linha: a aplicação usa a média ponderada');
select pg_temp.assert_true(
  (select column_default like '%weighted_average%' from information_schema.columns
    where table_schema = 'public' and table_name = 'financial_overview_settings'
      and column_name = 'reserve_projection_model'),
  'default do modelo = weighted_average');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ef000000-0000-0000-0000-000000000001', true);

insert into public.financial_overview_settings(owner_id) values ('ef000000-0000-0000-0000-000000000001');
select pg_temp.assert_true(
  (select reserve_projection_model = 'weighted_average' and reserve_reference_month is null
     from public.financial_overview_settings),
  'linha nova nasce com média ponderada');

update public.financial_overview_settings
   set reserve_projection_model = 'reference_month', reserve_reference_month = date '2026-08-01';
select pg_temp.assert_true(
  (select reserve_projection_model = 'reference_month' and reserve_reference_month = date '2026-08-01'
     from public.financial_overview_settings),
  'dono grava mês de referência');
select pg_temp.expect_error($sql$
  update public.financial_overview_settings set reserve_projection_model = 'Média ponderada'
$sql$, '23514', 'financial_overview_settings_model_check', 'modelo fora dos identificadores é rejeitado');
select pg_temp.expect_error($sql$
  update public.financial_overview_settings set reserve_reference_month = date '2026-08-15'
$sql$, '23514', 'financial_overview_settings_reference_month_check', 'mês de referência precisa ser o dia 1');
select pg_temp.expect_error($sql$
  update public.financial_overview_settings set reserve_reference_month = null
$sql$, '23514', 'financial_overview_settings_reference_required_check', 'modelo mês de referência exige o mês');
select pg_temp.expect_error($sql$
  insert into public.financial_overview_settings(owner_id) values ('ef000000-0000-0000-0000-000000000002')
$sql$, '42501', 'row-level security', 'não grava configuração em nome de outro usuário');

insert into public.projection_excluded_months(owner_id, month, note)
values ('ef000000-0000-0000-0000-000000000001', date '2027-05-01', 'viagem internacional');
select pg_temp.expect_error($sql$
  insert into public.projection_excluded_months(owner_id, month)
  values ('ef000000-0000-0000-0000-000000000001', date '2027-05-01')
$sql$, '23505', 'projection_excluded_months_owner_month_key', 'mês desconsiderado não duplica');
select pg_temp.expect_error($sql$
  insert into public.projection_excluded_months(owner_id, month)
  values ('ef000000-0000-0000-0000-000000000001', date '2027-06-10')
$sql$, '23514', 'projection_excluded_months_month_check', 'mês desconsiderado precisa ser o dia 1');
select pg_temp.expect_error($sql$
  insert into public.projection_excluded_months(owner_id, month)
  values ('ef000000-0000-0000-0000-000000000002', date '2027-06-01')
$sql$, '42501', 'row-level security', 'não desconsidera mês em nome de outro usuário');

select set_config('request.jwt.claim.sub', 'ef000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(
  (select count(*) = 0 from public.financial_overview_settings)
  and (select count(*) = 0 from public.projection_excluded_months),
  'RLS: outro usuário não enxerga configuração nem meses desconsiderados');
update public.financial_overview_settings set reserve_projection_model = 'last_month';
delete from public.financial_overview_settings;
delete from public.projection_excluded_months;
select set_config('request.jwt.claim.sub', 'ef000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(
  (select reserve_projection_model = 'reference_month' from public.financial_overview_settings)
  and (select count(*) = 1 from public.projection_excluded_months),
  'RLS: outro usuário não altera nem exclui');

delete from public.projection_excluded_months where month = date '2027-05-01';
select pg_temp.assert_true(
  (select count(*) = 0 from public.projection_excluded_months),
  'dono remove o mês desconsiderado');

select pg_temp.assert_true(true, 'TODOS OS TESTES DO MODELO DA RESERVA PASSARAM');

rollback;
