-- Bankroll Poker - Fase 2. Preparada para revisao; nao aplicar automaticamente.
-- Contas historicas permanecem sem moeda ate confirmacao explicita do usuario.

alter table public.accounts
  add column currency text;

alter table public.accounts
  alter column currency set default 'BRL';

alter table public.accounts
  add constraint accounts_currency_check check (
    currency is null or currency ~ '^[A-Z]{3}$'
  );

alter table public.transactions
  add column bankroll_integration_group_id uuid,
  add column bankroll_operation_type text;

alter table public.bankroll_transactions
  add column bankroll_integration_group_id uuid;

alter table public.transactions
  add constraint transactions_bankroll_operation_check check (
    (bankroll_integration_group_id is null and bankroll_operation_type is null)
    or
    (
      bankroll_integration_group_id is not null
      and type = 'Transferência'
      and (
        bankroll_operation_type = 'deposit'
        and status = 'Pago'
        and origin_account_id = account_id
        and destination_account_id is null
        or
        bankroll_operation_type = 'withdrawal'
        and status = 'Recebido'
        and origin_account_id is null
        and destination_account_id is null
      )
    )
  );

alter table public.bankroll_transactions
  add constraint bankroll_transactions_finance_group_check check (
    bankroll_integration_group_id is null
    or (
      transfer_group_id is null
      and counterpart_wallet_id is null
      and transaction_type in ('deposit', 'withdrawal')
      and direction = case transaction_type when 'deposit' then 'in' else 'out' end
    )
  );

alter table public.transactions
  add constraint transactions_owner_id_id_key unique (owner_id, id),
  add constraint transactions_owner_id_id_bankroll_group_key
    unique (owner_id, id, bankroll_integration_group_id);

alter table public.bankroll_transactions
  add constraint bankroll_transactions_owner_id_id_bankroll_group_key
    unique (owner_id, id, bankroll_integration_group_id);

create unique index transactions_bankroll_integration_group_key
  on public.transactions (bankroll_integration_group_id)
  where bankroll_integration_group_id is not null;

create unique index bankroll_transactions_finance_group_key
  on public.bankroll_transactions (bankroll_integration_group_id)
  where bankroll_integration_group_id is not null;

create table public.bankroll_finance_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  operation_type text not null check (operation_type in ('deposit', 'withdrawal')),
  finance_transaction_id uuid not null,
  bankroll_transaction_id uuid not null,
  integration_group_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bankroll_finance_links_finance_unique unique (finance_transaction_id),
  constraint bankroll_finance_links_bankroll_unique unique (bankroll_transaction_id),
  constraint bankroll_finance_links_group_unique unique (integration_group_id),
  constraint bankroll_finance_links_finance_owner_fk
    foreign key (owner_id, finance_transaction_id, integration_group_id)
    references public.transactions(owner_id, id, bankroll_integration_group_id)
    on delete restrict,
  constraint bankroll_finance_links_bankroll_owner_fk
    foreign key (owner_id, bankroll_transaction_id, integration_group_id)
    references public.bankroll_transactions(owner_id, id, bankroll_integration_group_id)
    on delete restrict
);

create index bankroll_finance_links_owner_created_idx
  on public.bankroll_finance_links (owner_id, created_at desc);

alter table public.bankroll_finance_links enable row level security;

create policy bankroll_finance_links_owner_select
  on public.bankroll_finance_links for select to authenticated
  using (owner_id = auth.uid());
create policy bankroll_finance_links_no_direct_insert
  on public.bankroll_finance_links for insert to authenticated
  with check (false);
create policy bankroll_finance_links_no_direct_update
  on public.bankroll_finance_links for update to authenticated
  using (false) with check (false);
create policy bankroll_finance_links_no_direct_delete
  on public.bankroll_finance_links for delete to authenticated
  using (false);

create or replace function public.normalize_account_currency()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.currency := nullif(upper(trim(new.currency)), '');
  return new;
end;
$$;

create or replace function public.protect_account_currency_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  has_history boolean;
begin
  -- NULL -> codigo e confirmacao inicial, nao reinterpretacao de moeda existente.
  if old.currency is null or old.currency is not distinct from new.currency then
    return new;
  end if;

  select
    exists (
      select 1 from public.transactions transaction_row
       where transaction_row.owner_id = old.owner_id
         and old.id in (
           transaction_row.account_id,
           transaction_row.origin_account_id,
           transaction_row.destination_account_id,
           transaction_row.card_payment_account_id
         )
    )
    or exists (
      select 1 from public.account_closures closure
       where closure.owner_id = old.owner_id
         and old.id in (closure.account_id, closure.payment_account_id)
    )
    or exists (
      select 1 from public.credit_card_statements statement
       where statement.owner_id = old.owner_id
         and old.id in (statement.account_id, statement.payment_account_id)
    )
    or exists (
      select 1 from public.recurring_transactions recurrence
       where recurrence.owner_id = old.owner_id
         and recurrence.account_id = old.id
    )
    or exists (
      select 1 from public.financial_targets target
       where target.owner_id = old.owner_id
         and target.target_type = 'account'
         and target.target_id = old.id
    )
    or exists (
      select 1
        from public.bankroll_finance_links link
        join public.transactions transaction_row
          on transaction_row.id = link.finance_transaction_id
         and transaction_row.owner_id = link.owner_id
       where link.owner_id = old.owner_id
         and transaction_row.account_id = old.id
    )
  into has_history;

  if has_history then
    raise exception 'A moeda desta conta não pode ser alterada porque ela já possui histórico financeiro.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.get_account_currency_history_flags()
