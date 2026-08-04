begin;

create table public.investment_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  base_currency text not null,
  quote_currency text not null,
  rate numeric(24, 12) not null,
  source text not null,
  quoted_at timestamptz not null,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_exchange_rates_owner_pair_unique
    unique (owner_id, base_currency, quote_currency),
  constraint investment_exchange_rates_currency_check
    check (
      base_currency ~ '^[A-Z0-9]{3,8}$'
      and quote_currency ~ '^[A-Z0-9]{3,8}$'
      and base_currency <> quote_currency
    ),
  constraint investment_exchange_rates_rate_positive check (rate > 0),
  constraint investment_exchange_rates_source_check check (source in ('PTAX', 'MANUAL'))
);

create index investment_exchange_rates_owner_updated_idx
  on public.investment_exchange_rates (owner_id, updated_at desc);

create trigger set_investment_exchange_rates_updated_at
  before update on public.investment_exchange_rates
  for each row execute function public.set_updated_at();

alter table public.investment_exchange_rates enable row level security;

create policy investment_exchange_rates_select_own
  on public.investment_exchange_rates for select to authenticated
  using (owner_id = auth.uid());
create policy investment_exchange_rates_insert_own
  on public.investment_exchange_rates for insert to authenticated
  with check (owner_id = auth.uid() and updated_by = auth.uid());
create policy investment_exchange_rates_update_own
  on public.investment_exchange_rates for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and updated_by = auth.uid());
create policy investment_exchange_rates_delete_own
  on public.investment_exchange_rates for delete to authenticated
  using (owner_id = auth.uid());

create table public.investment_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  consolidation_currency text not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_settings_currency_check
    check (consolidation_currency ~ '^[A-Z0-9]{3,8}$')
);

create trigger set_investment_settings_updated_at
  before update on public.investment_settings
  for each row execute function public.set_updated_at();

alter table public.investment_settings enable row level security;

create policy investment_settings_select_own
  on public.investment_settings for select to authenticated
  using (owner_id = auth.uid());
create policy investment_settings_insert_own
  on public.investment_settings for insert to authenticated
  with check (owner_id = auth.uid());
create policy investment_settings_update_own
  on public.investment_settings for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy investment_settings_delete_own
  on public.investment_settings for delete to authenticated
  using (owner_id = auth.uid());

alter table public.investment_monthly_valuations
  add column currency text,
  add column consolidation_currency text,
  add column exchange_rate numeric(24, 12);

update public.investment_monthly_valuations as valuation
   set currency = asset.currency,
       consolidation_currency = asset.currency,
       exchange_rate = 1
  from public.investment_assets as asset
 where asset.id = valuation.asset_id
   and asset.owner_id = valuation.owner_id;

do $$
begin
  if exists (
    select 1 from public.investment_monthly_valuations
     where currency is null or consolidation_currency is null or exchange_rate is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Não foi possível definir a moeda dos snapshots históricos de investimentos.';
  end if;
end;
$$;

alter table public.investment_monthly_valuations
  alter column currency set not null,
  alter column consolidation_currency set not null,
  alter column exchange_rate set not null,
  add constraint investment_monthly_valuations_currency_snapshot_check
    check (
      currency ~ '^[A-Z0-9]{3,8}$'
      and consolidation_currency ~ '^[A-Z0-9]{3,8}$'
      and exchange_rate > 0
    );

create or replace function public.validate_investment_valuation_currency_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset_currency text;
begin
  select currency into asset_currency
    from public.investment_assets
   where id = new.asset_id and owner_id = new.owner_id;
  if asset_currency is null or new.currency <> asset_currency then
    raise exception using
      errcode = '23514',
      message = 'A moeda do snapshot deve ser a moeda cadastrada no ativo.';
  end if;
  return new;
end;
$$;

create trigger investment_monthly_valuations_validate_currency_snapshot
  before insert or update of owner_id, asset_id, currency
  on public.investment_monthly_valuations
  for each row execute function public.validate_investment_valuation_currency_snapshot();

revoke all on function public.validate_investment_valuation_currency_snapshot()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
