\set ON_ERROR_STOP on

-- Finance Smart - Visão Financeira: parâmetros de planejamento e meta mensal.
-- Testes transacionais para banco Supabase LOCAL isolado, após aplicar
-- 202610060003_financial_overview_planning.sql. Tudo é desfeito pelo ROLLBACK.
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
  ('00000000-0000-0000-0000-000000000000', 'df000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'overview-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'df000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'overview-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.accounts(id, owner_id, name, type, currency, current_balance, active) values
  ('df100000-0000-0000-0000-000000000001', 'df000000-0000-0000-0000-000000000001', 'Conta A', 'Conta', 'BRL', 0, true);

insert into public.competences(owner_id, year, month, name, status, start_date, end_date) values
  ('df000000-0000-0000-0000-000000000001', 2026, 10, '2026-10', 'ABERTA', date '2026-10-01', date '2026-10-31'),
  ('df000000-0000-0000-0000-000000000002', 2026, 10, '2026-10', 'ABERTA', date '2026-10-01', date '2026-10-31')
on conflict (owner_id, year, month) do nothing;

create temporary table test_ids on commit drop as
select owner_id, id from public.competences
 where owner_id in ('df000000-0000-0000-0000-000000000001', 'df000000-0000-0000-0000-000000000002')
   and name = '2026-10';
grant select on test_ids to authenticated;

select pg_temp.assert_true(
  (select planning_role is null and use_spending_history and spending_history_start_date is null
     from public.accounts where id = 'df100000-0000-0000-0000-000000000001'),
  'conta nova: papel automático (NULL), usa histórico e sem data inicial');
select pg_temp.assert_true(
  (select count(*) = 0 from information_schema.columns
    where table_schema = 'public' and table_name = 'accounts' and column_name = 'planning_role' and column_default is not null),
  'planning_role sem default: não reescreve contas existentes');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'df000000-0000-0000-0000-000000000001', true);

update public.accounts
   set planning_role = 'savings', use_spending_history = false, spending_history_start_date = date '2026-10-01'
 where id = 'df100000-0000-0000-0000-000000000001';
select pg_temp.assert_true(
  (select planning_role = 'savings' and not use_spending_history and spending_history_start_date = date '2026-10-01'
     from public.accounts where id = 'df100000-0000-0000-0000-000000000001'),
  'dono configura papel, uso do histórico e data inicial');
select pg_temp.expect_error($sql$
  update public.accounts set planning_role = 'investimento' where id = 'df100000-0000-0000-0000-000000000001'
$sql$, '23514', 'accounts_planning_role_check', 'papel inválido é rejeitado');

insert into public.monthly_savings_goals(owner_id, competence_id, amount)
select owner_id, id, 5000 from test_ids where owner_id = 'df000000-0000-0000-0000-000000000001';
select pg_temp.assert_true(
  (select amount = 5000 from public.monthly_savings_goals),
  'meta mensal gravada para a própria competência');
select pg_temp.expect_error($sql$
  insert into public.monthly_savings_goals(owner_id, competence_id, amount)
  select owner_id, id, 1 from test_ids where owner_id = 'df000000-0000-0000-0000-000000000001'
$sql$, '23505', 'monthly_savings_goals_owner_competence_key', 'uma meta por competência');
select pg_temp.expect_error($sql$
  update public.monthly_savings_goals set amount = -1
$sql$, '23514', 'monthly_savings_goals_amount_check', 'meta negativa é rejeitada');
select pg_temp.expect_error($sql$
  insert into public.monthly_savings_goals(owner_id, competence_id, amount)
  select 'df000000-0000-0000-0000-000000000001', id, 10 from test_ids where owner_id = 'df000000-0000-0000-0000-000000000002'
$sql$, '42501', 'row-level security', 'não grava meta em competência de outro usuário');
select pg_temp.expect_error($sql$
  insert into public.monthly_savings_goals(owner_id, competence_id, amount)
  select 'df000000-0000-0000-0000-000000000002', id, 10 from test_ids where owner_id = 'df000000-0000-0000-0000-000000000002'
$sql$, '42501', 'row-level security', 'não grava meta em nome de outro usuário');

select set_config('request.jwt.claim.sub', 'df000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(
  (select count(*) = 0 from public.monthly_savings_goals),
  'RLS: outro usuário não enxerga a meta');
update public.monthly_savings_goals set amount = 1;
delete from public.monthly_savings_goals;
select set_config('request.jwt.claim.sub', 'df000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(
  (select amount = 5000 from public.monthly_savings_goals),
  'RLS: outro usuário não altera nem exclui a meta');

delete from public.monthly_savings_goals;
select pg_temp.assert_true(
  (select count(*) = 0 from public.monthly_savings_goals),
  'dono remove a meta');

select pg_temp.assert_true(true, 'TODOS OS TESTES DA VISAO FINANCEIRA PASSARAM');

rollback;
