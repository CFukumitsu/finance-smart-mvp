\set ON_ERROR_STOP on

-- Finance Smart - Aportes e resgates entre conta financeira e corretora.
-- Testes transacionais para banco Supabase LOCAL isolado, após aplicar
-- 202610240001_brokerage_contribution_transfers.sql. Tudo é desfeito pelo
-- ROLLBACK. Este arquivo não deve ser executado em DEV ou PROD.

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
  ('00000000-0000-0000-0000-000000000000', 'bf000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'brokerage-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bf000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'brokerage-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.accounts(id, owner_id, name, type, currency, current_balance, active, show_on_investments_dashboard) values
  ('bf100000-0000-0000-0000-000000000001', 'bf000000-0000-0000-0000-000000000001', 'ITAU', 'Conta', 'BRL', 0, true, false),
  ('bf100000-0000-0000-0000-000000000002', 'bf000000-0000-0000-0000-000000000001', 'BMG', 'Conta', 'BRL', 0, true, false),
  ('bf100000-0000-0000-0000-000000000003', 'bf000000-0000-0000-0000-000000000001', 'CORRETORA', 'Conta', 'BRL', 0, true, true),
  ('bf100000-0000-0000-0000-000000000004', 'bf000000-0000-0000-0000-000000000001', 'CORRETORA 2', 'Conta', 'BRL', 0, true, true),
  ('bf100000-0000-0000-0000-000000000005', 'bf000000-0000-0000-0000-000000000001', 'BINANCE', 'Conta', 'USD', 0, true, true),
  ('bf100000-0000-0000-0000-000000000006', 'bf000000-0000-0000-0000-000000000001', 'WISE EURO', 'Conta', 'EUR', 0, true, false),
  ('bf100000-0000-0000-0000-000000000007', 'bf000000-0000-0000-0000-000000000001', 'WISE EURO 2', 'Conta', 'EUR', 0, true, false),
  ('bf100000-0000-0000-0000-000000000008', 'bf000000-0000-0000-0000-000000000001', 'CARTAO', 'Cartão', 'BRL', 0, true, false),
  ('bf100000-0000-0000-0000-000000000009', 'bf000000-0000-0000-0000-000000000001', 'POUPANCA SALDO', 'Conta', 'BRL', 0, true, true),
  ('bf100000-0000-0000-0000-000000000010', 'bf000000-0000-0000-0000-000000000001', 'CORRETORA INATIVA', 'Conta', 'BRL', 0, false, true),
  ('bf100000-0000-0000-0000-000000000021', 'bf000000-0000-0000-0000-000000000002', 'CONTA B', 'Conta', 'BRL', 0, true, false),
  ('bf100000-0000-0000-0000-000000000022', 'bf000000-0000-0000-0000-000000000002', 'CORRETORA B', 'Conta', 'BRL', 0, true, true);

update public.accounts set investment_account_kind = 'BALANCE'
 where id = 'bf100000-0000-0000-0000-000000000009';

insert into public.competences(id, owner_id, year, month, name, status, start_date, end_date) values
  ('bf200000-0000-0000-0000-000000000001', 'bf000000-0000-0000-0000-000000000001', 2026, 10, '2026-10', 'ABERTA', date '2026-10-01', date '2026-10-31'),
  ('bf200000-0000-0000-0000-000000000002', 'bf000000-0000-0000-0000-000000000001', 2026, 11, '2026-11', 'ABERTA', date '2026-11-01', date '2026-11-30'),
  ('bf200000-0000-0000-0000-000000000021', 'bf000000-0000-0000-0000-000000000002', 2026, 10, '2026-10', 'ABERTA', date '2026-10-01', date '2026-10-31');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'bf000000-0000-0000-0000-000000000001', true);

-- APORTE: conta financeira -> corretora.
select public.create_transfer('bf100000-0000-0000-0000-000000000001', 'bf100000-0000-0000-0000-000000000003',
  date '2026-10-22', 'bf200000-0000-0000-0000-000000000001', 1946, 'Aporte TASA4',
  'bf900000-0000-0000-0000-000000000001');

select pg_temp.assert_true(
  (select count(*) = 2
      and count(*) filter (where account_id = 'bf100000-0000-0000-0000-000000000001' and status = 'Pago'
                             and value = 1946 and destination_account_id = 'bf100000-0000-0000-0000-000000000003') = 1
      and count(*) filter (where account_id = 'bf100000-0000-0000-0000-000000000003' and status = 'Recebido'
                             and value = 1946 and origin_account_id = 'bf100000-0000-0000-0000-000000000001') = 1
     from public.transactions where transfer_group_id = 'bf900000-0000-0000-0000-000000000001'),
  'aporte: uma saída na conta financeira e uma entrada na corretora');

