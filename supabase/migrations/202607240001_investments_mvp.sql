begin;

alter table public.accounts
  add column show_on_investments_dashboard boolean not null default false;

create index accounts_investments_dashboard_idx
  on public.accounts (owner_id, name)
  where active = true
    and type = 'Conta'
    and show_on_investments_dashboard = true;

create table public.investment_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  symbol text,
  asset_type text not null,
  currency text not null default 'BRL',
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint investment_assets_owner_id_id_unique
    unique (owner_id, id),

  constraint investment_assets_name_not_blank
    check (btrim(name) <> ''),

  constraint investment_assets_symbol_not_blank
    check (symbol is null or btrim(symbol) <> ''),

  constraint investment_assets_asset_type_not_blank
    check (btrim(asset_type) <> ''),

  constraint investment_assets_currency_not_blank
    check (btrim(currency) <> '')
);

create unique index investment_assets_owner_name_unique_idx
  on public.investment_assets (owner_id, lower(btrim(name)));

create index investment_assets_owner_active_idx
  on public.investment_assets (owner_id, active);

create index investment_assets_owner_asset_type_idx
  on public.investment_assets (owner_id, asset_type);

create table public.investment_operations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null,
  account_id uuid not null references public.accounts(id) on delete restrict,

  operation_type text not null,
  operation_date date not null,
  quantity numeric(18, 8) not null,
  unit_price numeric(18, 8),
  fees numeric(18, 2) not null default 0,
  event_group_id uuid,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint investment_operations_asset_owner_fk
    foreign key (owner_id, asset_id)
    references public.investment_assets(owner_id, id)
    on delete restrict,

  constraint investment_operations_type_check
    check (operation_type in ('Compra', 'Venda')),

  constraint investment_operations_quantity_direction_check
    check (
      (operation_type = 'Compra' and quantity > 0)
      or
      (operation_type = 'Venda' and quantity < 0)
    ),

  constraint investment_operations_unit_price_required
    check (unit_price is not null and unit_price > 0),

  constraint investment_operations_fees_non_negative
    check (fees >= 0)
);

create index investment_operations_owner_date_idx
  on public.investment_operations (owner_id, operation_date desc);

create index investment_operations_owner_asset_date_idx
  on public.investment_operations (owner_id, asset_id, operation_date desc);

create index investment_operations_owner_account_date_idx
  on public.investment_operations (owner_id, account_id, operation_date desc);

create index investment_operations_account_id_idx
  on public.investment_operations (account_id);

create index investment_operations_owner_event_group_idx
  on public.investment_operations (owner_id, event_group_id)
  where event_group_id is not null;

create table public.investment_monthly_valuations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null,

  reference_month date not null,
  market_value numeric(18, 2) not null,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint investment_monthly_valuations_asset_owner_fk
    foreign key (owner_id, asset_id)
    references public.investment_assets(owner_id, id)
    on delete cascade,

  constraint investment_monthly_valuations_market_value_non_negative
    check (market_value >= 0),

  constraint investment_monthly_valuations_reference_month_first_day
    check (reference_month = date_trunc('month', reference_month)::date),

  constraint investment_monthly_valuations_owner_asset_month_unique
    unique (owner_id, asset_id, reference_month)
);

create index investment_monthly_valuations_owner_month_idx
  on public.investment_monthly_valuations (owner_id, reference_month desc);

create or replace function public.validate_investment_account_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.accounts
     where accounts.id = new.account_id
       and accounts.owner_id = new.owner_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'A conta do investimento deve pertencer ao mesmo owner_id do registro.';
  end if;

  return new;
end;
$$;

create trigger investment_operations_validate_account_owner
  before insert or update of owner_id, account_id
  on public.investment_operations
  for each row execute function public.validate_investment_account_owner();

create trigger set_investment_assets_updated_at
  before update on public.investment_assets
  for each row execute function public.set_updated_at();

create trigger set_investment_operations_updated_at
  before update on public.investment_operations
  for each row execute function public.set_updated_at();

create trigger set_investment_monthly_valuations_updated_at
  before update on public.investment_monthly_valuations
  for each row execute function public.set_updated_at();

alter table public.investment_assets enable row level security;
alter table public.investment_operations enable row level security;
alter table public.investment_monthly_valuations enable row level security;

create policy investment_assets_select_own
  on public.investment_assets
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy investment_assets_insert_own
  on public.investment_assets
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy investment_assets_update_own
  on public.investment_assets
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy investment_assets_delete_own
  on public.investment_assets
  for delete
  to authenticated
  using (owner_id = auth.uid());

create policy investment_operations_select_own
  on public.investment_operations
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy investment_operations_insert_own
  on public.investment_operations
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
        from public.investment_assets
       where investment_assets.id = investment_operations.asset_id
         and investment_assets.owner_id = auth.uid()
    )
    and exists (
      select 1
        from public.accounts
       where accounts.id = investment_operations.account_id
         and accounts.owner_id = auth.uid()
    )
  );

create policy investment_operations_update_own
  on public.investment_operations
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
        from public.investment_assets
       where investment_assets.id = investment_operations.asset_id
         and investment_assets.owner_id = auth.uid()
    )
    and exists (
      select 1
        from public.accounts
       where accounts.id = investment_operations.account_id
         and accounts.owner_id = auth.uid()
    )
  );

create policy investment_operations_delete_own
  on public.investment_operations
  for delete
  to authenticated
  using (owner_id = auth.uid());

create policy investment_monthly_valuations_select_own
  on public.investment_monthly_valuations
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy investment_monthly_valuations_insert_own
  on public.investment_monthly_valuations
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
        from public.investment_assets
       where investment_assets.id = investment_monthly_valuations.asset_id
         and investment_assets.owner_id = auth.uid()
    )
  );

create policy investment_monthly_valuations_update_own
  on public.investment_monthly_valuations
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
        from public.investment_assets
       where investment_assets.id = investment_monthly_valuations.asset_id
         and investment_assets.owner_id = auth.uid()
    )
  );

create policy investment_monthly_valuations_delete_own
  on public.investment_monthly_valuations
  for delete
  to authenticated
  using (owner_id = auth.uid());

revoke all on function public.validate_investment_account_owner()
  from public, anon, authenticated, service_role;

commit;
