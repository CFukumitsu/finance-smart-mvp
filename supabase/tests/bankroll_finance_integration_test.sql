\set ON_ERROR_STOP on

-- Executar futuramente apenas em Supabase local isolado, após aplicar as Fases 1 e 2.
begin;

-- Permissões efêmeras apenas para as asserções das funções privadas.
-- O ROLLBACK final restaura os grants definidos pela migration.
grant execute on function public.get_finance_balance_for_bankroll(uuid, uuid, uuid) to authenticated;
grant execute on function public.get_wallet_balance_for_finance(uuid, uuid, uuid) to authenticated;

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
end $$;

create or replace function pg_temp.expect_deferred_error(
  p_sql text,
  p_expected_state text,
  p_test_name text
) returns void language plpgsql as $$
declare
  actual_state text;
begin
  begin
    execute p_sql;
    set constraints all immediate;
    raise exception 'FALHOU: % (nenhum erro)', p_test_name;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if actual_state <> p_expected_state then
      raise exception 'FALHOU: % (recebido [%], esperado [%])',
        p_test_name, actual_state, p_expected_state;
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
  '00000000-0000-0000-0000-000000000000',
  'bf000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'bankroll-a@example.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  'bf000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 'bankroll-b@example.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.accounts(
  id, owner_id, name, type, currency, current_balance, active
) values
(
  'bf100000-0000-0000-0000-000000000001',
  'bf000000-0000-0000-0000-000000000001',
  'Conta A', 'Conta', 'BRL', 1000, true
),
(
  'bf100000-0000-0000-0000-000000000002',
  'bf000000-0000-0000-0000-000000000002',
  'Conta B', 'Conta', 'BRL', 1000, true
),
(
  'bf100000-0000-0000-0000-000000000003',
  'bf000000-0000-0000-0000-000000000001',
  'Conta A2', 'Conta', 'BRL', 0, true
);

insert into public.bankroll_wallets(
  id, owner_id, name, wallet_type, currency, initial_balance, active
) values
(
  'bf200000-0000-0000-0000-000000000001',
  'bf000000-0000-0000-0000-000000000001',
  'Carteira A', 'online', 'BRL', 500, true
),
(
  'bf200000-0000-0000-0000-000000000002',
  'bf000000-0000-0000-0000-000000000002',
  'Carteira B', 'online', 'BRL', 500, true
),
(
  'bf200000-0000-0000-0000-000000000003',
  'bf000000-0000-0000-0000-000000000001',
  'Carteira USD', 'online', 'USD', 500, true
);

create temporary table integration_state(
  label text primary key,
  link_id uuid not null,
  finance_id uuid not null,
  bankroll_id uuid not null,
  group_id uuid not null
) on commit drop;
create temporary table idempotency_attempts(
  attempt integer not null,
  link_id uuid not null,
  finance_id uuid not null,
  bankroll_id uuid not null,
  group_id uuid not null
) on commit drop;

grant all on table integration_state, idempotency_attempts to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'bf000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select pg_temp.expect_error($sql$
  select public.create_bankroll_finance_deposit(
    'bf100000-0000-0000-0000-000000000001',
    'bf200000-0000-0000-0000-000000000003',
    current_date, 10, null,
    'bf300000-0000-0000-0000-000000000099'
  )
$sql$, '22023', 'mesma moeda',
  'moeda incompatível é rejeitada');

insert into integration_state
select 'deposit', link_id, finance_transaction_id,
  bankroll_transaction_id, integration_group_id
from public.create_bankroll_finance_deposit(
  'bf100000-0000-0000-0000-000000000001',
  'bf200000-0000-0000-0000-000000000001',
  current_date, 300, 'depósito integrado',
  'bf300000-0000-0000-0000-000000000001'
);

insert into integration_state
select 'withdrawal', link_id, finance_transaction_id,
  bankroll_transaction_id, integration_group_id
from public.create_bankroll_finance_withdrawal(
  'bf100000-0000-0000-0000-000000000001',
  'bf200000-0000-0000-0000-000000000001',
  current_date, 200, 'saque integrado',
  'bf300000-0000-0000-0000-000000000002'
);