-- Reenvio / duplo clique com a mesma chave: devolve o mesmo grupo.
select public.create_transfer('bf100000-0000-0000-0000-000000000001', 'bf100000-0000-0000-0000-000000000003',
  date '2026-10-22', 'bf200000-0000-0000-0000-000000000001', 1946, 'Aporte TASA4',
  'bf900000-0000-0000-0000-000000000001');
select pg_temp.assert_true(
  (select count(*) = 1 from public.transactions
    where account_id = 'bf100000-0000-0000-0000-000000000001' and owner_id = 'bf000000-0000-0000-0000-000000000001'),
  'reenvio idempotente: a conta financeira continua com um único débito');
select pg_temp.expect_error($sql$
  select public.create_transfer('bf100000-0000-0000-0000-000000000001', 'bf100000-0000-0000-0000-000000000003',
    date '2026-10-22', 'bf200000-0000-0000-0000-000000000001', 1947, 'Aporte TASA4',
    'bf900000-0000-0000-0000-000000000001')
$sql$, '23505', 'idempotência', 'mesma chave com outro valor é recusada');

-- RESGATE: corretora -> conta financeira.
select public.create_transfer('bf100000-0000-0000-0000-000000000003', 'bf100000-0000-0000-0000-000000000001',
  date '2026-10-23', 'bf200000-0000-0000-0000-000000000001', 500, 'Resgate corretora',
  'bf900000-0000-0000-0000-000000000002');
select pg_temp.assert_true(
  (select count(*) filter (where account_id = 'bf100000-0000-0000-0000-000000000001' and status = 'Recebido'
                             and value = 500 and origin_account_id = 'bf100000-0000-0000-0000-000000000003') = 1
      and count(*) filter (where account_id = 'bf100000-0000-0000-0000-000000000003' and status = 'Pago') = 1
     from public.transactions where transfer_group_id = 'bf900000-0000-0000-0000-000000000002'),
  'resgate: uma entrada na conta financeira e uma saída na corretora');

-- Bloqueios.
select pg_temp.expect_error($sql$
  select public.create_transfer('bf100000-0000-0000-0000-000000000001', 'bf100000-0000-0000-0000-000000000005',
    date '2026-10-22', 'bf200000-0000-0000-0000-000000000001', 10, 'x', 'bf900000-0000-0000-0000-000000000011')
$sql$, '22023', 'mesma moeda', 'aporte BRL -> corretora USD bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('bf100000-0000-0000-0000-000000000006', 'bf100000-0000-0000-0000-000000000003',
    date '2026-10-22', 'bf200000-0000-0000-0000-000000000001', 10, 'x', 'bf900000-0000-0000-0000-000000000012',
    p_destination_amount => 60)
$sql$, '22023', 'mesma moeda', 'aporte EUR -> corretora BRL bloqueado, mesmo com dados de conversão');
select pg_temp.expect_error($sql$
  select public.create_transfer('bf100000-0000-0000-0000-000000000003', 'bf100000-0000-0000-0000-000000000008',
    date '2026-10-22', 'bf200000-0000-0000-0000-000000000001', 10, 'x', 'bf900000-0000-0000-0000-000000000013')
$sql$, '22023', 'não cartões', 'resgate para cartão bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('bf100000-0000-0000-0000-000000000001', 'bf100000-0000-0000-0000-000000000009',
    date '2026-10-22', 'bf200000-0000-0000-0000-000000000001', 10, 'x', 'bf900000-0000-0000-0000-000000000014')
$sql$, '22023', 'módulo Investimentos', 'conta por saldo continua exclusiva do módulo Investimentos');
select pg_temp.expect_error($sql$
  select public.create_transfer('bf100000-0000-0000-0000-000000000003', 'bf100000-0000-0000-0000-000000000004',
    date '2026-10-22', 'bf200000-0000-0000-0000-000000000001', 10, 'x', 'bf900000-0000-0000-0000-000000000015')
$sql$, '22023', 'duas corretoras', 'corretora -> corretora bloqueado');
select pg_temp.expect_error($sql$
  select public.create_transfer('bf100000-0000-0000-0000-000000000001', 'bf100000-0000-0000-0000-000000000010',
    date '2026-10-22', 'bf200000-0000-0000-0000-000000000001', 10, 'x', 'bf900000-0000-0000-0000-000000000016')
$sql$, '22023', 'inativa', 'corretora inativa não recebe aporte novo');
select pg_temp.expect_error($sql$
  select public.create_transfer('bf100000-0000-0000-0000-000000000001', 'bf100000-0000-0000-0000-000000000022',
    date '2026-10-22', 'bf200000-0000-0000-0000-000000000001', 10, 'x', 'bf900000-0000-0000-0000-000000000017')
$sql$, '42501', 'não encontrada', 'corretora de outro usuário não aparece');

