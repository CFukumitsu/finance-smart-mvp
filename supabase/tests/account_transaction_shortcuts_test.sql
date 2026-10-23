\set ON_ERROR_STOP on

-- Finance Smart - Contas/Cartões: ícone e atalhos de Lançamentos.
-- Testes transacionais para banco Supabase LOCAL isolado, após aplicar
-- 202610230001_account_transaction_shortcuts.sql. Tudo é desfeito pelo ROLLBACK.
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
  ('00000000-0000-0000-0000-000000000000', 'ae000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'shortcuts-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ae000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'shortcuts-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.accounts(id, owner_id, name, type, currency, current_balance, active) values
  ('ae100000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-000000000001', 'Conta A', 'Conta', 'BRL', 0, true);

select pg_temp.assert_true(
  (select icon_key is null and show_in_transaction_shortcuts = false and transaction_shortcut_order is null
     from public.accounts where id = 'ae100000-0000-0000-0000-000000000001'),
  'conta nova/existente: sem ícone e fora dos atalhos (nenhum favorito automático)');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-000000000001', true);

update public.accounts
   set icon_key = 'inst-wise', show_in_transaction_shortcuts = true, transaction_shortcut_order = 2
 where id = 'ae100000-0000-0000-0000-000000000001';
select pg_temp.assert_true(
  (select icon_key = 'inst-wise' and show_in_transaction_shortcuts and transaction_shortcut_order = 2
     from public.accounts where id = 'ae100000-0000-0000-0000-000000000001'),
  'dono grava ícone, favorito e ordem');

select pg_temp.expect_error($sql$
  update public.accounts set icon_key = '<svg onload=alert(1)>' where id = 'ae100000-0000-0000-0000-000000000001'
$sql$, '23514', 'accounts_icon_key_format_check', 'ícone com marcação é rejeitado');
select pg_temp.expect_error($sql$
  update public.accounts set icon_key = 'https://exemplo.test/logo.svg' where id = 'ae100000-0000-0000-0000-000000000001'
$sql$, '23514', 'accounts_icon_key_format_check', 'URL como ícone é rejeitada');
select pg_temp.expect_error($sql$
  update public.accounts set transaction_shortcut_order = 0 where id = 'ae100000-0000-0000-0000-000000000001'
$sql$, '23514', 'accounts_transaction_shortcut_order_check', 'ordem fora do intervalo é rejeitada');

select set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(
  (select count(*) = 0 from public.accounts where id = 'ae100000-0000-0000-0000-000000000001'),
  'RLS: outro usuário não enxerga a conta');
update public.accounts set icon_key = 'bank', show_in_transaction_shortcuts = false
 where id = 'ae100000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(
  (select icon_key = 'inst-wise' and show_in_transaction_shortcuts
     from public.accounts where id = 'ae100000-0000-0000-0000-000000000001'),
  'RLS: outro usuário não altera ícone nem favorito');

select pg_temp.assert_true(true, 'TODOS OS TESTES DOS ATALHOS DE CONTAS PASSARAM');

rollback;
