-- Bankroll Poker - Fase 1. Migration versionada para aplicação posterior.
create table public.bankroll_wallets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  wallet_type text not null check (wallet_type in ('online','live','cash','other')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  initial_balance numeric(18,2) not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id)
);

create table public.bankroll_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null,
  transaction_date date not null,
  transaction_type text not null check (transaction_type in ('deposit','withdrawal','transfer_in','transfer_out','adjustment','bonus','staking_received','staking_paid')),
  direction text not null check (direction in ('in','out')),
  amount numeric(18,2) not null check (amount > 0),
  description text,
  notes text,
  transfer_group_id uuid,
  counterpart_wallet_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bankroll_transactions_wallet_owner_fk foreign key (owner_id, wallet_id) references public.bankroll_wallets(owner_id, id) on delete restrict,
  constraint bankroll_transactions_counterpart_owner_fk foreign key (owner_id, counterpart_wallet_id) references public.bankroll_wallets(owner_id, id) on delete restrict,
  constraint bankroll_transactions_type_direction_check check (
    (transaction_type in ('deposit','transfer_in','bonus','staking_received') and direction = 'in') or
    (transaction_type in ('withdrawal','transfer_out','staking_paid') and direction = 'out') or
    transaction_type = 'adjustment'
  ),
  constraint bankroll_transactions_transfer_check check (
    (transaction_type in ('transfer_in','transfer_out') and transfer_group_id is not null and counterpart_wallet_id is not null and counterpart_wallet_id <> wallet_id) or
    (transaction_type not in ('transfer_in','transfer_out') and transfer_group_id is null and counterpart_wallet_id is null)
  )
);

create table public.bankroll_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null,
  session_date date not null,
  session_type text not null check (session_type in ('tournament','cash_game','sit_and_go','spin','other')),
  game_type text not null check (length(trim(game_type)) > 0),
  format text,
  event_name text,
  buy_in numeric(18,2) not null default 0 check (buy_in >= 0),
  reentries integer not null default 0 check (reentries >= 0),
  reentry_cost numeric(18,2) not null default 0 check (reentry_cost >= 0),
  add_on_cost numeric(18,2) not null default 0 check (add_on_cost >= 0),
  prize numeric(18,2) not null default 0 check (prize >= 0),
  fees numeric(18,2) not null default 0 check (fees >= 0),
  cash_buy_in numeric(18,2) check (cash_buy_in >= 0),
  cash_out numeric(18,2) check (cash_out >= 0),
  duration_minutes integer check (duration_minutes >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bankroll_sessions_wallet_owner_fk foreign key (owner_id, wallet_id) references public.bankroll_wallets(owner_id, id) on delete restrict,
  constraint bankroll_sessions_model_check check (
    (session_type = 'cash_game' and cash_buy_in is not null and cash_out is not null and buy_in = 0 and reentries = 0 and reentry_cost = 0 and add_on_cost = 0 and prize = 0) or
    (session_type <> 'cash_game' and cash_buy_in is null and cash_out is null)
  )
);

create index bankroll_wallets_owner_active_name_idx on public.bankroll_wallets(owner_id, active, name);
create index bankroll_transactions_owner_date_idx on public.bankroll_transactions(owner_id, transaction_date desc);
create index bankroll_transactions_owner_wallet_date_idx on public.bankroll_transactions(owner_id, wallet_id, transaction_date desc);
create unique index bankroll_transactions_transfer_side_idx on public.bankroll_transactions(owner_id, transfer_group_id, transaction_type) where transfer_group_id is not null;
create index bankroll_sessions_owner_date_idx on public.bankroll_sessions(owner_id, session_date desc);
create index bankroll_sessions_owner_wallet_date_idx on public.bankroll_sessions(owner_id, wallet_id, session_date desc);

create trigger set_bankroll_wallets_updated_at before update on public.bankroll_wallets for each row execute function public.set_updated_at();
create trigger set_bankroll_transactions_updated_at before update on public.bankroll_transactions for each row execute function public.set_updated_at();
create trigger set_bankroll_sessions_updated_at before update on public.bankroll_sessions for each row execute function public.set_updated_at();

create or replace function public.protect_bankroll_wallet_currency()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.currency is distinct from old.currency and (
    exists (select 1 from public.bankroll_transactions where owner_id = old.owner_id and wallet_id = old.id)
    or exists (select 1 from public.bankroll_sessions where owner_id = old.owner_id and wallet_id = old.id)
  ) then
    raise exception 'A moeda não pode ser alterada porque a carteira possui histórico.';
  end if;
  return new;
end $$;

create trigger protect_bankroll_wallet_currency
before update of currency on public.bankroll_wallets
for each row execute function public.protect_bankroll_wallet_currency();

alter table public.bankroll_wallets enable row level security;
alter table public.bankroll_transactions enable row level security;
alter table public.bankroll_sessions enable row level security;