-- Edição: valor e data mudam nas duas pontas, sem duplicar.
select public.update_transfer('bf900000-0000-0000-0000-000000000001',
  'bf100000-0000-0000-0000-000000000001', 'bf100000-0000-0000-0000-000000000003',
  date '2026-11-03', 'bf200000-0000-0000-0000-000000000002', 2000, 'Aporte ajustado');
select pg_temp.assert_true(
  (select count(*) = 2 and bool_and(value = 2000 and due_date = date '2026-11-03'
                                    and competence_id = 'bf200000-0000-0000-0000-000000000002')
     from public.transactions where transfer_group_id = 'bf900000-0000-0000-0000-000000000001'),
  'edição do aporte atualiza as duas pontas');
select pg_temp.expect_error($sql$
  select public.update_transfer('bf900000-0000-0000-0000-000000000001',
    'bf100000-0000-0000-0000-000000000001', 'bf100000-0000-0000-0000-000000000005',
    date '2026-11-03', 'bf200000-0000-0000-0000-000000000002', 2000, 'x')
$sql$, '22023', 'mesma moeda', 'edição para corretora em outra moeda é recusada');
select pg_temp.assert_true(
  (select destination_account_id = 'bf100000-0000-0000-0000-000000000003'
     from public.transactions where transfer_group_id = 'bf900000-0000-0000-0000-000000000001' and status = 'Pago'),
  'edição recusada não altera o aporte');

-- Transferência tradicional e mesma moeda estrangeira continuam funcionando.
select public.create_transfer('bf100000-0000-0000-0000-000000000001', 'bf100000-0000-0000-0000-000000000002',
  date '2026-10-22', 'bf200000-0000-0000-0000-000000000001', 100, 'Interna', 'bf900000-0000-0000-0000-000000000003');
select public.create_transfer('bf100000-0000-0000-0000-000000000006', 'bf100000-0000-0000-0000-000000000007',
  date '2026-10-22', 'bf200000-0000-0000-0000-000000000001', 50, 'EUR', 'bf900000-0000-0000-0000-000000000004');
select pg_temp.assert_true(
  (select count(*) = 4 from public.transactions
    where transfer_group_id in ('bf900000-0000-0000-0000-000000000003', 'bf900000-0000-0000-0000-000000000004')),
  'transferências tradicionais BRL e EUR seguem criando duas pontas');

-- Isolamento: outro usuário não altera nem exclui.
select set_config('request.jwt.claim.sub', 'bf000000-0000-0000-0000-000000000002', true);
select pg_temp.expect_error($sql$
  select public.delete_transfer('bf900000-0000-0000-0000-000000000001')
$sql$, '42501', 'não encontrada', 'outro usuário não exclui o aporte');
select pg_temp.expect_error($sql$
  select public.update_transfer('bf900000-0000-0000-0000-000000000001',
    'bf100000-0000-0000-0000-000000000021', 'bf100000-0000-0000-0000-000000000022',
    date '2026-10-22', 'bf200000-0000-0000-0000-000000000021', 1, 'x')
$sql$, '42501', 'não encontrada', 'outro usuário não edita o aporte');
select public.create_transfer('bf100000-0000-0000-0000-000000000021', 'bf100000-0000-0000-0000-000000000022',
  date '2026-10-22', 'bf200000-0000-0000-0000-000000000021', 10, 'Aporte B', 'bf900000-0000-0000-0000-000000000005');
select pg_temp.assert_true(
  (select count(*) = 2 from public.transactions where transfer_group_id = 'bf900000-0000-0000-0000-000000000005'),
  'usuário B registra aporte nas próprias contas');

-- Exclusão remove as duas pontas.
select set_config('request.jwt.claim.sub', 'bf000000-0000-0000-0000-000000000001', true);
select public.delete_transfer('bf900000-0000-0000-0000-000000000001');
select pg_temp.assert_true(
  (select count(*) = 0 from public.transactions where transfer_group_id = 'bf900000-0000-0000-0000-000000000001'),
  'exclusão do aporte remove as duas pontas');

rollback;
