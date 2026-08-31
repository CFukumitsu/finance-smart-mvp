begin;

alter table public.accounts
  add column if not exists investment_account_kind text;

alter table public.accounts
  add constraint accounts_investment_account_kind_check
  check (investment_account_kind is null or investment_account_kind = 'BALANCE'),
  add constraint accounts_investment_balance_contract_check
  check (
    investment_account_kind is null
    or (
      type = 'Conta'
      and coalesce(current_balance, 0) = 0
      and currency is not null
    )
  );

create index accounts_owner_investment_balance_idx
  on public.accounts (owner_id, active, name)
  where investment_account_kind = 'BALANCE';

alter table public.transactions
  add column if not exists investment_integration_group_id uuid,
  add column if not exists investment_event_type text;

alter table public.transactions
  add constraint transactions_investment_event_check
  check (
    (investment_integration_group_id is null and investment_event_type is null)
    or (
      investment_integration_group_id is not null
      and investment_event_type in ('application', 'redemption')
      and type = 'Transferência'
      and category_id is null
      and destination_account_id is null
      and (
        (
          investment_event_type = 'application'
          and status = 'Pago'
          and origin_account_id = account_id
        )
        or (
          investment_event_type = 'redemption'
          and status = 'Recebido'
          and origin_account_id is null
        )
      )
    )
  );

create unique index transactions_investment_integration_group_key
  on public.transactions (investment_integration_group_id)
  where investment_integration_group_id is not null;

create table public.investment_account_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null,
  financial_account_id uuid,
  finance_transaction_id uuid,
  event_type text not null,
  event_date date not null,
  amount numeric(18, 2) not null,
  integration_group_id uuid,
  idempotency_key uuid not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint investment_account_events_account_owner_fk
    foreign key (owner_id, investment_account_id)
    references public.accounts(owner_id, id)
    on delete restrict,
  constraint investment_account_events_financial_owner_fk
    foreign key (owner_id, financial_account_id)
    references public.accounts(owner_id, id)
    on delete restrict,
  constraint investment_account_events_transaction_owner_fk
    foreign key (owner_id, finance_transaction_id)
    references public.transactions(owner_id, id)
    on delete restrict
    deferrable initially deferred,
  constraint investment_account_events_type_check
    check (event_type in ('opening_balance', 'application', 'redemption', 'yield', 'positive_adjustment')),
  constraint investment_account_events_amount_positive
    check (amount > 0),
  constraint investment_account_events_counterpart_check
    check (
      (
        event_type in ('application', 'redemption')
        and financial_account_id is not null
        and finance_transaction_id is not null
        and integration_group_id is not null
      )
      or (
        event_type in ('opening_balance', 'yield', 'positive_adjustment')
        and financial_account_id is null
        and finance_transaction_id is null
        and integration_group_id is null
      )
    ),
  constraint investment_account_events_accounts_different
    check (financial_account_id is null or financial_account_id <> investment_account_id),
  constraint investment_account_events_owner_idempotency_unique
    unique (owner_id, idempotency_key),
  constraint investment_account_events_owner_id_id_unique
    unique (owner_id, id)
);

create unique index investment_account_events_group_key
  on public.investment_account_events (integration_group_id)
  where integration_group_id is not null;
create unique index investment_account_events_finance_transaction_key
  on public.investment_account_events (finance_transaction_id)
  where finance_transaction_id is not null;
create unique index investment_account_events_single_opening_balance_key
  on public.investment_account_events (owner_id, investment_account_id)
  where event_type = 'opening_balance';
create index investment_account_events_owner_account_date_idx
  on public.investment_account_events (owner_id, investment_account_id, event_date, created_at, id);

create trigger set_investment_account_events_updated_at
  before update on public.investment_account_events
  for each row execute function public.set_updated_at();

alter table public.investment_account_events enable row level security;

create policy investment_account_events_select_own
  on public.investment_account_events
  for select to authenticated
  using (owner_id = auth.uid());