select pg_temp.assert_true((
  select finance.status = 'Pago'
     and finance.origin_account_id = finance.account_id
     and finance.destination_account_id is null
     and movement.direction = 'in'
    from integration_state state
    join public.transactions finance on finance.id = state.finance_id
    join public.bankroll_transactions movement on movement.id = state.bankroll_id
   where state.label = 'deposit'
), 'depósito reduz a conta Finance e aumenta a carteira');

select pg_temp.assert_true((
  select finance.status = 'Recebido'
     and finance.origin_account_id is null
     and finance.destination_account_id is null
     and movement.direction = 'out'
    from integration_state state
    join public.transactions finance on finance.id = state.finance_id
    join public.bankroll_transactions movement on movement.id = state.bankroll_id
   where state.label = 'withdrawal'
), 'saque reduz a carteira e aumenta a conta Finance');

select pg_temp.assert_true(
  public.get_finance_balance_for_bankroll(
    'bf000000-0000-0000-0000-000000000001',
    'bf100000-0000-0000-0000-000000000001'
  ) = 900,
  'impacto financeiro mínimo é 1000 - 300 + 200 = 900'
);
select pg_temp.assert_true(
  public.get_wallet_balance_for_finance(
    'bf000000-0000-0000-0000-000000000001',
    'bf200000-0000-0000-0000-000000000001'
  ) = 600,
  'impacto Bankroll é 500 + 300 - 200 = 600'
);

insert into public.transactions(
  owner_id, competence_id, account_id, description, due_date,
  type, mode, value, status
)
select 'bf000000-0000-0000-0000-000000000001', competence.id,
  'bf100000-0000-0000-0000-000000000001',
  'Receita futura temporal', current_date + 30,
  'Receita', 'unico', 10000, 'Recebido'
from public.ensure_competence((current_date + 30)::text) competence;
select pg_temp.assert_true(
  public.get_finance_balance_for_bankroll(
    'bf000000-0000-0000-0000-000000000001',
    'bf100000-0000-0000-0000-000000000001'
  ) = 900,
  'Receita futura não aumenta saldo disponível atual'
);

insert into public.transactions(
  owner_id, competence_id, account_id, description, due_date,
  type, mode, value, status
)
select 'bf000000-0000-0000-0000-000000000001', competence.id,
  'bf100000-0000-0000-0000-000000000001',
  'Despesa futura temporal', current_date + 30,
  'Despesa', 'unico', 5000, 'Pago'
from public.ensure_competence((current_date + 30)::text) competence;
select pg_temp.assert_true(
  public.get_finance_balance_for_bankroll(
    'bf000000-0000-0000-0000-000000000001',
    'bf100000-0000-0000-0000-000000000001'
  ) = 900,
  'Despesa futura não reduz saldo disponível atual'
);

insert into public.transactions(
  owner_id, competence_id, account_id, description, due_date,
  type, mode, value, status
)
select 'bf000000-0000-0000-0000-000000000001', competence.id,
  'bf100000-0000-0000-0000-000000000001',
  'Receita de hoje temporal', current_date,
  'Receita', 'unico', 25, 'Recebido'
from public.ensure_competence(current_date::text) competence;
select pg_temp.assert_true(
  public.get_finance_balance_for_bankroll(
    'bf000000-0000-0000-0000-000000000001',
    'bf100000-0000-0000-0000-000000000001'
  ) = 925,
  'lançamento de hoje participa do saldo disponível'
);

insert into public.transactions(
  owner_id, competence_id, account_id, description, due_date,
  type, mode, value, status
)
select 'bf000000-0000-0000-0000-000000000001', competence.id,
  'bf100000-0000-0000-0000-000000000001',
  'Despesa passada temporal', current_date - 1,
  'Despesa', 'unico', 10, 'Pago'
from public.ensure_competence((current_date - 1)::text) competence;
select pg_temp.assert_true(
  public.get_finance_balance_for_bankroll(
    'bf000000-0000-0000-0000-000000000001',
    'bf100000-0000-0000-0000-000000000001'
  ) = 915,
  'lançamento passado participa do saldo disponível'
);