returns table (account_id uuid)
language sql
security definer
set search_path = pg_catalog
stable
as $$
  select distinct history.account_id
    from (
      select transaction_row.account_id
        from public.transactions transaction_row
       where transaction_row.owner_id = auth.uid()
      union all
      select transaction_row.origin_account_id
        from public.transactions transaction_row
       where transaction_row.owner_id = auth.uid()
      union all
      select transaction_row.destination_account_id
        from public.transactions transaction_row
       where transaction_row.owner_id = auth.uid()
      union all
      select closure.account_id from public.account_closures closure
       where closure.owner_id = auth.uid()
      union all
      select closure.payment_account_id from public.account_closures closure
       where closure.owner_id = auth.uid()
      union all
      select statement.account_id from public.credit_card_statements statement
       where statement.owner_id = auth.uid()
      union all
      select statement.payment_account_id from public.credit_card_statements statement
       where statement.owner_id = auth.uid()
      union all
      select recurrence.account_id from public.recurring_transactions recurrence
       where recurrence.owner_id = auth.uid()
      union all
      select target.target_id from public.financial_targets target
       where target.owner_id = auth.uid() and target.target_type = 'account'
    ) history
   where history.account_id is not null;
$$;

-- Ordem global: todos os locks owner+competencia, depois owner+competencia+conta.
create or replace function public.lock_financial_scope(
  p_period_keys text[],
  p_account_keys text[] default array[]::text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  lock_key text;
begin
  for lock_key in
    select distinct value from unnest(coalesce(p_period_keys, array[]::text[])) value
     where value is not null order by value
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('finance:period:' || lock_key, 0)
    );
  end loop;

  for lock_key in
    select distinct value from unnest(coalesce(p_account_keys, array[]::text[])) value
     where value is not null order by value
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('finance:account:' || lock_key, 0)
    );
  end loop;
end;
$$;

create or replace function public.lock_bankroll_finance_group(
  p_integration_group_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_integration_group_id is null then
    raise exception 'Informe a chave idempotente da integração.'
      using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'bankroll:finance-group:' || p_integration_group_id::text,
      0
    )
  );
end;
$$;

create or replace function public.bankroll_finance_mutation_guard()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  linked boolean := false;
begin
  -- As RPCs oficiais sao owned by postgres. O papel nao e acessivel pela API.
  -- Escrita administrativa continua sujeita a constraint trigger diferivel.
  if current_user = 'postgres' then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'bankroll_finance_links' then
    linked := true;
  elsif tg_table_name = 'transactions' then
    linked := coalesce(new.bankroll_integration_group_id, old.bankroll_integration_group_id) is not null;
  elsif tg_table_name = 'bankroll_transactions' then
    linked := coalesce(new.bankroll_integration_group_id, old.bankroll_integration_group_id) is not null;
  end if;

  if linked then
    raise exception 'Operações integradas devem usar o fluxo oficial do Bankroll.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.assert_bankroll_finance_invariant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  group_id uuid;
  link_count integer;
  finance_count integer;
  bankroll_count integer;
  valid_count integer;
