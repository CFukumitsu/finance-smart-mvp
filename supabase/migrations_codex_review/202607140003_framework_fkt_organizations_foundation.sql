-- Framework FKT - base opcional para organizações
-- REVIEW ONLY: não aplicar nem migrar dados nesta etapa.

begin;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'disabled', 'deleted')),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_users (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null default 'user' check (role in ('admin', 'manager', 'user')),
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled', 'deleted')),
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_users_user_idx on public.organization_users(user_id);
create index if not exists organization_users_status_idx on public.organization_users(organization_id, status);

alter table public.organizations enable row level security;
alter table public.organization_users enable row level security;

-- Estrutura dormente: sem policies e sem acesso pelo cliente até que o modelo
-- multiempresa e suas permissões sejam formalmente implementados.
revoke all on public.organizations from anon, authenticated;
revoke all on public.organization_users from anon, authenticated;
grant all on public.organizations to service_role;
grant all on public.organization_users to service_role;

commit;
