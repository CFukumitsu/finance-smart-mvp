-- Bankroll Poker - testes transacionais para banco Supabase local isolado.
-- Precondicao: migrations locais, incluindo 202607190001, ja aplicadas.
-- Execucao sugerida: psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/bankroll_poker_phase_1_test.sql
-- Este arquivo nao deve ser executado em DEV ou PROD.

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'FALHOU: %', p_message;
  end if;
  raise notice 'OK: %', p_message;
end $$;

create or replace function pg_temp.expect_error(p_sql text, p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    set constraints all immediate;
    raise exception 'FALHOU: % (nenhum erro foi gerado)', p_message;
  exception
    when others then
      if sqlerrm like 'FALHOU:%' then raise; end if;
      raise notice 'OK: %', p_message;
  end;
end $$;

-- UUIDs exclusivos e deterministas; tudo sera desfeito pelo ROLLBACK final.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'ba000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'bankroll-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ba000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bankroll-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.bankroll_wallets (id, owner_id, name, wallet_type, currency, initial_balance, active) values
  ('ba100000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', 'A origem', 'online', 'BRL', 1000, true),
  ('ba100000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-000000000001', 'A destino', 'online', 'BRL', 0, true),
  ('ba100000-0000-0000-0000-000000000003', 'ba000000-0000-0000-0000-000000000001', 'A USD', 'online', 'USD', 0, true),
  ('ba100000-0000-0000-0000-000000000004', 'ba000000-0000-0000-0000-000000000001', 'A inativa', 'online', 'BRL', 0, false),
  ('ba100000-0000-0000-0000-000000000005', 'ba000000-0000-0000-0000-000000000001', 'A moeda livre', 'online', 'BRL', 0, true),
  ('ba100000-0000-0000-0000-000000000006', 'ba000000-0000-0000-0000-000000000001', 'A com sessao', 'online', 'BRL', 0, true),
  ('ba100000-0000-0000-0000-000000000007', 'ba000000-0000-0000-0000-000000000001', 'A com movimento', 'online', 'BRL', 0, true),
  ('ba200000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000002', 'B carteira', 'online', 'BRL', 0, true),
  ('ba200000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-000000000002', 'B segunda', 'online', 'BRL', 0, true);

insert into public.bankroll_transactions (id, owner_id, wallet_id, transaction_date, transaction_type, direction, amount)
values ('ba300000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', 'ba100000-0000-0000-0000-000000000007', current_date, 'deposit', 'in', 10);
insert into public.bankroll_sessions (id, owner_id, wallet_id, session_date, session_type, game_type, cash_buy_in, cash_out)
values ('ba400000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', 'ba100000-0000-0000-0000-000000000006', current_date, 'cash_game', 'Holdem', 100, 120);

-- Moeda: livre sem historico; bloqueada com movimentacao ou sessao.
update public.bankroll_wallets set currency = 'EUR' where id = 'ba100000-0000-0000-0000-000000000005';
select pg_temp.assert_true((select currency = 'EUR' from public.bankroll_wallets where id = 'ba100000-0000-0000-0000-000000000005'), 'carteira sem historico pode alterar moeda');
select pg_temp.expect_error($sql$update public.bankroll_wallets set currency='USD' where id='ba100000-0000-0000-0000-000000000007'$sql$, 'carteira com movimentacao nao pode alterar moeda');
select pg_temp.expect_error($sql$update public.bankroll_wallets set currency='USD' where id='ba100000-0000-0000-0000-000000000006'$sql$, 'carteira com sessao nao pode alterar moeda');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ba000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Isolamento RLS do usuario A contra dados do usuario B.
select pg_temp.assert_true((select count(*) = 0 from public.bankroll_wallets where owner_id = 'ba000000-0000-0000-0000-000000000002'), 'usuario A nao consulta dados do usuario B');
update public.bankroll_wallets set name = 'violacao' where id = 'ba200000-0000-0000-0000-000000000001';
select pg_temp.assert_true(not exists(select 1 from public.bankroll_wallets where id = 'ba200000-0000-0000-0000-000000000001' and name = 'violacao'), 'usuario A nao altera dados do usuario B');
delete from public.bankroll_wallets where id = 'ba200000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select count(*) = 0 from public.bankroll_wallets where id = 'ba200000-0000-0000-0000-000000000001'), 'usuario A nao enxerga nem exclui carteira do usuario B');
select pg_temp.expect_error($sql$select public.create_bankroll_transfer('ba100000-0000-0000-0000-000000000001','ba200000-0000-0000-0000-000000000001',current_date,10,null,null)$sql$, 'usuario A nao usa carteira do usuario B');
select pg_temp.expect_error($sql$delete from public.bankroll_wallets where id='ba100000-0000-0000-0000-000000000007'$sql$, 'carteira com historico nao pode ser excluida');
update public.bankroll_wallets set active = false where id = 'ba100000-0000-0000-0000-000000000007';
select pg_temp.assert_true((select not active from public.bankroll_wallets where id = 'ba100000-0000-0000-0000-000000000007'), 'carteira com historico pode ser inativada');

-- Transferencia valida: criar, editar e excluir exclusivamente por RPC.
create temporary table bankroll_test_state (transfer_group_id uuid) on commit drop;
insert into bankroll_test_state
select public.create_bankroll_transfer('ba100000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000002',current_date,100,'teste',null);
select pg_temp.assert_true((select count(*) = 2 from public.bankroll_transactions where transfer_group_id = (select transfer_group_id from bankroll_test_state)), 'RPC cria exatamente os dois lados');
select public.update_bankroll_transfer((select transfer_group_id from bankroll_test_state),'ba100000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000002',current_date + 1,125,'editada',null);
select pg_temp.assert_true((select count(*) = 2 and min(amount) = 125 and max(amount) = 125 from public.bankroll_transactions where transfer_group_id = (select transfer_group_id from bankroll_test_state)), 'RPC edita exatamente os dois lados');

-- RLS impede CRUD direto de transferencias e conversoes entre comum/transferencia.
update public.bankroll_transactions set amount = 999 where transfer_group_id = (select transfer_group_id from bankroll_test_state);
select pg_temp.assert_true((select max(amount) = 125 from public.bankroll_transactions where transfer_group_id = (select transfer_group_id from bankroll_test_state)), 'alteracao direta de um lado ou do par e bloqueada');
delete from public.bankroll_transactions where transfer_group_id = (select transfer_group_id from bankroll_test_state);
select pg_temp.assert_true((select count(*) = 2 from public.bankroll_transactions where transfer_group_id = (select transfer_group_id from bankroll_test_state)), 'exclusao direta de um lado ou do par e bloqueada');
update public.bankroll_transactions set transaction_type='deposit', direction='in', transfer_group_id=null, counterpart_wallet_id=null where transfer_group_id = (select transfer_group_id from bankroll_test_state);
select pg_temp.assert_true((select count(*) = 2 from public.bankroll_transactions where transfer_group_id = (select transfer_group_id from bankroll_test_state)), 'transformacao de transferencia em comum e bloqueada');
select pg_temp.expect_error($sql$update public.bankroll_transactions set transaction_type='transfer_out', direction='out', transfer_group_id='ba500000-0000-0000-0000-000000000001', counterpart_wallet_id='ba100000-0000-0000-0000-000000000002' where id='ba300000-0000-0000-0000-000000000001'$sql$, 'transformacao de comum em transferencia e bloqueada');
select pg_temp.expect_error($sql$insert into public.bankroll_transactions(owner_id,wallet_id,transaction_date,transaction_type,direction,amount,transfer_group_id,counterpart_wallet_id) values ('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001',current_date,'transfer_out','out',10,'ba500000-0000-0000-0000-000000000002','ba100000-0000-0000-0000-000000000002')$sql$, 'INSERT direto de transferencia e bloqueado');

select pg_temp.expect_error($sql$select public.create_bankroll_transfer('ba100000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001',current_date,10,null,null)$sql$, 'origem igual ao destino e rejeitada');
select pg_temp.expect_error($sql$select public.create_bankroll_transfer('ba100000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000003',current_date,10,null,null)$sql$, 'moedas diferentes sao rejeitadas');
select pg_temp.expect_error($sql$select public.create_bankroll_transfer('ba100000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000004',current_date,10,null,null)$sql$, 'carteira inativa e rejeitada');

-- Erro na RPC preserva o par original por rollback da instrucao.
select pg_temp.expect_error(format('select public.update_bankroll_transfer(%L,%L,%L,current_date,200,null,null)', (select transfer_group_id from bankroll_test_state), 'ba100000-0000-0000-0000-000000000001', 'ba100000-0000-0000-0000-000000000003'), 'erro na edicao produz rollback completo');
select pg_temp.assert_true((select count(*) = 2 and min(amount) = 125 and max(amount) = 125 from public.bankroll_transactions where transfer_group_id = (select transfer_group_id from bankroll_test_state)), 'par permanece integro depois do rollback');
select public.delete_bankroll_transfer((select transfer_group_id from bankroll_test_state));
select pg_temp.assert_true((select count(*) = 0 from public.bankroll_transactions where transfer_group_id = (select transfer_group_id from bankroll_test_state)), 'RPC exclui exatamente os dois lados');

reset role;

select pg_temp.assert_true((select name = 'B carteira' from public.bankroll_wallets where id = 'ba200000-0000-0000-0000-000000000001'), 'usuario A nao alterou nem excluiu fisicamente os dados do usuario B');
select pg_temp.assert_true(has_function_privilege('authenticated', 'public.create_bankroll_transfer(uuid,uuid,date,numeric,text,text)', 'EXECUTE'), 'authenticated pode executar a RPC oficial');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.create_bankroll_transfer(uuid,uuid,date,numeric,text,text)', 'EXECUTE'), 'anon nao pode executar a RPC oficial');
select pg_temp.assert_true(not has_function_privilege('service_role', 'public.create_bankroll_transfer(uuid,uuid,date,numeric,text,text)', 'EXECUTE'), 'Service Role nao recebe EXECUTE na RPC oficial');

-- Invariantes da trigger diferida, executadas como papel da migration para testar
-- estados que o usuario autenticado jamais consegue criar pela RLS.
select pg_temp.expect_error($sql$insert into public.bankroll_transactions(owner_id,wallet_id,transaction_date,transaction_type,direction,amount,transfer_group_id,counterpart_wallet_id) values ('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001',current_date,'transfer_out','out',10,'ba600000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000002')$sql$, 'grupo com apenas uma linha e rejeitado');
select pg_temp.expect_error($sql$insert into public.bankroll_transactions(owner_id,wallet_id,transaction_date,transaction_type,direction,amount,transfer_group_id,counterpart_wallet_id) values ('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001',current_date,'transfer_out','out',10,'ba600000-0000-0000-0000-000000000002','ba100000-0000-0000-0000-000000000002'),('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000002',current_date,'transfer_in','in',11,'ba600000-0000-0000-0000-000000000002','ba100000-0000-0000-0000-000000000001')$sql$, 'valores divergentes sao rejeitados');
select pg_temp.expect_error($sql$insert into public.bankroll_transactions(owner_id,wallet_id,transaction_date,transaction_type,direction,amount,transfer_group_id,counterpart_wallet_id) values ('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001',current_date,'transfer_out','out',10,'ba600000-0000-0000-0000-000000000003','ba100000-0000-0000-0000-000000000002'),('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000002',current_date+1,'transfer_in','in',10,'ba600000-0000-0000-0000-000000000003','ba100000-0000-0000-0000-000000000001')$sql$, 'datas divergentes sao rejeitadas');
select pg_temp.expect_error($sql$insert into public.bankroll_transactions(owner_id,wallet_id,transaction_date,transaction_type,direction,amount,transfer_group_id,counterpart_wallet_id) values ('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001',current_date,'transfer_out','out',10,'ba600000-0000-0000-0000-000000000004','ba100000-0000-0000-0000-000000000002'),('ba000000-0000-0000-0000-000000000002','ba200000-0000-0000-0000-000000000002',current_date,'transfer_in','in',10,'ba600000-0000-0000-0000-000000000004','ba200000-0000-0000-0000-000000000001')$sql$, 'owners divergentes sao rejeitados');
select pg_temp.expect_error($sql$insert into public.bankroll_transactions(owner_id,wallet_id,transaction_date,transaction_type,direction,amount,transfer_group_id,counterpart_wallet_id) values ('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001',current_date,'transfer_out','out',10,'ba600000-0000-0000-0000-000000000005','ba100000-0000-0000-0000-000000000002'),('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000002',current_date,'transfer_out','out',10,'ba600000-0000-0000-0000-000000000005','ba100000-0000-0000-0000-000000000001')$sql$, 'tipos divergentes sao rejeitados');
select pg_temp.expect_error($sql$insert into public.bankroll_transactions(owner_id,wallet_id,transaction_date,transaction_type,direction,amount,transfer_group_id,counterpart_wallet_id) values ('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001',current_date,'transfer_out','out',10,'ba600000-0000-0000-0000-000000000006','ba100000-0000-0000-0000-000000000002'),('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000002',current_date,'transfer_in','in',10,'ba600000-0000-0000-0000-000000000006','ba100000-0000-0000-0000-000000000001'),('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000002',current_date,'transfer_in','in',10,'ba600000-0000-0000-0000-000000000006','ba100000-0000-0000-0000-000000000001')$sql$, 'grupo com tres linhas e rejeitado');
select pg_temp.expect_error($sql$insert into public.bankroll_transactions(owner_id,wallet_id,transaction_date,transaction_type,direction,amount,transfer_group_id,counterpart_wallet_id) values ('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001',current_date,'transfer_out','out',10,'ba600000-0000-0000-0000-000000000007','ba100000-0000-0000-0000-000000000007'),('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000002',current_date,'transfer_in','in',10,'ba600000-0000-0000-0000-000000000007','ba100000-0000-0000-0000-000000000001')$sql$, 'carteiras invertidas incorretamente sao rejeitadas');
select pg_temp.expect_error($sql$insert into public.bankroll_transactions(owner_id,wallet_id,transaction_date,transaction_type,direction,amount,transfer_group_id,counterpart_wallet_id) values ('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001',current_date,'transfer_out','out',10,'ba600000-0000-0000-0000-000000000008','ba100000-0000-0000-0000-000000000002'),('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000007',current_date,'transfer_in','in',10,'ba600000-0000-0000-0000-000000000008','ba100000-0000-0000-0000-000000000001')$sql$, 'referencias assimetricas sao rejeitadas');

-- Concorrencia (roteiro manual em duas sessoes locais):
-- 1. Crie uma transferencia e anote o grupo.
-- 2. Sessao A: BEGIN; chame update_bankroll_transfer(grupo, ...); nao confirme.
-- 3. Sessao B: BEGIN; chame delete_bankroll_transfer(grupo); a chamada deve aguardar.
-- 4. Confirme A; B prossegue sobre o estado confirmado, bloqueia as mesmas duas linhas
--    em ordem por id e termina integralmente ou gera erro, nunca deixa um lado isolado.
-- 5. Repita invertendo UPDATE/DELETE e finalize ambas com ROLLBACK.

rollback;
