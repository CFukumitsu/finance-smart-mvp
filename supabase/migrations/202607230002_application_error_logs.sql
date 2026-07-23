-- Logs persistentes de erros da aplicação.
-- A gravação ocorre exclusivamente pela RPC log_application_error.

create table if not exists public.application_error_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,

  context text not null,
  error_name text,
  error_message text not null,
  error_code text,
  error_details text,
  error_hint text,

  page_url text,
  user_agent text,
  environment text,
  app_version text,

  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists application_error_logs_owner_created_idx
  on public.application_error_logs (owner_id, created_at desc);

alter table public.application_error_logs enable row level security;

drop policy if exists application_error_logs_owner_select
  on public.application_error_logs;

create policy application_error_logs_owner_select
  on public.application_error_logs
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists application_error_logs_no_direct_insert
  on public.application_error_logs;

create policy application_error_logs_no_direct_insert
  on public.application_error_logs
  for insert
  to authenticated
  with check (false);

drop policy if exists application_error_logs_no_direct_update
  on public.application_error_logs;

create policy application_error_logs_no_direct_update
  on public.application_error_logs
  for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists application_error_logs_no_direct_delete
  on public.application_error_logs;

create policy application_error_logs_no_direct_delete
  on public.application_error_logs
  for delete
  to authenticated
  using (false);

create or replace function public.log_application_error(
  p_context text,
  p_error_name text default null,
  p_error_message text default null,
  p_error_code text default null,
  p_error_details text default null,
  p_error_hint text default null,
  p_page_url text default null,
  p_user_agent text default null,
  p_environment text default null,
  p_app_version text default null,
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  created_log_id uuid;
begin
  if authenticated_owner_id is null then
    raise exception 'Usuário não autenticado.'
      using errcode = '42501';
  end if;

  if nullif(trim(p_context), '') is null then
    raise exception 'Informe o contexto do erro.'
      using errcode = '22023';
  end if;

  insert into public.application_error_logs (
    owner_id,
    context,
    error_name,
    error_message,
    error_code,
    error_details,
    error_hint,
    page_url,
    user_agent,
    environment,
    app_version,
    metadata
  )
  values (
    authenticated_owner_id,
    left(trim(p_context), 250),
    left(nullif(trim(p_error_name), ''), 150),
    left(coalesce(nullif(trim(p_error_message), ''), 'Erro não informado.'), 4000),
    left(nullif(trim(p_error_code), ''), 100),
    left(nullif(trim(p_error_details), ''), 8000),
    left(nullif(trim(p_error_hint), ''), 4000),
    left(nullif(trim(p_page_url), ''), 2000),
    left(nullif(trim(p_user_agent), ''), 1000),
    left(nullif(trim(p_environment), ''), 50),
    left(nullif(trim(p_app_version), ''), 100),
    case
      when p_metadata is null then null
      when pg_catalog.octet_length(p_metadata::text) <= 20000 then p_metadata
      else jsonb_build_object(
        'truncated',
        true,
        'message',
        'Os metadados excederam o limite permitido.'
      )
    end
  )
  returning id into created_log_id;

  return created_log_id;
end;
$$;

alter function public.log_application_error(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) owner to postgres;

revoke all on table public.application_error_logs
from public, anon, authenticated, service_role;

grant select on table public.application_error_logs
to authenticated, service_role;

revoke all on function public.log_application_error(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.log_application_error(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to authenticated;