select public.create_bankroll_finance_deposit(
  'bf100000-0000-0000-0000-000000000001',
  'bf200000-0000-0000-0000-000000000001',
  current_date, 910, 'despesa futura não bloqueia',
  'bf300000-0000-0000-0000-000000000090'
);
select public.delete_bankroll_finance_operation(
  'bf300000-0000-0000-0000-000000000090'
);

select pg_temp.expect_error($sql$
  select public.create_bankroll_finance_deposit(
    'bf100000-0000-0000-0000-000000000001',
    'bf200000-0000-0000-0000-000000000001',
    current_date, 916, null,
    'bf300000-0000-0000-0000-000000000003'
  )
$sql$, '22003', 'Saldo insuficiente na conta financeira',
  'depósito rejeita saldo Finance insuficiente');

select pg_temp.expect_error($sql$
  select public.create_bankroll_finance_withdrawal(
    'bf100000-0000-0000-0000-000000000001',
    'bf200000-0000-0000-0000-000000000001',
    current_date, 601, null,
    'bf300000-0000-0000-0000-000000000004'
  )
$sql$, '22003', 'Saldo insuficiente na carteira do Bankroll',
  'saque rejeita carteira insuficiente');

select pg_temp.assert_true(not exists(
  select 1 from public.transactions
   where bankroll_integration_group_id in (
     'bf300000-0000-0000-0000-000000000003',
     'bf300000-0000-0000-0000-000000000004'
   )
), 'erros de saldo não deixam lançamento parcial');

select pg_temp.expect_error($sql$
  select public.create_bankroll_finance_deposit(
    'bf100000-0000-0000-0000-000000000002',
    'bf200000-0000-0000-0000-000000000001',
    current_date, 10, null, gen_random_uuid()
  )
$sql$, '42501', 'Conta financeira não encontrada',
  'conta de outro owner é rejeitada');

select pg_temp.expect_error($sql$
  select public.create_bankroll_finance_deposit(
    'bf100000-0000-0000-0000-000000000001',
    'bf200000-0000-0000-0000-000000000002',
    current_date, 10, null, gen_random_uuid()
  )
$sql$, '42501', 'Carteira do Bankroll não encontrada',
  'carteira de outro owner é rejeitada');

insert into idempotency_attempts
select 1, link_id, finance_transaction_id,
  bankroll_transaction_id, integration_group_id
from public.create_bankroll_finance_deposit(
  'bf100000-0000-0000-0000-000000000001',
  'bf200000-0000-0000-0000-000000000001',
  current_date, 50, 'idempotente',
  'bf300000-0000-0000-0000-000000000005'
);
insert into idempotency_attempts
select 2, link_id, finance_transaction_id,
  bankroll_transaction_id, integration_group_id
from public.create_bankroll_finance_deposit(
  'bf100000-0000-0000-0000-000000000001',
  'bf200000-0000-0000-0000-000000000001',
  current_date, 50, 'idempotente',
  'bf300000-0000-0000-0000-000000000005'
);
select pg_temp.assert_true((
  select count(*) = 2
     and count(distinct link_id) = 1
     and count(distinct finance_id) = 1
     and count(distinct bankroll_id) = 1
     and count(distinct group_id) = 1
    from idempotency_attempts
), 'repetição idempotente retorna exatamente os mesmos IDs');
select pg_temp.assert_true((
  select
    (select count(*) from public.bankroll_finance_links
      where integration_group_id = 'bf300000-0000-0000-0000-000000000005') = 1
    and
    (select count(*) from public.transactions
      where bankroll_integration_group_id = 'bf300000-0000-0000-0000-000000000005') = 1
    and
    (select count(*) from public.bankroll_transactions
      where bankroll_integration_group_id = 'bf300000-0000-0000-0000-000000000005') = 1
), 'idempotência mantém um vínculo e um registro em cada lado');

select pg_temp.expect_error($sql$
  select public.create_bankroll_finance_deposit(
    'bf100000-0000-0000-0000-000000000001',
    'bf200000-0000-0000-0000-000000000001',
    current_date, 51, 'idempotente',
    'bf300000-0000-0000-0000-000000000005'
  )
$sql$, '22023', 'chave de idempotência',
  'reutilização divergente da chave é rejeitada');
