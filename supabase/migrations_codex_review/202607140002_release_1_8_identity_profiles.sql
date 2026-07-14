-- Release 1.8 - Identidade e Usuários
-- REVIEW ONLY: esta migration não deve ser aplicada sem autorização.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  first_name text not null default '',
  last_name text,
  phone text,
  avatar_url text,
  avatar_storage_path text,
  role text not null default 'user' check (role in ('admin', 'manager', 'user')),
  status text not null default 'active' check (status in ('invited', 'active', 'disabled', 'deleted')),
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',
  theme text not null default 'dark' check (theme in ('dark', 'system')),
  invited_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_status_idx on public.profiles(status);

create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  inferred_first_name text;
  inferred_last_name text;
  auth_user_count bigint;
begin
  -- Serializa criações concorrentes: somente o primeiro usuário confirmado pelo
  -- backend do Auth pode receber privilégios administrativos.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('framework_fkt:first_administrator', 0));
  select count(*) into auth_user_count from auth.users;
  inferred_first_name := coalesce(
    nullif(trim(metadata ->> 'given_name'), ''),
    nullif(trim(metadata ->> 'first_name'), ''),
    nullif(split_part(coalesce(metadata ->> 'full_name', metadata ->> 'name', ''), ' ', 1), '')
  );
  inferred_last_name := coalesce(
    nullif(trim(metadata ->> 'family_name'), ''),
    nullif(trim(metadata ->> 'last_name'), ''),
    nullif(trim(regexp_replace(coalesce(metadata ->> 'full_name', metadata ->> 'name', ''), '^\S+\s*', '')), '')
  );

  insert into public.profiles (
    id, first_name, last_name, avatar_url, role, status, invited_at
  ) values (
    new.id,
    coalesce(inferred_first_name, ''),
    inferred_last_name,
    coalesce(nullif(metadata ->> 'avatar_url', ''), nullif(metadata ->> 'picture', '')),
    case when auth_user_count = 1 then 'admin' else 'user' end,
    case
      when auth_user_count = 1 then 'active'
      when new.invited_at is not null and new.last_sign_in_at is null then 'invited'
      else 'active'
    end,
    new.invited_at
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.handle_auth_user_profile();

create or replace function public.handle_auth_user_access_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at
     and new.last_sign_in_at is not null then
    update public.profiles
       set status = case when status in ('disabled', 'deleted') then status else 'active' end,
           updated_at = now()
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_access_update_profile on auth.users;
create trigger on_auth_user_access_update_profile
  after update of last_sign_in_at on auth.users
  for each row execute function public.handle_auth_user_access_status();

create or replace function public.sync_auth_user_profile_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  metadata_name text := coalesce(metadata ->> 'full_name', metadata ->> 'name', '');
begin
  update public.profiles
     set first_name = case when first_name = '' then coalesce(nullif(metadata ->> 'given_name', ''), nullif(split_part(metadata_name, ' ', 1), ''), first_name) else first_name end,
         last_name = case when coalesce(last_name, '') = '' then coalesce(nullif(metadata ->> 'family_name', ''), nullif(trim(regexp_replace(metadata_name, '^\S+\s*', '')), ''), last_name) else last_name end,
         avatar_url = coalesce(avatar_url, nullif(metadata ->> 'avatar_url', ''), nullif(metadata ->> 'picture', '')),
         updated_at = now()
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_metadata_update_profile on auth.users;
create trigger on_auth_user_metadata_update_profile
  after update of raw_user_meta_data on auth.users
  for each row execute function public.sync_auth_user_profile_metadata();

insert into public.profiles (
  id, first_name, last_name, avatar_url, role, status, invited_at, created_at, updated_at
)
select
  users.id,
  coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'given_name'), ''),
    nullif(trim(users.raw_user_meta_data ->> 'first_name'), ''),
    nullif(split_part(coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name', ''), ' ', 1), ''),
    ''
  ),
  coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'family_name'), ''),
    nullif(trim(users.raw_user_meta_data ->> 'last_name'), ''),
    nullif(trim(regexp_replace(coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name', ''), '^\S+\s*', '')), '')
  ),
  coalesce(nullif(users.raw_user_meta_data ->> 'avatar_url', ''), nullif(users.raw_user_meta_data ->> 'picture', '')),
  case when (select count(*) from auth.users) = 1 then 'admin' else 'user' end,
  case
    when (select count(*) from auth.users) = 1 then 'active'
    when users.banned_until is not null and users.banned_until > now() then 'disabled'
    when users.invited_at is not null and users.last_sign_in_at is null then 'invited'
    else 'active'
  end,
  users.invited_at,
  users.created_at,
  now()
from auth.users as users
on conflict (id) do nothing;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke all on public.profiles from anon;
revoke insert, delete, truncate, references, trigger on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone, locale, timezone, theme, updated_at)
  on public.profiles to authenticated;
grant all on public.profiles to service_role;

revoke execute on function public.handle_auth_user_profile() from public, anon, authenticated;
revoke execute on function public.handle_auth_user_access_status() from public, anon, authenticated;
revoke execute on function public.sync_auth_user_profile_metadata() from public, anon, authenticated;

comment on column public.profiles.avatar_storage_path is
  'Caminho futuro no Storage. A resolução deve priorizar Storage, Google, Identity e, por fim, iniciais.';

-- Layouts globais permanecem legíveis, mas layouts vinculados a conta ficam
-- isolados por owner. Escrita exige uma conta pertencente ao usuário.
drop policy if exists "Allow all statement import layouts" on public.statement_import_layouts;
drop policy if exists statement_import_layouts_authenticated_select on public.statement_import_layouts;
drop policy if exists statement_import_layouts_owner_insert on public.statement_import_layouts;
drop policy if exists statement_import_layouts_owner_update on public.statement_import_layouts;
drop policy if exists statement_import_layouts_owner_delete on public.statement_import_layouts;
revoke all on public.statement_import_layouts from anon;

create policy statement_import_layouts_authenticated_select
  on public.statement_import_layouts for select to authenticated
  using (
    account_id is null or exists (
      select 1 from public.accounts
      where accounts.id = statement_import_layouts.account_id
        and accounts.owner_id = auth.uid()
    )
  );

create policy statement_import_layouts_owner_insert
  on public.statement_import_layouts for insert to authenticated
  with check (exists (
    select 1 from public.accounts
    where accounts.id = statement_import_layouts.account_id
      and accounts.owner_id = auth.uid()
  ));

create policy statement_import_layouts_owner_update
  on public.statement_import_layouts for update to authenticated
  using (exists (
    select 1 from public.accounts
    where accounts.id = statement_import_layouts.account_id
      and accounts.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.accounts
    where accounts.id = statement_import_layouts.account_id
      and accounts.owner_id = auth.uid()
  ));

create policy statement_import_layouts_owner_delete
  on public.statement_import_layouts for delete to authenticated
  using (exists (
    select 1 from public.accounts
    where accounts.id = statement_import_layouts.account_id
      and accounts.owner_id = auth.uid()
  ));

-- Controle de rotinas é estado interno do servidor, não dado editável pelo cliente.
drop policy if exists system_routines_insert on public.system_routines;
drop policy if exists system_routines_select on public.system_routines;
drop policy if exists system_routines_update on public.system_routines;
revoke all on public.system_routines from anon, authenticated;
grant all on public.system_routines to service_role;

-- Repara uma policy preexistente que permitia ler/gravar conciliações de qualquer conta.
drop policy if exists "Allow all transaction reconciliations" on public.transaction_reconciliations;
drop policy if exists transaction_reconciliations_owner_select on public.transaction_reconciliations;
drop policy if exists transaction_reconciliations_owner_insert on public.transaction_reconciliations;
drop policy if exists transaction_reconciliations_owner_update on public.transaction_reconciliations;
drop policy if exists transaction_reconciliations_owner_delete on public.transaction_reconciliations;
revoke all on public.transaction_reconciliations from anon;

create policy transaction_reconciliations_owner_select
  on public.transaction_reconciliations for select to authenticated
  using (exists (
    select 1 from public.accounts
    where accounts.id = transaction_reconciliations.account_id
      and accounts.owner_id = auth.uid()
  ) and exists (
    select 1 from public.competences
    where competences.id = transaction_reconciliations.competence_id
      and competences.owner_id = auth.uid()
  ) and (
    transaction_reconciliations.transaction_id is null or exists (
      select 1 from public.transactions
      where transactions.id = transaction_reconciliations.transaction_id
        and transactions.owner_id = auth.uid()
    )
  ));

create policy transaction_reconciliations_owner_insert
  on public.transaction_reconciliations for insert to authenticated
  with check (exists (
    select 1 from public.accounts
    where accounts.id = transaction_reconciliations.account_id
      and accounts.owner_id = auth.uid()
  ) and exists (
    select 1 from public.competences
    where competences.id = transaction_reconciliations.competence_id
      and competences.owner_id = auth.uid()
  ) and (
    transaction_reconciliations.transaction_id is null or exists (
      select 1 from public.transactions
      where transactions.id = transaction_reconciliations.transaction_id
        and transactions.owner_id = auth.uid()
    )
  ));

create policy transaction_reconciliations_owner_update
  on public.transaction_reconciliations for update to authenticated
  using (exists (
    select 1 from public.accounts
    where accounts.id = transaction_reconciliations.account_id
      and accounts.owner_id = auth.uid()
  ) and exists (
    select 1 from public.competences
    where competences.id = transaction_reconciliations.competence_id
      and competences.owner_id = auth.uid()
  ) and (
    transaction_reconciliations.transaction_id is null or exists (
      select 1 from public.transactions
      where transactions.id = transaction_reconciliations.transaction_id
        and transactions.owner_id = auth.uid()
    )
  ))
  with check (exists (
    select 1 from public.accounts
    where accounts.id = transaction_reconciliations.account_id
      and accounts.owner_id = auth.uid()
  ) and exists (
    select 1 from public.competences
    where competences.id = transaction_reconciliations.competence_id
      and competences.owner_id = auth.uid()
  ) and (
    transaction_reconciliations.transaction_id is null or exists (
      select 1 from public.transactions
      where transactions.id = transaction_reconciliations.transaction_id
        and transactions.owner_id = auth.uid()
    )
  ));

create policy transaction_reconciliations_owner_delete
  on public.transaction_reconciliations for delete to authenticated
  using (exists (
    select 1 from public.accounts
    where accounts.id = transaction_reconciliations.account_id
      and accounts.owner_id = auth.uid()
  ) and exists (
    select 1 from public.competences
    where competences.id = transaction_reconciliations.competence_id
      and competences.owner_id = auth.uid()
  ) and (
    transaction_reconciliations.transaction_id is null or exists (
      select 1 from public.transactions
      where transactions.id = transaction_reconciliations.transaction_id
        and transactions.owner_id = auth.uid()
    )
  ));