create policy bankroll_wallets_select_own on public.bankroll_wallets for select to authenticated using (owner_id = auth.uid());
create policy bankroll_wallets_insert_own on public.bankroll_wallets for insert to authenticated with check (owner_id = auth.uid());
create policy bankroll_wallets_update_own on public.bankroll_wallets for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy bankroll_wallets_delete_own on public.bankroll_wallets for delete to authenticated using (owner_id = auth.uid());
create policy bankroll_transactions_select_own on public.bankroll_transactions for select to authenticated using (owner_id = auth.uid());
create policy bankroll_transactions_insert_common_own on public.bankroll_transactions for insert to authenticated
with check (owner_id = auth.uid() and transaction_type not in ('transfer_in','transfer_out') and transfer_group_id is null and counterpart_wallet_id is null);
create policy bankroll_transactions_update_common_own on public.bankroll_transactions for update to authenticated
using (owner_id = auth.uid() and transaction_type not in ('transfer_in','transfer_out') and transfer_group_id is null)
with check (owner_id = auth.uid() and transaction_type not in ('transfer_in','transfer_out') and transfer_group_id is null and counterpart_wallet_id is null);
create policy bankroll_transactions_delete_common_own on public.bankroll_transactions for delete to authenticated
using (owner_id = auth.uid() and transaction_type not in ('transfer_in','transfer_out') and transfer_group_id is null);
create policy bankroll_sessions_select_own on public.bankroll_sessions for select to authenticated using (owner_id = auth.uid());
create policy bankroll_sessions_insert_own on public.bankroll_sessions for insert to authenticated with check (owner_id = auth.uid());
create policy bankroll_sessions_update_own on public.bankroll_sessions for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy bankroll_sessions_delete_own on public.bankroll_sessions for delete to authenticated using (owner_id = auth.uid());

create or replace function public.assert_bankroll_transfer_group(p_owner_id uuid, p_transfer_group_id uuid, p_allow_empty boolean default false)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_count integer;
  v_out_count integer;
  v_in_count integer;
  v_owner_count integer;
  v_amount_count integer;
  v_date_count integer;
  v_wallet_count integer;
  v_currency_count integer;
begin
  select
    count(*),
    count(*) filter (where movement.transaction_type = 'transfer_out' and movement.direction = 'out'),
    count(*) filter (where movement.transaction_type = 'transfer_in' and movement.direction = 'in'),
    count(distinct movement.owner_id),
    count(distinct movement.amount),
    count(distinct movement.transaction_date),
    count(distinct movement.wallet_id),
    count(distinct wallet.currency)
  into v_count, v_out_count, v_in_count, v_owner_count, v_amount_count, v_date_count, v_wallet_count, v_currency_count
  from public.bankroll_transactions movement
  join public.bankroll_wallets wallet
    on wallet.owner_id = movement.owner_id and wallet.id = movement.wallet_id
  where movement.owner_id = p_owner_id and movement.transfer_group_id = p_transfer_group_id;

  if v_count = 0 and p_allow_empty then return; end if;
  if v_count <> 2 or v_out_count <> 1 or v_in_count <> 1 or v_owner_count <> 1
     or v_amount_count <> 1 or v_date_count <> 1 or v_wallet_count <> 2 or v_currency_count <> 1
     or not exists (
       select 1
       from public.bankroll_transactions outgoing
       join public.bankroll_transactions incoming
         on incoming.owner_id = outgoing.owner_id
        and incoming.transfer_group_id = outgoing.transfer_group_id
        and incoming.transaction_type = 'transfer_in'
       where outgoing.owner_id = p_owner_id
         and outgoing.transfer_group_id = p_transfer_group_id
         and outgoing.transaction_type = 'transfer_out'
         and outgoing.wallet_id = incoming.counterpart_wallet_id
         and incoming.wallet_id = outgoing.counterpart_wallet_id
     ) then
    raise exception 'Par de transferência incompleto ou inconsistente.';
  end if;
end $$;

create or replace function public.validate_bankroll_transfer_pair()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.transfer_group_id is not null then
      perform public.assert_bankroll_transfer_group(new.owner_id, new.transfer_group_id, false);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.transfer_group_id is not null then
      perform public.assert_bankroll_transfer_group(old.owner_id, old.transfer_group_id, true);
    end if;
    return old;
  end if;

  if old.transfer_group_id is not null then
    perform public.assert_bankroll_transfer_group(old.owner_id, old.transfer_group_id, false);
  end if;
  if new.transfer_group_id is not null and new.transfer_group_id is distinct from old.transfer_group_id then
    perform public.assert_bankroll_transfer_group(new.owner_id, new.transfer_group_id, false);
  end if;
  return new;
end $$;

create constraint trigger validate_bankroll_transfer_pair
after insert or update or delete on public.bankroll_transactions
deferrable initially deferred for each row execute function public.validate_bankroll_transfer_pair();