begin
  if tg_table_name = 'bankroll_finance_links' then
    group_id := coalesce(new.integration_group_id, old.integration_group_id);
  else
    group_id := coalesce(new.bankroll_integration_group_id, old.bankroll_integration_group_id);
  end if;
  if group_id is null then return null; end if;

  select count(*) into link_count from public.bankroll_finance_links where integration_group_id = group_id;
  select count(*) into finance_count from public.transactions where bankroll_integration_group_id = group_id;
  select count(*) into bankroll_count from public.bankroll_transactions where bankroll_integration_group_id = group_id;

  if link_count = 0 and finance_count = 0 and bankroll_count = 0 then return null; end if;
  if link_count <> 1 or finance_count <> 1 or bankroll_count <> 1 then
    raise exception 'A integração deve possuir exatamente um vínculo, um lançamento e uma movimentação.'
      using errcode = '23514';
  end if;

  select count(*) into valid_count
    from public.bankroll_finance_links link
    join public.transactions finance
      on finance.id = link.finance_transaction_id
     and finance.owner_id = link.owner_id
     and finance.bankroll_integration_group_id = link.integration_group_id
    join public.bankroll_transactions movement
      on movement.id = link.bankroll_transaction_id
     and movement.owner_id = link.owner_id
     and movement.bankroll_integration_group_id = link.integration_group_id
    join public.accounts account_row
      on account_row.id = finance.account_id and account_row.owner_id = link.owner_id
    join public.bankroll_wallets wallet
      on wallet.id = movement.wallet_id and wallet.owner_id = link.owner_id
   where link.integration_group_id = group_id
     and finance.type = 'Transferência'
     and finance.bankroll_operation_type = link.operation_type
     and movement.transaction_type = link.operation_type
     and movement.direction = case link.operation_type when 'deposit' then 'in' else 'out' end
     and finance.status = case link.operation_type when 'deposit' then 'Pago' else 'Recebido' end
     and finance.value = movement.amount
     and finance.due_date = movement.transaction_date
     and account_row.type = 'Conta'
     and account_row.currency is not null
     and account_row.currency = wallet.currency
     and (
       link.operation_type = 'deposit'
       and finance.origin_account_id = finance.account_id
       and finance.destination_account_id is null
       or
       link.operation_type = 'withdrawal'
       and finance.origin_account_id is null
       and finance.destination_account_id is null
     );

  if valid_count <> 1 then
    raise exception 'Os registros da integração estão inconsistentes.'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create or replace function public.assert_financial_scope_open(
  p_owner_id uuid,
  p_competence_id uuid,
  p_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  competence_status text;
begin
  select competence.status into competence_status
    from public.competences competence
   where competence.id = p_competence_id and competence.owner_id = p_owner_id;
  if competence_status is null then
    raise exception 'Competência não encontrada.' using errcode = '42501';
  end if;
  if competence_status = 'FECHADA'
     or exists (
       select 1 from public.competence_closures closure
        where closure.owner_id = p_owner_id
          and closure.competence_id = p_competence_id
          and closure.status = 'Fechada'
     ) then
    raise exception 'A competência deste lançamento está fechada.' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.account_closures closure
     where closure.owner_id = p_owner_id
       and closure.competence_id = p_competence_id
       and closure.account_id = p_account_id
       and coalesce(closure.status, 'Fechada') = 'Fechada'
  ) then
    raise exception 'A conta financeira já está fechada nesta competência.' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.get_finance_balance_for_bankroll(
  p_owner_id uuid,
  p_account_id uuid,
  p_excluded_integration_group_id uuid default null
)
returns numeric
language sql
security definer
set search_path = pg_catalog
as $$
  select coalesce(account_row.current_balance, 0) + coalesce(sum(
    case
      when movement.bankroll_integration_group_id = p_excluded_integration_group_id then 0
      when movement.account_id = p_account_id and movement.type = 'Receita'
        then abs(movement.value)
      when movement.destination_account_id = p_account_id and movement.type = 'Transferência'
        then abs(movement.value)
      when movement.account_id = p_account_id and movement.type = 'Transferência'
        and movement.status = 'Recebido' then abs(movement.value)
      when movement.account_id = p_account_id
        and movement.type in ('Despesa', 'Pagamento de Fatura') then -abs(movement.value)
      when movement.account_id = p_account_id and movement.type = 'Transferência'
        and movement.status <> 'Recebido' then -abs(movement.value)
      else 0
    end
  ), 0)
  from public.accounts account_row
  left join public.transactions movement
    on movement.owner_id = account_row.owner_id
   and movement.due_date <= current_date
   and (
     movement.account_id = account_row.id
     or movement.destination_account_id = account_row.id
   )
  where account_row.owner_id = p_owner_id
    and account_row.id = p_account_id
  group by account_row.current_balance;
$$;

create or replace function public.get_wallet_balance_for_finance(
  p_owner_id uuid,
  p_wallet_id uuid,
  p_excluded_integration_group_id uuid default null
)
returns numeric
language sql
security definer
set search_path = pg_catalog
as $$
  select wallet.initial_balance
    + coalesce((
      select sum(
        case
          when movement.bankroll_integration_group_id = p_excluded_integration_group_id then 0
          when movement.direction = 'in' then movement.amount
          else -movement.amount
        end
      )
      from public.bankroll_transactions movement
      where movement.owner_id = wallet.owner_id
        and movement.wallet_id = wallet.id
    ), 0)
    + coalesce((
      select sum(
        case
          when session.session_type = 'cash_game'
            then coalesce(session.cash_out, 0)
              - coalesce(session.cash_buy_in, 0)
              - session.fees
          else session.prize
            - session.buy_in
            - session.reentries * session.reentry_cost
            - session.add_on_cost
            - session.fees
        end
      )
      from public.bankroll_sessions session
      where session.owner_id = wallet.owner_id
        and session.wallet_id = wallet.id
    ), 0)
  from public.bankroll_wallets wallet
  where wallet.owner_id = p_owner_id
    and wallet.id = p_wallet_id;
$$;

