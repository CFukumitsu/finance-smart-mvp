begin;

-- The deployed 202607240001 migration required account_id on assets, while
-- the current frontend associates accounts with operations. Preserve the
-- legacy relationship for compatibility, but do not require it for assets.
alter table public.investment_assets
  add column if not exists account_id uuid
    references public.accounts(id) on delete restrict;

alter table public.investment_assets
  alter column account_id drop not null;

drop policy if exists investment_assets_select_own
  on public.investment_assets;

drop policy if exists investment_assets_insert_own
  on public.investment_assets;

drop policy if exists investment_assets_update_own
  on public.investment_assets;

drop policy if exists investment_assets_delete_own
  on public.investment_assets;

create policy investment_assets_select_own
  on public.investment_assets
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy investment_assets_insert_own
  on public.investment_assets
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1
          from public.accounts
         where accounts.id = investment_assets.account_id
           and accounts.owner_id = auth.uid()
      )
    )
  );

create policy investment_assets_update_own
  on public.investment_assets
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1
          from public.accounts
         where accounts.id = investment_assets.account_id
           and accounts.owner_id = auth.uid()
      )
    )
  );

create policy investment_assets_delete_own
  on public.investment_assets
  for delete
  to authenticated
  using (owner_id = auth.uid());

commit;