select pg_temp.expect_error($sql$
  select public.create_bankroll_finance_withdrawal(
    'bf100000-0000-0000-0000-000000000001',
    'bf200000-0000-0000-0000-000000000001',
    current_date, 50, 'idempotente',
    'bf300000-0000-0000-0000-000000000005'
  )
$sql$, '22023', 'chave de idempotência',
  'depósito e saque não reutilizam a mesma chave');
select pg_temp.expect_error($sql$
  select public.create_bankroll_finance_deposit(
    'bf100000-0000-0000-0000-000000000001',
    'bf200000-0000-0000-0000-000000000001',
    current_date, 10, null, null
  )
$sql$, '22023', 'chave idempotente',
  'criação exige chave idempotente não nula');

select set_config(
  'request.jwt.claim.sub',
  'bf000000-0000-0000-0000-000000000002',
  true
);
select pg_temp.assert_true(not exists(
  select 1 from public.bankroll_finance_links
   where integration_group_id = 'bf300000-0000-0000-0000-000000000005'
), 'owner diferente não enxerga o vínculo idempotente');
select pg_temp.expect_error($sql$
  select public.update_bankroll_finance_operation(
    'bf300000-0000-0000-0000-000000000005',
    'bf100000-0000-0000-0000-000000000002',
    'bf200000-0000-0000-0000-000000000002',
    current_date, 50, 'idempotente'
  )
$sql$, '42501', 'Integração não encontrada',
  'owner diferente não atualiza a integração idempotente');
select pg_temp.expect_error($sql$
  select public.delete_bankroll_finance_operation(
    'bf300000-0000-0000-0000-000000000005'
  )
$sql$, '42501', 'Integração não encontrada',
  'owner diferente não exclui a integração idempotente');
select set_config(
  'request.jwt.claim.sub',
  'bf000000-0000-0000-0000-000000000001',
  true
);

select pg_temp.expect_error(format(
  'update public.transactions set value = value + 1 where id = %L',
  (select finance_id from integration_state where label = 'deposit')
), '42501', 'fluxo oficial do Bankroll',
  'lançamento integrado não aceita update direto');

select pg_temp.expect_error(format(
  'delete from public.bankroll_transactions where id = %L',
  (select bankroll_id from integration_state where label = 'withdrawal')
), '42501', 'fluxo oficial do Bankroll',
  'movimentação integrada não aceita delete direto');

select pg_temp.expect_error($sql$
  insert into public.bankroll_finance_links(
    owner_id, operation_type, finance_transaction_id,
    bankroll_transaction_id, integration_group_id
  ) values (
    'bf000000-0000-0000-0000-000000000001', 'deposit',
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
  )
$sql$, '42501', '', 'authenticated não possui INSERT no vínculo');
select pg_temp.expect_error($sql$
  update public.bankroll_finance_links set updated_at = now()
$sql$, '42501', '', 'authenticated não possui UPDATE no vínculo');
select pg_temp.expect_error($sql$
  delete from public.bankroll_finance_links
$sql$, '42501', '', 'authenticated não possui DELETE no vínculo');
select pg_temp.expect_error($sql$
  insert into public.bankroll_finance_links(
    owner_id, operation_type, finance_transaction_id,
    bankroll_transaction_id, integration_group_id
  ) values (
    'bf000000-0000-0000-0000-000000000001', 'deposit',
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
  ) on conflict (integration_group_id) do update set updated_at = now()
$sql$, '42501', '', 'authenticated não possui UPSERT no vínculo');

select public.update_bankroll_finance_operation(
  (select group_id from integration_state where label = 'deposit'),
  'bf100000-0000-0000-0000-000000000001',
  'bf200000-0000-0000-0000-000000000001',
  current_date, 250, 'depósito atualizado'
);
select pg_temp.assert_true((
  select finance.value = 250
     and movement.amount = 250
     and finance.bankroll_operation_type = 'deposit'
     and movement.transaction_type = 'deposit'
    from integration_state state
    join public.transactions finance on finance.id = state.finance_id
    join public.bankroll_transactions movement on movement.id = state.bankroll_id
   where state.label = 'deposit'
), 'atualização válida preserva valor e direção nos dois lados');