create or replace function public.investment_account_event_effect(
  p_event_type text,
  p_amount numeric
)
returns numeric
language sql
immutable
set search_path = pg_catalog
as $$
  select case when p_event_type = 'redemption' then -abs(p_amount) else abs(p_amount) end;
$$;

create or replace function public.get_investment_account_balance(
  p_owner_id uuid,
  p_account_id uuid,
  p_excluded_event_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(sum(public.investment_account_event_effect(event.event_type, event.amount)), 0)
    from public.investment_account_events event
   where event.owner_id = p_owner_id
     and event.investment_account_id = p_account_id
     and event.id is distinct from p_excluded_event_id;
$$;

create or replace function public.assert_investment_account_ledger(
  p_owner_id uuid,
  p_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1
      from (
        select sum(public.investment_account_event_effect(event.event_type, event.amount))
          over (order by event.event_date, event.created_at, event.id rows unbounded preceding) as running_balance
          from public.investment_account_events event
         where event.owner_id = p_owner_id
           and event.investment_account_id = p_account_id
      ) ledger
     where ledger.running_balance < 0
  ) then
    raise exception 'A movimentação deixaria a conta de investimento com saldo negativo.'
      using errcode = '22003';
  end if;
end;
$$;

create or replace function public.get_financial_balance_for_investment(
  p_owner_id uuid,
  p_account_id uuid,
  p_excluded_integration_group_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(account_row.current_balance, 0) + coalesce(sum(
    case
      when movement.investment_integration_group_id = p_excluded_integration_group_id then 0
      when movement.account_id = p_account_id and movement.type = 'Receita'
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
      on movement.owner_id = p_owner_id
     and movement.account_id = account_row.id
   where account_row.owner_id = p_owner_id
     and account_row.id = p_account_id
   group by account_row.current_balance;
$$;

create or replace function public.investment_account_event_mutation_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if current_setting('app.investment_account_mutation', true) <> 'on' then
    raise exception 'Movimentações de contas de investimento devem ser alteradas pelas RPCs oficiais.'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger investment_account_events_mutation_guard
  before insert or update or delete on public.investment_account_events
  for each row execute function public.investment_account_event_mutation_guard();

create or replace function public.investment_finance_transaction_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if (
    (tg_op = 'INSERT' and new.investment_integration_group_id is not null)
    or (tg_op = 'UPDATE' and (old.investment_integration_group_id is not null or new.investment_integration_group_id is not null))
    or (tg_op = 'DELETE' and old.investment_integration_group_id is not null)
  ) and current_setting('app.investment_account_mutation', true) <> 'on' then
    raise exception 'Esta transferência pertence a uma conta de investimento e deve ser alterada no módulo de Investimentos.'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger transactions_investment_mutation_guard
  before insert or update or delete on public.transactions
  for each row execute function public.investment_finance_transaction_guard();

create or replace function public.protect_investment_account_contract()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.investment_account_kind = 'BALANCE' and (
    new.type <> 'Conta' or new.currency is null or coalesce(new.current_balance, 0) <> 0
  ) then
    raise exception 'Contas de investimento por saldo devem ser contas financeiras com moeda definida e saldo inicial zero.'
      using errcode = '22023';
  end if;

  if old.investment_account_kind is distinct from new.investment_account_kind then
    if exists (
      select 1 from public.transactions movement
       where movement.owner_id = old.owner_id
         and (
           movement.account_id = old.id
           or movement.origin_account_id = old.id
           or movement.destination_account_id = old.id
         )
    ) or exists (
      select 1 from public.investment_operations operation
       where operation.owner_id = old.owner_id and operation.account_id = old.id
    ) or exists (
      select 1 from public.investment_account_events event
       where event.owner_id = old.owner_id
         and (event.investment_account_id = old.id or event.financial_account_id = old.id)
    ) then
      raise exception 'A finalidade da conta não pode ser alterada porque ela já possui histórico.'
        using errcode = '55000';
    end if;
  end if;

  if old.investment_account_kind = 'BALANCE' and (
    new.currency is distinct from old.currency
    or new.current_balance is distinct from old.current_balance
    or new.type is distinct from old.type
  ) and exists (
    select 1 from public.investment_account_events event
     where event.owner_id = old.owner_id and event.investment_account_id = old.id
  ) then
    raise exception 'Moeda, tipo e saldo inicial não podem ser alterados após a primeira movimentação.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger accounts_protect_investment_contract
  before update of investment_account_kind, type, currency, current_balance on public.accounts
  for each row execute function public.protect_investment_account_contract();

create or replace function public.create_investment_account_event(
  p_event_type text,
  p_investment_account_id uuid,
  p_financial_account_id uuid,
  p_date date,
  p_amount numeric,
  p_notes text,
  p_idempotency_key uuid
)
returns table (
  event_id uuid,
  finance_transaction_id uuid,
  integration_group_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  investment_account public.accounts%rowtype;
  financial_account public.accounts%rowtype;
  competence_row public.competences%rowtype;
  existing_event public.investment_account_events%rowtype;
  created_event_id uuid;
  created_finance_id uuid;
  created_group_id uuid;
  normalized_notes text := nullif(trim(p_notes), '');
begin
  if authenticated_owner_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;
  if p_event_type not in ('opening_balance', 'application', 'redemption', 'yield', 'positive_adjustment') then
    raise exception 'Tipo de movimentação inválido.' using errcode = '22023';
  end if;
  if p_date is null or p_amount is null or p_amount <= 0 or p_idempotency_key is null then
    raise exception 'Data, valor positivo e chave de idempotência são obrigatórios.' using errcode = '22023';
  end if;

  -- Serializa tentativas concorrentes com a mesma chave antes da consulta.
  perform pg_advisory_xact_lock(
    hashtextextended(authenticated_owner_id::text || ':' || p_idempotency_key::text, 0)
  );

  select * into existing_event
    from public.investment_account_events event
   where event.owner_id = authenticated_owner_id
     and event.idempotency_key = p_idempotency_key;
  if existing_event.id is not null then
    if existing_event.event_type <> p_event_type
       or existing_event.investment_account_id <> p_investment_account_id
       or existing_event.financial_account_id is distinct from p_financial_account_id
       or existing_event.event_date <> p_date
       or existing_event.amount <> p_amount
       or coalesce(existing_event.notes, '') <> coalesce(normalized_notes, '') then
      raise exception 'A chave de idempotência já foi usada com dados diferentes.' using errcode = '23505';
    end if;
    return query select existing_event.id, existing_event.finance_transaction_id, existing_event.integration_group_id;
    return;
  end if;

  select * into investment_account from public.accounts
   where id = p_investment_account_id and owner_id = authenticated_owner_id
   for update;
  if investment_account.id is null or investment_account.investment_account_kind <> 'BALANCE'
     or investment_account.type <> 'Conta' or not investment_account.active
     or investment_account.currency is null then
    raise exception 'Conta de investimento por saldo inválida ou inativa.' using errcode = '22023';
  end if;

  select * into competence_row from public.competences
   where owner_id = authenticated_owner_id
     and year = extract(year from p_date)::integer
     and month = extract(month from p_date)::integer;
  if competence_row.id is null then
    raise exception 'Prepare a competência da movimentação antes de salvar.' using errcode = '22023';
  end if;
  if competence_row.status <> 'ABERTA' then
    raise exception 'A competência da movimentação está fechada.' using errcode = '55000';
  end if;

  if p_event_type in ('application', 'redemption') then
    if p_financial_account_id is null or p_financial_account_id = p_investment_account_id then
      raise exception 'Informe uma conta financeira diferente da conta de investimento.' using errcode = '22023';
    end if;
    select * into financial_account from public.accounts
     where id = p_financial_account_id and owner_id = authenticated_owner_id
     for update;
    if financial_account.id is null or financial_account.type <> 'Conta'
       or not financial_account.active or financial_account.currency is null
       or financial_account.investment_account_kind is not null then
      raise exception 'Conta financeira de origem ou destino inválida.' using errcode = '22023';
    end if;
    if financial_account.currency <> investment_account.currency then
      raise exception 'As contas precisam utilizar a mesma moeda.' using errcode = '22023';
    end if;
    perform public.assert_financial_scope_open(authenticated_owner_id, competence_row.id, financial_account.id);
    if p_event_type = 'application'
       and public.get_financial_balance_for_investment(authenticated_owner_id, financial_account.id) < p_amount then
      raise exception 'Saldo insuficiente na conta financeira.' using errcode = '22003';
    end if;
  elsif p_financial_account_id is not null then
    raise exception 'Saldo inicial, rendimentos e ajustes não movimentam conta financeira.' using errcode = '22023';
  end if;

  perform set_config('app.investment_account_mutation', 'on', true);

  if p_event_type in ('application', 'redemption') then
    created_group_id := gen_random_uuid();
    insert into public.transactions (
      owner_id, competence_id, account_id, description, due_date, type, mode,
      value, status, category_id, origin_account_id, destination_account_id,
      investment_integration_group_id, investment_event_type
    ) values (
      authenticated_owner_id,
      competence_row.id,
      financial_account.id,
      case p_event_type
        when 'application' then 'Aplicação — ' || investment_account.name
        else 'Resgate — ' || investment_account.name
      end,
      p_date,
      'Transferência',
      'unico',
      p_amount,
      case p_event_type when 'application' then 'Pago' else 'Recebido' end,
      null,
      case p_event_type when 'application' then financial_account.id else null end,
      null,
      created_group_id,
      p_event_type
    ) returning id into created_finance_id;
  end if;

  insert into public.investment_account_events (
    owner_id, investment_account_id, financial_account_id,
    finance_transaction_id, event_type, event_date, amount,
    integration_group_id, idempotency_key, notes
  ) values (
    authenticated_owner_id, investment_account.id,
    case when p_event_type in ('application', 'redemption') then financial_account.id else null end,
    created_finance_id, p_event_type, p_date, p_amount,
    created_group_id, p_idempotency_key, normalized_notes
  ) returning id into created_event_id;

  perform public.assert_investment_account_ledger(authenticated_owner_id, investment_account.id);
  return query select created_event_id, created_finance_id, created_group_id;
end;
$$;

create or replace function public.update_investment_account_event(
  p_event_id uuid,
  p_event_type text,
  p_investment_account_id uuid,
  p_financial_account_id uuid,
  p_date date,
  p_amount numeric,
  p_notes text
)
returns table (
  event_id uuid,
  finance_transaction_id uuid,
  integration_group_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  event_row public.investment_account_events%rowtype;
  investment_account public.accounts%rowtype;
  financial_account public.accounts%rowtype;
  competence_row public.competences%rowtype;
  old_competence public.competences%rowtype;
  finance_id uuid;
  group_id uuid;
  normalized_notes text := nullif(trim(p_notes), '');
begin
  if authenticated_owner_id is null then raise exception 'Usuário não autenticado.' using errcode = '28000'; end if;
  if p_event_type not in ('opening_balance', 'application', 'redemption', 'yield', 'positive_adjustment')
     or p_date is null or p_amount is null or p_amount <= 0 then
    raise exception 'Movimentação inválida.' using errcode = '22023';
  end if;

  select * into event_row from public.investment_account_events
   where id = p_event_id and owner_id = authenticated_owner_id for update;
  if event_row.id is null then raise exception 'Movimentação não encontrada.' using errcode = '42501'; end if;

  select * into old_competence from public.competences
   where owner_id = authenticated_owner_id
     and year = extract(year from event_row.event_date)::integer
     and month = extract(month from event_row.event_date)::integer;
  if old_competence.status <> 'ABERTA' then raise exception 'A competência original está fechada.' using errcode = '55000'; end if;

  select * into investment_account from public.accounts
   where id = p_investment_account_id and owner_id = authenticated_owner_id for update;
  if investment_account.id is null or investment_account.investment_account_kind <> 'BALANCE'
     or investment_account.type <> 'Conta' or not investment_account.active or investment_account.currency is null then
    raise exception 'Conta de investimento por saldo inválida ou inativa.' using errcode = '22023';
  end if;

  select * into competence_row from public.competences
   where owner_id = authenticated_owner_id
     and year = extract(year from p_date)::integer
     and month = extract(month from p_date)::integer;
  if competence_row.id is null or competence_row.status <> 'ABERTA' then
    raise exception 'A nova competência não existe ou está fechada.' using errcode = '55000';
  end if;

  if p_event_type in ('application', 'redemption') then
    select * into financial_account from public.accounts
     where id = p_financial_account_id and owner_id = authenticated_owner_id for update;
    if financial_account.id is null or financial_account.type <> 'Conta' or not financial_account.active
       or financial_account.currency is null or financial_account.investment_account_kind is not null
       or financial_account.id = investment_account.id then
      raise exception 'Conta financeira de origem ou destino inválida.' using errcode = '22023';
    end if;
    if financial_account.currency <> investment_account.currency then raise exception 'As contas precisam utilizar a mesma moeda.' using errcode = '22023'; end if;
    perform public.assert_financial_scope_open(authenticated_owner_id, competence_row.id, financial_account.id);
    if p_event_type = 'application'
       and public.get_financial_balance_for_investment(authenticated_owner_id, financial_account.id, event_row.integration_group_id) < p_amount then
      raise exception 'Saldo insuficiente na conta financeira.' using errcode = '22003';
    end if;
  elsif p_financial_account_id is not null then
    raise exception 'Saldo inicial, rendimentos e ajustes não movimentam conta financeira.' using errcode = '22023';
  end if;

  perform set_config('app.investment_account_mutation', 'on', true);
  finance_id := event_row.finance_transaction_id;
  group_id := event_row.integration_group_id;

  if p_event_type in ('application', 'redemption') then
    if group_id is null then group_id := gen_random_uuid(); end if;
    if finance_id is null then
      insert into public.transactions (
        owner_id, competence_id, account_id, description, due_date, type, mode, value,
        status, category_id, origin_account_id, destination_account_id,
        investment_integration_group_id, investment_event_type
      ) values (
        authenticated_owner_id, competence_row.id, financial_account.id,
        case p_event_type when 'application' then 'Aplicação — ' else 'Resgate — ' end || investment_account.name,
        p_date, 'Transferência', 'unico', p_amount,
        case p_event_type when 'application' then 'Pago' else 'Recebido' end,
        null, case p_event_type when 'application' then financial_account.id else null end,
        null, group_id, p_event_type
      ) returning id into finance_id;
    else
      update public.transactions set
        competence_id = competence_row.id,
        account_id = financial_account.id,
        description = case p_event_type when 'application' then 'Aplicação — ' else 'Resgate — ' end || investment_account.name,
        due_date = p_date,
        type = 'Transferência', mode = 'unico', value = p_amount,
        status = case p_event_type when 'application' then 'Pago' else 'Recebido' end,
        category_id = null,
        origin_account_id = case p_event_type when 'application' then financial_account.id else null end,
        destination_account_id = null,
        investment_integration_group_id = group_id,
        investment_event_type = p_event_type,
        updated_at = now()
       where id = finance_id and owner_id = authenticated_owner_id;
    end if;
  elsif finance_id is not null then
    update public.investment_account_events set
      financial_account_id = null, finance_transaction_id = null, integration_group_id = null
     where id = event_row.id and owner_id = authenticated_owner_id;
    delete from public.transactions where id = finance_id and owner_id = authenticated_owner_id;
    finance_id := null;
    group_id := null;
  end if;

  update public.investment_account_events set
    investment_account_id = investment_account.id,
    financial_account_id = case when p_event_type in ('application', 'redemption') then financial_account.id else null end,
    finance_transaction_id = finance_id,
    event_type = p_event_type,
    event_date = p_date,
    amount = p_amount,
    integration_group_id = group_id,
    notes = normalized_notes,
    updated_at = now()
   where id = event_row.id and owner_id = authenticated_owner_id;

  perform public.assert_investment_account_ledger(authenticated_owner_id, event_row.investment_account_id);
  if investment_account.id <> event_row.investment_account_id then
    perform public.assert_investment_account_ledger(authenticated_owner_id, investment_account.id);
  end if;
  return query select event_row.id, finance_id, group_id;
end;
$$;

create or replace function public.delete_investment_account_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  event_row public.investment_account_events%rowtype;
  competence_row public.competences%rowtype;
begin
  if authenticated_owner_id is null then raise exception 'Usuário não autenticado.' using errcode = '28000'; end if;
  select * into event_row from public.investment_account_events
   where id = p_event_id and owner_id = authenticated_owner_id for update;
  -- Uma repetição do mesmo pedido de exclusão deve ser segura e não produzir erro.
  if event_row.id is null then return; end if;
  select * into competence_row from public.competences
   where owner_id = authenticated_owner_id
     and year = extract(year from event_row.event_date)::integer
     and month = extract(month from event_row.event_date)::integer;
  if competence_row.status <> 'ABERTA' then raise exception 'A competência da movimentação está fechada.' using errcode = '55000'; end if;

  perform set_config('app.investment_account_mutation', 'on', true);
  delete from public.investment_account_events where id = event_row.id and owner_id = authenticated_owner_id;
  if event_row.finance_transaction_id is not null then
    delete from public.transactions where id = event_row.finance_transaction_id and owner_id = authenticated_owner_id;
  end if;
  perform public.assert_investment_account_ledger(authenticated_owner_id, event_row.investment_account_id);
end;
$$;

alter function public.investment_account_event_effect(text, numeric) owner to postgres;
alter function public.get_investment_account_balance(uuid, uuid, uuid) owner to postgres;
alter function public.assert_investment_account_ledger(uuid, uuid) owner to postgres;
alter function public.get_financial_balance_for_investment(uuid, uuid, uuid) owner to postgres;
alter function public.investment_account_event_mutation_guard() owner to postgres;
alter function public.investment_finance_transaction_guard() owner to postgres;
alter function public.protect_investment_account_contract() owner to postgres;
alter function public.create_investment_account_event(text, uuid, uuid, date, numeric, text, uuid) owner to postgres;
alter function public.update_investment_account_event(uuid, text, uuid, uuid, date, numeric, text) owner to postgres;
alter function public.delete_investment_account_event(uuid) owner to postgres;

revoke all on table public.investment_account_events from public, anon, authenticated, service_role;
grant select on table public.investment_account_events to authenticated, service_role;

revoke all on function public.investment_account_event_effect(text, numeric) from public, anon, authenticated, service_role;
revoke all on function public.get_investment_account_balance(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.assert_investment_account_ledger(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_financial_balance_for_investment(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.investment_account_event_mutation_guard() from public, anon, authenticated, service_role;
revoke all on function public.investment_finance_transaction_guard() from public, anon, authenticated, service_role;
revoke all on function public.protect_investment_account_contract() from public, anon, authenticated, service_role;
revoke all on function public.create_investment_account_event(text, uuid, uuid, date, numeric, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.update_investment_account_event(uuid, text, uuid, uuid, date, numeric, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_investment_account_event(uuid) from public, anon, authenticated, service_role;

grant execute on function public.create_investment_account_event(text, uuid, uuid, date, numeric, text, uuid) to authenticated;
grant execute on function public.update_investment_account_event(uuid, text, uuid, uuid, date, numeric, text) to authenticated;
grant execute on function public.delete_investment_account_event(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