create or replace function public.create_bankroll_finance_operation_internal(
  p_operation_type text,
  p_account_id uuid,
  p_wallet_id uuid,
  p_date date,
  p_amount numeric,
  p_notes text,
  p_idempotency_key uuid
)
returns table (link_id uuid, finance_transaction_id uuid, bankroll_transaction_id uuid, integration_group_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  competence_row public.competences;
  account_row public.accounts;
  wallet_row public.bankroll_wallets;
  group_id uuid := p_idempotency_key;
  finance_id uuid;
  bankroll_id uuid;
  created_link_id uuid;
  existing_link public.bankroll_finance_links;
  existing_finance public.transactions;
  existing_bankroll public.bankroll_transactions;
  available_balance numeric;
begin
  if authenticated_owner_id is null then raise exception 'Usuário não autenticado.' using errcode = '42501'; end if;
  if p_operation_type not in ('deposit', 'withdrawal') then raise exception 'Tipo de operação integrada inválido.' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor deve ser maior que zero.' using errcode = '22023'; end if;
  if p_date is null then raise exception 'Informe a data da operação.' using errcode = '22007'; end if;
  if p_date > current_date then
    raise exception 'Operações integradas futuras não são permitidas porque ainda não existe status pendente ou agendado no Bankroll.' using errcode = '22007';
  end if;
  if p_idempotency_key is null then
    raise exception 'Informe a chave idempotente da integração.'
      using errcode = '22023';
  end if;

  -- Ordem global: grupo; escopo; conta; carteira; vínculo; Finance; Bankroll.
  perform public.lock_bankroll_finance_group(group_id);
  select * into competence_row from public.ensure_competence(p_date::text);
  perform public.lock_financial_scope(
    array[authenticated_owner_id::text || ':' || competence_row.id::text],
    array[authenticated_owner_id::text || ':' || competence_row.id::text || ':' || p_account_id::text]
  );

  select * into account_row from public.accounts
   where id = p_account_id and accounts.owner_id = authenticated_owner_id for update;
  select * into wallet_row from public.bankroll_wallets
   where id = p_wallet_id and bankroll_wallets.owner_id = authenticated_owner_id for update;
  if account_row.id is null then raise exception 'Conta financeira não encontrada.' using errcode = '42501'; end if;
  if wallet_row.id is null then raise exception 'Carteira do Bankroll não encontrada.' using errcode = '42501'; end if;

  select * into existing_link
    from public.bankroll_finance_links link
   where link.owner_id = authenticated_owner_id
     and link.integration_group_id = group_id
   for update;
  if existing_link.id is not null then
    select * into existing_finance from public.transactions
     where owner_id = authenticated_owner_id
       and id = existing_link.finance_transaction_id
     for update;
    select * into existing_bankroll from public.bankroll_transactions
     where owner_id = authenticated_owner_id
       and id = existing_link.bankroll_transaction_id
     for update;
    if existing_link.operation_type <> p_operation_type
       or existing_finance.account_id <> p_account_id
       or existing_bankroll.wallet_id <> p_wallet_id
       or existing_finance.due_date <> p_date
       or existing_finance.value <> p_amount
       or coalesce(existing_bankroll.notes, '') <> coalesce(nullif(trim(p_notes), ''), '') then
      raise exception 'A chave de idempotência já foi usada com dados diferentes.'
        using errcode = '22023';
    end if;
    return query select existing_link.id, existing_finance.id,
      existing_bankroll.id, existing_link.integration_group_id;
    return;
  end if;

  if account_row.type <> 'Conta' then raise exception 'Cartões de crédito não podem participar desta operação.' using errcode = '22023'; end if;
  if not account_row.active then raise exception 'A conta financeira está inativa.' using errcode = '22023'; end if;
  if not wallet_row.active then raise exception 'A carteira do Bankroll está inativa.' using errcode = '22023'; end if;
  if account_row.currency is null then raise exception 'Confirme a moeda desta conta antes de utilizá-la em integrações.' using errcode = '22023'; end if;
  if account_row.currency <> wallet_row.currency then raise exception 'A conta financeira e a carteira precisam usar a mesma moeda.' using errcode = '22023'; end if;

  perform public.assert_financial_scope_open(
    authenticated_owner_id, competence_row.id, p_account_id
  );

  if p_operation_type = 'deposit' then
    available_balance := public.get_finance_balance_for_bankroll(
      authenticated_owner_id, p_account_id
    );
    if available_balance < p_amount then
      raise exception 'Saldo insuficiente na conta financeira.'
        using errcode = '22003';
    end if;
  else
    available_balance := public.get_wallet_balance_for_finance(
      authenticated_owner_id, p_wallet_id
    );
    if available_balance < p_amount then
      raise exception 'Saldo insuficiente na carteira do Bankroll.'
        using errcode = '22003';
    end if;
  end if;

  insert into public.transactions (
    owner_id, competence_id, account_id, description, due_date, type, mode,
    value, status, origin_account_id, destination_account_id,
    bankroll_integration_group_id, bankroll_operation_type
  ) values (
    authenticated_owner_id, competence_row.id, p_account_id,
    case p_operation_type when 'deposit' then 'Depósito no Bankroll — ' else 'Saque do Bankroll — ' end || wallet_row.name,
    p_date, 'Transferência', 'unico', p_amount,
    case p_operation_type when 'deposit' then 'Pago' else 'Recebido' end,
    case p_operation_type when 'deposit' then p_account_id else null end,
    null,
    group_id, p_operation_type
  ) returning id into finance_id;

  insert into public.bankroll_transactions (
    owner_id, wallet_id, transaction_date, transaction_type, direction, amount,
    description, notes, bankroll_integration_group_id
  ) values (
    authenticated_owner_id, p_wallet_id, p_date, p_operation_type,
    case p_operation_type when 'deposit' then 'in' else 'out' end,
    p_amount,
    case p_operation_type when 'deposit' then 'Depósito integrado ao Financeiro' else 'Saque integrado ao Financeiro' end,
    nullif(trim(p_notes), ''), group_id
  ) returning id into bankroll_id;

  insert into public.bankroll_finance_links (
    owner_id, operation_type, finance_transaction_id,
    bankroll_transaction_id, integration_group_id
  ) values (authenticated_owner_id, p_operation_type, finance_id, bankroll_id, group_id)
  returning id into created_link_id;

  return query select created_link_id, finance_id, bankroll_id, group_id;
end;
$$;

create or replace function public.create_bankroll_finance_deposit(
  p_account_id uuid, p_wallet_id uuid, p_date date, p_amount numeric,
  p_notes text, p_idempotency_key uuid
)
returns table (link_id uuid, finance_transaction_id uuid, bankroll_transaction_id uuid, integration_group_id uuid)
language sql security definer set search_path = pg_catalog
as $$ select * from public.create_bankroll_finance_operation_internal('deposit', p_account_id, p_wallet_id, p_date, p_amount, p_notes, p_idempotency_key); $$;

create or replace function public.create_bankroll_finance_withdrawal(
  p_account_id uuid, p_wallet_id uuid, p_date date, p_amount numeric,
  p_notes text, p_idempotency_key uuid
)
returns table (link_id uuid, finance_transaction_id uuid, bankroll_transaction_id uuid, integration_group_id uuid)
language sql security definer set search_path = pg_catalog
as $$ select * from public.create_bankroll_finance_operation_internal('withdrawal', p_account_id, p_wallet_id, p_date, p_amount, p_notes, p_idempotency_key); $$;

create or replace function public.update_bankroll_finance_operation(
  p_integration_group_id uuid, p_account_id uuid, p_wallet_id uuid,
  p_date date, p_amount numeric, p_notes text default null
)
returns table (link_id uuid, finance_transaction_id uuid, bankroll_transaction_id uuid, integration_group_id uuid)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  link_row public.bankroll_finance_links;
  finance_row public.transactions;
  bankroll_row public.bankroll_transactions;
  new_competence public.competences;
  new_account public.accounts;
  new_wallet public.bankroll_wallets;
  affected integer;
begin
  if authenticated_owner_id is null then raise exception 'Usuário não autenticado.' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor deve ser maior que zero.' using errcode = '22023'; end if;
  if p_date is null then raise exception 'Informe a data da operação.' using errcode = '22007'; end if;
  if p_date > current_date then raise exception 'Operações integradas futuras não são permitidas porque ainda não existe status pendente ou agendado no Bankroll.' using errcode = '22007'; end if;

  -- O lock do grupo serializa criação idempotente, atualização e exclusão.
  perform public.lock_bankroll_finance_group(p_integration_group_id);
  select * into link_row from public.bankroll_finance_links link
   where link.owner_id = authenticated_owner_id and link.integration_group_id = p_integration_group_id;
  if link_row.id is null then raise exception 'Integração não encontrada.' using errcode = '42501'; end if;
  select * into finance_row from public.transactions transaction_row
   where transaction_row.owner_id = authenticated_owner_id and transaction_row.id = link_row.finance_transaction_id;
  select * into bankroll_row from public.bankroll_transactions movement
   where movement.owner_id = authenticated_owner_id and movement.id = link_row.bankroll_transaction_id;
  if finance_row.id is null or bankroll_row.id is null
     or finance_row.bankroll_integration_group_id <> link_row.integration_group_id
     or bankroll_row.bankroll_integration_group_id <> link_row.integration_group_id
     or finance_row.bankroll_operation_type <> link_row.operation_type
     or bankroll_row.transaction_type <> link_row.operation_type
     or finance_row.value <> bankroll_row.amount
     or finance_row.due_date <> bankroll_row.transaction_date
     or finance_row.status <> (case link_row.operation_type when 'deposit' then 'Pago' else 'Recebido' end)
     or bankroll_row.direction <> (case link_row.operation_type when 'deposit' then 'in' else 'out' end) then
    raise exception 'A integração está inconsistente.' using errcode = '55000';
  end if;

  select * into new_competence from public.ensure_competence(p_date::text);
  perform public.lock_financial_scope(
    array[
      authenticated_owner_id::text || ':' || finance_row.competence_id::text,
      authenticated_owner_id::text || ':' || new_competence.id::text
    ],
    array[
      authenticated_owner_id::text || ':' || finance_row.competence_id::text || ':' || finance_row.account_id::text,
      authenticated_owner_id::text || ':' || new_competence.id::text || ':' || p_account_id::text
    ]
  );

  perform 1 from public.accounts account_row
   where account_row.owner_id = authenticated_owner_id and account_row.id in (finance_row.account_id, p_account_id)
   order by account_row.id for update;
  perform 1 from public.bankroll_wallets wallet_row
   where wallet_row.owner_id = authenticated_owner_id and wallet_row.id in (bankroll_row.wallet_id, p_wallet_id)
   order by wallet_row.id for update;

  -- Depois de grupo, escopo, contas e carteiras: vínculo, Finance e Bankroll.
  select * into link_row from public.bankroll_finance_links link
   where link.owner_id = authenticated_owner_id
     and link.integration_group_id = p_integration_group_id
   for update;
  select * into finance_row from public.transactions transaction_row
   where transaction_row.owner_id = authenticated_owner_id
     and transaction_row.id = link_row.finance_transaction_id
   for update;
  select * into bankroll_row from public.bankroll_transactions movement
   where movement.owner_id = authenticated_owner_id
     and movement.id = link_row.bankroll_transaction_id
   for update;
  if link_row.id is null or finance_row.id is null or bankroll_row.id is null
     or finance_row.bankroll_integration_group_id <> link_row.integration_group_id
     or bankroll_row.bankroll_integration_group_id <> link_row.integration_group_id
     or finance_row.bankroll_operation_type <> link_row.operation_type
     or bankroll_row.transaction_type <> link_row.operation_type
     or finance_row.value <> bankroll_row.amount
     or finance_row.due_date <> bankroll_row.transaction_date
     or finance_row.status <> (case link_row.operation_type when 'deposit' then 'Pago' else 'Recebido' end)
     or bankroll_row.direction <> (case link_row.operation_type when 'deposit' then 'in' else 'out' end) then
    raise exception 'A integração está inconsistente.' using errcode = '55000';
  end if;

  perform public.assert_financial_scope_open(authenticated_owner_id, finance_row.competence_id, finance_row.account_id);
  perform public.assert_financial_scope_open(authenticated_owner_id, new_competence.id, p_account_id);

  select * into new_account from public.accounts where id = p_account_id and accounts.owner_id = authenticated_owner_id;
  select * into new_wallet from public.bankroll_wallets where id = p_wallet_id and bankroll_wallets.owner_id = authenticated_owner_id;
  if new_account.id is null then raise exception 'Conta financeira não encontrada.' using errcode = '42501'; end if;
  if new_wallet.id is null then raise exception 'Carteira do Bankroll não encontrada.' using errcode = '42501'; end if;
  if new_account.type <> 'Conta' or not new_account.active then raise exception 'A nova conta financeira não está elegível.' using errcode = '22023'; end if;
  if not new_wallet.active then raise exception 'A nova carteira do Bankroll está inativa.' using errcode = '22023'; end if;
  if new_account.currency is null then raise exception 'Confirme a moeda desta conta antes de utilizá-la em integrações.' using errcode = '22023'; end if;
  if new_account.currency <> new_wallet.currency then raise exception 'A conta financeira e a carteira precisam usar a mesma moeda.' using errcode = '22023'; end if;

  if link_row.operation_type = 'deposit' then
    if public.get_finance_balance_for_bankroll(
      authenticated_owner_id, p_account_id, link_row.integration_group_id
    ) < p_amount then
      raise exception 'Saldo insuficiente na conta financeira.'
        using errcode = '22003';
    end if;
  elsif public.get_wallet_balance_for_finance(
    authenticated_owner_id, p_wallet_id, link_row.integration_group_id
  ) < p_amount then
    raise exception 'Saldo insuficiente na carteira do Bankroll.'
      using errcode = '22003';
  end if;

  update public.transactions set
    competence_id = new_competence.id,
    account_id = p_account_id,
    description = case link_row.operation_type when 'deposit' then 'Depósito no Bankroll — ' else 'Saque do Bankroll — ' end || new_wallet.name,
    due_date = p_date,
    value = p_amount,
    status = case link_row.operation_type when 'deposit' then 'Pago' else 'Recebido' end,
    origin_account_id = case link_row.operation_type when 'deposit' then p_account_id else null end,
    destination_account_id = null,
    updated_at = now()
   where id = finance_row.id and transactions.owner_id = authenticated_owner_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'A integração está inconsistente.' using errcode = '55000'; end if;

  update public.bankroll_transactions set
    wallet_id = p_wallet_id, transaction_date = p_date, amount = p_amount,
    direction = case link_row.operation_type when 'deposit' then 'in' else 'out' end,
    notes = nullif(trim(p_notes), ''), updated_at = now()
   where id = bankroll_row.id and bankroll_transactions.owner_id = authenticated_owner_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'A integração está inconsistente.' using errcode = '55000'; end if;

  update public.bankroll_finance_links set updated_at = now()
   where id = link_row.id and bankroll_finance_links.owner_id = authenticated_owner_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'A integração está inconsistente.' using errcode = '55000'; end if;
  return query select link_row.id, finance_row.id, bankroll_row.id, link_row.integration_group_id;
end;
$$;

create or replace function public.delete_bankroll_finance_operation(p_integration_group_id uuid)
returns table (deleted_link_id uuid, deleted_finance_transaction_id uuid, deleted_bankroll_transaction_id uuid)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  link_row public.bankroll_finance_links;
  finance_row public.transactions;
  bankroll_row public.bankroll_transactions;
  account_row public.accounts;
  wallet_row public.bankroll_wallets;
  affected integer;
begin
  if authenticated_owner_id is null then raise exception 'Usuário não autenticado.' using errcode = '42501'; end if;
  -- Mesma barreira global usada por criação e atualização.
  perform public.lock_bankroll_finance_group(p_integration_group_id);
  select * into link_row from public.bankroll_finance_links link
   where link.owner_id = authenticated_owner_id and link.integration_group_id = p_integration_group_id;
  if link_row.id is null then raise exception 'Integração não encontrada.' using errcode = '42501'; end if;
  select * into finance_row from public.transactions transaction_row
   where transaction_row.owner_id = authenticated_owner_id and transaction_row.id = link_row.finance_transaction_id;
  select * into bankroll_row from public.bankroll_transactions movement
   where movement.owner_id = authenticated_owner_id and movement.id = link_row.bankroll_transaction_id;
  if finance_row.id is null or bankroll_row.id is null
     or finance_row.bankroll_integration_group_id <> link_row.integration_group_id
     or bankroll_row.bankroll_integration_group_id <> link_row.integration_group_id
     or finance_row.bankroll_operation_type <> link_row.operation_type
     or bankroll_row.transaction_type <> link_row.operation_type
     or finance_row.value <> bankroll_row.amount
     or finance_row.due_date <> bankroll_row.transaction_date
     or finance_row.status <> (case link_row.operation_type when 'deposit' then 'Pago' else 'Recebido' end)
     or bankroll_row.direction <> (case link_row.operation_type when 'deposit' then 'in' else 'out' end) then
    raise exception 'A integração está inconsistente.' using errcode = '55000';
  end if;

  perform public.lock_financial_scope(
    array[authenticated_owner_id::text || ':' || finance_row.competence_id::text],
    array[authenticated_owner_id::text || ':' || finance_row.competence_id::text || ':' || finance_row.account_id::text]
  );
  select * into account_row from public.accounts
   where id = finance_row.account_id and accounts.owner_id = authenticated_owner_id for update;
  select * into wallet_row from public.bankroll_wallets
   where id = bankroll_row.wallet_id and bankroll_wallets.owner_id = authenticated_owner_id for update;

  select * into link_row from public.bankroll_finance_links link
   where link.owner_id = authenticated_owner_id
     and link.integration_group_id = p_integration_group_id
   for update;
  select * into finance_row from public.transactions transaction_row
   where transaction_row.owner_id = authenticated_owner_id
     and transaction_row.id = link_row.finance_transaction_id
   for update;
  select * into bankroll_row from public.bankroll_transactions movement
   where movement.owner_id = authenticated_owner_id
     and movement.id = link_row.bankroll_transaction_id
   for update;
  if link_row.id is null or finance_row.id is null or bankroll_row.id is null
     or finance_row.bankroll_integration_group_id <> link_row.integration_group_id
     or bankroll_row.bankroll_integration_group_id <> link_row.integration_group_id
     or finance_row.bankroll_operation_type <> link_row.operation_type
     or bankroll_row.transaction_type <> link_row.operation_type
     or finance_row.value <> bankroll_row.amount
     or finance_row.due_date <> bankroll_row.transaction_date
     or finance_row.status <> (case link_row.operation_type when 'deposit' then 'Pago' else 'Recebido' end)
     or bankroll_row.direction <> (case link_row.operation_type when 'deposit' then 'in' else 'out' end) then
    raise exception 'A integração está inconsistente.' using errcode = '55000';
  end if;
  if account_row.id is null or wallet_row.id is null then raise exception 'A integração está inconsistente.' using errcode = '55000'; end if;
  if account_row.type <> 'Conta' or account_row.currency is null or account_row.currency <> wallet_row.currency then
    raise exception 'A integração está inconsistente.' using errcode = '55000';
  end if;
  perform public.assert_financial_scope_open(authenticated_owner_id, finance_row.competence_id, finance_row.account_id);

  delete from public.bankroll_finance_links where id = link_row.id and bankroll_finance_links.owner_id = authenticated_owner_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'A integração está inconsistente.' using errcode = '55000'; end if;
  delete from public.bankroll_transactions where id = bankroll_row.id and bankroll_transactions.owner_id = authenticated_owner_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'A integração está inconsistente.' using errcode = '55000'; end if;
  delete from public.transactions where id = finance_row.id and transactions.owner_id = authenticated_owner_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'A integração está inconsistente.' using errcode = '55000'; end if;
  return query select link_row.id, finance_row.id, bankroll_row.id;
end;
$$;

create trigger accounts_currency_00_normalize
  before insert or update of currency on public.accounts
  for each row execute function public.normalize_account_currency();
create trigger accounts_currency_10_history_guard
  before update of currency on public.accounts
  for each row execute function public.protect_account_currency_history();
create trigger bankroll_finance_links_mutation_guard
  before insert or update or delete on public.bankroll_finance_links
  for each row execute function public.bankroll_finance_mutation_guard();
create trigger transactions_bankroll_mutation_guard
  before insert or update or delete on public.transactions
  for each row execute function public.bankroll_finance_mutation_guard();
create trigger bankroll_transactions_finance_mutation_guard
  before insert or update or delete on public.bankroll_transactions
  for each row execute function public.bankroll_finance_mutation_guard();
create trigger bankroll_finance_links_updated_at
  before update on public.bankroll_finance_links
  for each row execute function public.set_updated_at();

create constraint trigger bankroll_finance_links_invariant
  after insert or update or delete on public.bankroll_finance_links
  deferrable initially deferred
  for each row execute function public.assert_bankroll_finance_invariant();
create constraint trigger transactions_bankroll_invariant
  after insert or update or delete on public.transactions
  deferrable initially deferred
  for each row execute function public.assert_bankroll_finance_invariant();
create constraint trigger bankroll_transactions_finance_invariant
  after insert or update or delete on public.bankroll_transactions
  deferrable initially deferred
  for each row execute function public.assert_bankroll_finance_invariant();

alter function public.normalize_account_currency() owner to postgres;
alter function public.protect_account_currency_history() owner to postgres;
alter function public.get_account_currency_history_flags() owner to postgres;
alter function public.lock_financial_scope(text[], text[]) owner to postgres;
alter function public.lock_bankroll_finance_group(uuid) owner to postgres;
alter function public.bankroll_finance_mutation_guard() owner to postgres;
alter function public.assert_bankroll_finance_invariant() owner to postgres;
alter function public.assert_financial_scope_open(uuid, uuid, uuid) owner to postgres;
alter function public.get_finance_balance_for_bankroll(uuid, uuid, uuid) owner to postgres;
alter function public.get_wallet_balance_for_finance(uuid, uuid, uuid) owner to postgres;
alter function public.create_bankroll_finance_operation_internal(text, uuid, uuid, date, numeric, text, uuid) owner to postgres;
alter function public.create_bankroll_finance_deposit(uuid, uuid, date, numeric, text, uuid) owner to postgres;
alter function public.create_bankroll_finance_withdrawal(uuid, uuid, date, numeric, text, uuid) owner to postgres;
alter function public.update_bankroll_finance_operation(uuid, uuid, uuid, date, numeric, text) owner to postgres;
alter function public.delete_bankroll_finance_operation(uuid) owner to postgres;

revoke all on table public.bankroll_finance_links from public, anon, authenticated, service_role;
grant select on table public.bankroll_finance_links to authenticated, service_role;

revoke all on function public.normalize_account_currency() from public, anon, authenticated, service_role;
revoke all on function public.protect_account_currency_history() from public, anon, authenticated, service_role;
revoke all on function public.lock_financial_scope(text[], text[]) from public, anon, authenticated, service_role;
revoke all on function public.lock_bankroll_finance_group(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bankroll_finance_mutation_guard() from public, anon, authenticated, service_role;
revoke all on function public.assert_bankroll_finance_invariant() from public, anon, authenticated, service_role;
revoke all on function public.assert_financial_scope_open(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_finance_balance_for_bankroll(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_wallet_balance_for_finance(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_bankroll_finance_operation_internal(text, uuid, uuid, date, numeric, text, uuid) from public, anon, authenticated, service_role;

revoke all on function public.get_account_currency_history_flags() from public, anon, authenticated, service_role;
grant execute on function public.get_account_currency_history_flags() to authenticated;

revoke all on function public.create_bankroll_finance_deposit(uuid, uuid, date, numeric, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_bankroll_finance_withdrawal(uuid, uuid, date, numeric, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.update_bankroll_finance_operation(uuid, uuid, uuid, date, numeric, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_bankroll_finance_operation(uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_bankroll_finance_deposit(uuid, uuid, date, numeric, text, uuid) to authenticated;
grant execute on function public.create_bankroll_finance_withdrawal(uuid, uuid, date, numeric, text, uuid) to authenticated;
grant execute on function public.update_bankroll_finance_operation(uuid, uuid, uuid, date, numeric, text) to authenticated;
grant execute on function public.delete_bankroll_finance_operation(uuid) to authenticated;