create or replace function public.create_bankroll_transfer(p_origin_wallet_id uuid, p_destination_wallet_id uuid, p_date date, p_amount numeric, p_description text default null, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_owner uuid := auth.uid(); v_group uuid := gen_random_uuid(); v_count integer; v_currency_count integer;
begin
  if v_owner is null then raise exception 'Usuário não autenticado.'; end if;
  if p_origin_wallet_id = p_destination_wallet_id then raise exception 'As carteiras devem ser diferentes.'; end if;
  if p_amount <= 0 then raise exception 'O valor deve ser positivo.'; end if;
  perform 1 from public.bankroll_wallets where owner_id = v_owner and id in (p_origin_wallet_id, p_destination_wallet_id) order by id for update;
  select count(*), count(distinct currency) into v_count, v_currency_count from public.bankroll_wallets where owner_id = v_owner and id in (p_origin_wallet_id, p_destination_wallet_id) and active;
  if v_count <> 2 then raise exception 'Carteiras inválidas, inativas ou pertencentes a outro usuário.'; end if;
  if v_currency_count <> 1 then raise exception 'Transferências exigem carteiras da mesma moeda.'; end if;
  insert into public.bankroll_transactions(owner_id,wallet_id,transaction_date,transaction_type,direction,amount,description,notes,transfer_group_id,counterpart_wallet_id)
  values (v_owner,p_origin_wallet_id,p_date,'transfer_out','out',p_amount,p_description,p_notes,v_group,p_destination_wallet_id),
         (v_owner,p_destination_wallet_id,p_date,'transfer_in','in',p_amount,p_description,p_notes,v_group,p_origin_wallet_id);
  perform public.assert_bankroll_transfer_group(v_owner, v_group, false);
  return v_group;
end $$;

create or replace function public.update_bankroll_transfer(p_transfer_group_id uuid, p_origin_wallet_id uuid, p_destination_wallet_id uuid, p_date date, p_amount numeric, p_description text default null, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_owner uuid := auth.uid(); v_count integer; v_currency_count integer; v_affected integer;
begin
  if v_owner is null then raise exception 'Usuário não autenticado.'; end if;
  if p_origin_wallet_id = p_destination_wallet_id or p_amount <= 0 then raise exception 'Transferência inválida.'; end if;
  perform 1 from public.bankroll_transactions where owner_id = v_owner and transfer_group_id = p_transfer_group_id order by id for update;
  perform public.assert_bankroll_transfer_group(v_owner, p_transfer_group_id, false);
  perform 1 from public.bankroll_wallets where owner_id = v_owner and id in (p_origin_wallet_id, p_destination_wallet_id) order by id for update;
  select count(*), count(distinct currency) into v_count, v_currency_count from public.bankroll_wallets where owner_id = v_owner and id in (p_origin_wallet_id,p_destination_wallet_id) and active;
  if v_count <> 2 then raise exception 'Carteiras inválidas, inativas ou pertencentes a outro usuário.'; end if;
  if v_currency_count <> 1 then raise exception 'Transferências exigem carteiras da mesma moeda.'; end if;
  update public.bankroll_transactions
     set wallet_id = case when transaction_type = 'transfer_out' then p_origin_wallet_id else p_destination_wallet_id end,
         counterpart_wallet_id = case when transaction_type = 'transfer_out' then p_destination_wallet_id else p_origin_wallet_id end,
         transaction_date = p_date, amount = p_amount, description = p_description, notes = p_notes
   where owner_id = v_owner and transfer_group_id = p_transfer_group_id and transaction_type in ('transfer_out','transfer_in');
  get diagnostics v_affected = row_count;
  if v_affected <> 2 then raise exception 'A edição deve alterar exatamente dois registros.'; end if;
  perform public.assert_bankroll_transfer_group(v_owner, p_transfer_group_id, false);
end $$;

create or replace function public.delete_bankroll_transfer(p_transfer_group_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_owner uuid := auth.uid(); v_affected integer;
begin
  if v_owner is null then raise exception 'Usuário não autenticado.'; end if;
  perform 1 from public.bankroll_transactions where owner_id = v_owner and transfer_group_id = p_transfer_group_id order by id for update;
  perform public.assert_bankroll_transfer_group(v_owner, p_transfer_group_id, false);
  delete from public.bankroll_transactions where owner_id = v_owner and transfer_group_id = p_transfer_group_id;
  get diagnostics v_affected = row_count;
  if v_affected <> 2 then raise exception 'A exclusão deve remover exatamente dois registros.'; end if;
end $$;

revoke all on function public.protect_bankroll_wallet_currency() from public, anon, authenticated, service_role;
revoke all on function public.assert_bankroll_transfer_group(uuid,uuid,boolean) from public, anon, authenticated, service_role;
revoke all on function public.validate_bankroll_transfer_pair() from public, anon, authenticated, service_role;
revoke all on function public.create_bankroll_transfer(uuid,uuid,date,numeric,text,text) from public, anon, authenticated, service_role;
revoke all on function public.update_bankroll_transfer(uuid,uuid,uuid,date,numeric,text,text) from public, anon, authenticated, service_role;
revoke all on function public.delete_bankroll_transfer(uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_bankroll_transfer(uuid,uuid,date,numeric,text,text) to authenticated;
grant execute on function public.update_bankroll_transfer(uuid,uuid,uuid,date,numeric,text,text) to authenticated;
grant execute on function public.delete_bankroll_transfer(uuid) to authenticated;
