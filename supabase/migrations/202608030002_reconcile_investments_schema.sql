begin;

lock table public.investment_assets in access exclusive mode;
lock table public.investment_operations in access exclusive mode;
lock table public.investment_monthly_valuations in access exclusive mode;

-- The SQL stored remotely for migration 202607240001 differs from the file
-- committed to the repository. Converge both possible starting schemas to the
-- account-per-operation ledger used by the application.
alter table public.investment_operations
  add column if not exists account_id uuid,
  add column if not exists event_group_id uuid;

-- Preserve an old asset/account association when legacy operations exist.
update public.investment_operations as operation
   set account_id = asset.account_id
  from public.investment_assets as asset
 where operation.account_id is null
   and operation.asset_id = asset.id
   and operation.owner_id = asset.owner_id
   and asset.account_id is not null;

-- The application stores sales as negative quantities.
update public.investment_operations
   set quantity = case operation_type
     when 'Compra' then abs(quantity)
     when 'Venda' then -abs(quantity)
     else quantity
   end;

do $$
begin
  if exists (
    select 1
      from public.investment_operations
     where account_id is null
  ) then
    raise exception using
      errcode = '23502',
      message = 'Não foi possível inferir account_id para todas as operações de investimento.';
  end if;

  if exists (
    select 1
      from public.investment_operations
     where unit_price is null or unit_price <= 0
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existem operações de investimento com preço unitário inválido.';
  end if;

  if exists (
    select 1
      from public.investment_operations as operation
      left join public.investment_assets as asset
        on asset.id = operation.asset_id
       and asset.owner_id = operation.owner_id
      left join public.accounts as account
        on account.id = operation.account_id
       and account.owner_id = operation.owner_id
     where asset.id is null
        or account.id is null
        or account.type <> 'Conta'
        or account.currency is distinct from asset.currency
  ) then
    raise exception using
      errcode = '23503',
      message = 'Existem operações com ativo, conta, proprietário ou moeda incompatíveis.';
  end if;

  if exists (
    select 1
      from public.investment_monthly_valuations as valuation
      left join public.investment_assets as asset
        on asset.id = valuation.asset_id
       and asset.owner_id = valuation.owner_id
     where asset.id is null
  ) then
    raise exception using
      errcode = '23503',
      message = 'Existem valorizações vinculadas a um ativo de outro proprietário.';
  end if;

  if exists (
    select 1
      from public.investment_assets
     group by owner_id, lower(btrim(name))
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Existem ativos duplicados por proprietário; revise-os antes de aplicar a migration.';
  end if;
end;
$$;

drop policy if exists investment_assets_select_own
  on public.investment_assets;
drop policy if exists investment_assets_insert_own
  on public.investment_assets;
drop policy if exists investment_assets_update_own
  on public.investment_assets;
drop policy if exists investment_assets_delete_own
  on public.investment_assets;

drop policy if exists investment_operations_select_own
  on public.investment_operations;
drop policy if exists investment_operations_insert_own
  on public.investment_operations;
drop policy if exists investment_operations_update_own
  on public.investment_operations;
drop policy if exists investment_operations_delete_own
  on public.investment_operations;

drop policy if exists investment_monthly_valuations_select_own
  on public.investment_monthly_valuations;
drop policy if exists investment_monthly_valuations_insert_own
  on public.investment_monthly_valuations;
drop policy if exists investment_monthly_valuations_update_own
  on public.investment_monthly_valuations;
drop policy if exists investment_monthly_valuations_delete_own
  on public.investment_monthly_valuations;

drop trigger if exists investment_operations_validate_account_owner
  on public.investment_operations;
drop trigger if exists set_investment_assets_updated_at
  on public.investment_assets;
drop trigger if exists set_investment_operations_updated_at
  on public.investment_operations;
drop trigger if exists set_investment_monthly_valuations_updated_at
  on public.investment_monthly_valuations;

alter table public.investment_operations
  drop constraint if exists investment_operations_asset_id_fkey,
  drop constraint if exists investment_operations_asset_owner_fk,
  drop constraint if exists investment_operations_account_id_fkey,
  drop constraint if exists investment_operations_quantity_positive,
  drop constraint if exists investment_operations_quantity_direction_check,
  drop constraint if exists investment_operations_unit_price_non_negative,
  drop constraint if exists investment_operations_unit_price_required;

alter table public.investment_monthly_valuations
  drop constraint if exists investment_monthly_valuations_asset_id_fkey,
  drop constraint if exists investment_monthly_valuations_asset_owner_fk,
  drop constraint if exists investment_monthly_valuations_asset_month_unique,
  drop constraint if exists investment_monthly_valuations_owner_asset_month_unique;

alter table public.investment_assets
  drop constraint if exists investment_assets_owner_account_name_unique,
  drop constraint if exists investment_assets_account_id_fkey,
  drop constraint if exists investment_assets_asset_type_check,
  drop constraint if exists investment_assets_owner_id_id_unique,
  drop constraint if exists investment_assets_symbol_not_blank,
  drop constraint if exists investment_assets_asset_type_not_blank;

drop index if exists public.investment_assets_account_id_idx;
drop index if exists public.investment_assets_owner_id_idx;
drop index if exists public.investment_operations_owner_id_idx;
drop index if exists public.investment_operations_asset_id_idx;
drop index if exists public.investment_operations_date_idx;
drop index if exists public.investment_monthly_valuations_owner_id_idx;
drop index if exists public.investment_monthly_valuations_asset_id_idx;
drop index if exists public.investment_monthly_valuations_reference_month_idx;

alter table public.investment_assets
  drop column if exists account_id;

alter table public.investment_assets
  add constraint investment_assets_owner_id_id_unique
    unique (owner_id, id),
  add constraint investment_assets_symbol_not_blank
    check (symbol is null or btrim(symbol) <> ''),
  add constraint investment_assets_asset_type_not_blank
    check (btrim(asset_type) <> '');

create unique index if not exists investment_assets_owner_name_unique_idx
  on public.investment_assets (owner_id, lower(btrim(name)));
create index if not exists investment_assets_owner_active_idx
  on public.investment_assets (owner_id, active);
create index if not exists investment_assets_owner_asset_type_idx
  on public.investment_assets (owner_id, asset_type);

alter table public.investment_operations
  alter column account_id set not null,
  alter column quantity type numeric(18, 8)
    using quantity::numeric(18, 8),
  alter column unit_price type numeric(18, 8)
    using unit_price::numeric(18, 8),
  alter column unit_price set not null,
  alter column fees type numeric(18, 2)
    using fees::numeric(18, 2),
  add constraint investment_operations_asset_owner_fk
    foreign key (owner_id, asset_id)
    references public.investment_assets(owner_id, id)
    on delete restrict,
  add constraint investment_operations_account_id_fkey
    foreign key (account_id)
    references public.accounts(id)
    on delete restrict,
  add constraint investment_operations_quantity_direction_check
    check (
      (operation_type = 'Compra' and quantity > 0)
      or
      (operation_type = 'Venda' and quantity < 0)
    ),
  add constraint investment_operations_unit_price_required
    check (unit_price > 0);

create index if not exists investment_operations_owner_date_idx
  on public.investment_operations (owner_id, operation_date desc);
create index if not exists investment_operations_owner_asset_date_idx
  on public.investment_operations (owner_id, asset_id, operation_date desc);
create index if not exists investment_operations_owner_account_date_idx
  on public.investment_operations (owner_id, account_id, operation_date desc);
create index if not exists investment_operations_account_id_idx
  on public.investment_operations (account_id);
create index if not exists investment_operations_owner_event_group_idx
  on public.investment_operations (owner_id, event_group_id)
  where event_group_id is not null;

alter table public.investment_monthly_valuations
  alter column market_value type numeric(18, 2)
    using market_value::numeric(18, 2),
  add constraint investment_monthly_valuations_asset_owner_fk
    foreign key (owner_id, asset_id)
    references public.investment_assets(owner_id, id)
    on delete cascade,
  add constraint investment_monthly_valuations_owner_asset_month_unique
    unique (owner_id, asset_id, reference_month);

create index if not exists investment_monthly_valuations_owner_month_idx
  on public.investment_monthly_valuations (owner_id, reference_month desc);

create or replace function public.validate_investment_account_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset_currency text;
  account_currency text;
  account_type text;
begin
  select asset.currency
    into asset_currency
    from public.investment_assets as asset
   where asset.id = new.asset_id
     and asset.owner_id = new.owner_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'O ativo do investimento deve pertencer ao mesmo owner_id da operação.';
  end if;

  select account.currency, account.type
    into account_currency, account_type
    from public.accounts as account
   where account.id = new.account_id
     and account.owner_id = new.owner_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'A conta do investimento deve pertencer ao mesmo owner_id da operação.';
  end if;

  if account_type <> 'Conta' then
    raise exception using
      errcode = '23514',
      message = 'A operação de investimento deve utilizar uma conta financeira.';
  end if;

  if account_currency is null or account_currency <> asset_currency then
    raise exception using
      errcode = '23514',
      message = 'O ativo e a conta da operação devem utilizar a mesma moeda.';
  end if;

  return new;
end;
$$;

create trigger investment_operations_validate_account_owner
  before insert or update of owner_id, asset_id, account_id
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

-- DDL is now committed to the catalog; ask PostgREST to refresh afterwards.
notify pgrst, 'reload schema';

commit;