select pg_temp.expect_error(format(
  'select public.update_bankroll_finance_operation(%L,%L,%L,current_date,9999,null)',
  (select group_id from integration_state where label = 'deposit'),
  'bf100000-0000-0000-0000-000000000001',
  'bf200000-0000-0000-0000-000000000001'
), '22003', 'Saldo insuficiente na conta financeira',
  'update inválido faz rollback atômico');
select pg_temp.assert_true((
  select finance.value = 250 and movement.amount = 250
    from integration_state state
    join public.transactions finance on finance.id = state.finance_id
    join public.bankroll_transactions movement on movement.id = state.bankroll_id
   where state.label = 'deposit'
), 'falha de update preserva os dois lados');

reset role;
select pg_temp.expect_deferred_error(format(
  'delete from public.bankroll_finance_links where id = %L',
  (select link_id from integration_state where label = 'deposit')
), '23514', 'vínculo órfão é rejeitado pela invariante');
select pg_temp.expect_deferred_error(format(
  'update public.bankroll_transactions set direction = ''out'' where id = %L',
  (select bankroll_id from integration_state where label = 'deposit')
), '23514', 'direção divergente é rejeitada');
select pg_temp.expect_deferred_error(format(
  'update public.transactions set value = value + 1 where id = %L',
  (select finance_id from integration_state where label = 'deposit')
), '23514', 'valor divergente é rejeitado');
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'bf000000-0000-0000-0000-000000000001',
  true
);

-- Não regressão: os tipos antigos continuam usando seus campos e permissões.
insert into public.transactions(
  owner_id, competence_id, account_id, description, due_date,
  type, mode, value, status
)
select
  'bf000000-0000-0000-0000-000000000001', competence.id,
  'bf100000-0000-0000-0000-000000000001', item.description,
  current_date, item.type, 'unico', item.value, item.status
from public.ensure_competence(current_date::text) competence
cross join (values
  ('Receita comum', 'Receita', 10::numeric, 'Recebido'),
  ('Despesa comum', 'Despesa', 10::numeric, 'Pago'),
  ('Pagamento comum', 'Pagamento de Fatura', 10::numeric, 'Pago'),
  ('Saldo anterior', 'Receita', 10::numeric, 'Recebido')
) item(description, type, value, status);

insert into public.transactions(
  owner_id, competence_id, account_id, origin_account_id,
  destination_account_id, description, due_date, type, mode, value, status
)
select
  'bf000000-0000-0000-0000-000000000001', competence.id,
  'bf100000-0000-0000-0000-000000000001',
  'bf100000-0000-0000-0000-000000000001',
  'bf100000-0000-0000-0000-000000000003',
  'Transferência tradicional', current_date, 'Transferência',
  'unico', 10, 'Pago'
from public.ensure_competence(current_date::text) competence;

select pg_temp.assert_true((
  select count(*) = 5 from public.transactions
   where description in (
     'Receita comum', 'Despesa comum', 'Pagamento comum',
     'Saldo anterior', 'Transferência tradicional'
   )
   and bankroll_integration_group_id is null
   and bankroll_operation_type is null
), 'transações Finance antigas permanecem independentes do Bankroll');

select public.delete_bankroll_finance_operation(
  (select group_id from integration_state where label = 'withdrawal')
);
select pg_temp.assert_true((
  select not exists(
    select 1 from public.bankroll_finance_links
     where integration_group_id =
       (select group_id from integration_state where label = 'withdrawal')
  ) and not exists(
    select 1 from public.transactions
     where id = (select finance_id from integration_state where label = 'withdrawal')
  ) and not exists(
    select 1 from public.bankroll_transactions
     where id = (select bankroll_id from integration_state where label = 'withdrawal')
  )
), 'reversão específica remove vínculo e os dois lados atomicamente');
select pg_temp.expect_error(format(
  'select public.delete_bankroll_finance_operation(%L)',
  (select group_id from integration_state where label = 'withdrawal')
), '42501', 'Integração não encontrada',
  'repetição da exclusão possui erro explícito');

rollback;
