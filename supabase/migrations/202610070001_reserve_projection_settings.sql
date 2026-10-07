-- Finance Smart - Visão Financeira: modelo da reserva estimada e meses
-- desconsiderados nas projeções.
-- Preparada para revisão; NÃO aplicar automaticamente em DEV/PROD.
--
-- Somente acréscimos: nenhuma tabela/linha existente é alterada (sem UPDATE
-- nem backfill). Usuário SEM linha em financial_overview_settings continua
-- com o comportamento atual (média ponderada dos 3 meses), resolvido pela
-- aplicação; por isso não é preciso criar linhas para usuários existentes.

-- Preferências globais da Visão Financeira (uma linha por usuário).
--   reserve_projection_model:
--     weighted_average : média ponderada dos 3 últimos meses completos válidos (pesos 3/2/1)
--     last_month       : somente o último mês completo válido
--     reference_month  : somente o mês escolhido em reserve_reference_month
--   reserve_reference_month: primeiro dia do mês de referência (só usado no
--     modelo reference_month; mantido ao trocar de modelo para não perder a escolha).
create table public.financial_overview_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  reserve_projection_model text not null default 'weighted_average',
  reserve_reference_month date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_overview_settings_model_check
    check (reserve_projection_model in ('weighted_average', 'last_month', 'reference_month')),
  constraint financial_overview_settings_reference_month_check
    check (reserve_reference_month is null or extract(day from reserve_reference_month) = 1),
  constraint financial_overview_settings_reference_required_check
    check (reserve_projection_model <> 'reference_month' or reserve_reference_month is not null)
);

comment on table public.financial_overview_settings is
  'Visão Financeira: preferências globais do usuário. Sem linha = média ponderada (comportamento original).';
comment on column public.financial_overview_settings.reserve_projection_model is
  'Modelo da reserva estimada: weighted_average | last_month | reference_month.';
comment on column public.financial_overview_settings.reserve_reference_month is
  'Primeiro dia do mês usado como base no modelo reference_month.';

create trigger set_financial_overview_settings_updated_at
  before update on public.financial_overview_settings
  for each row execute function public.set_updated_at();

alter table public.financial_overview_settings enable row level security;

create policy financial_overview_settings_select_own
  on public.financial_overview_settings for select to authenticated
  using (owner_id = auth.uid());
create policy financial_overview_settings_insert_own
  on public.financial_overview_settings for insert to authenticated
  with check (owner_id = auth.uid());
create policy financial_overview_settings_update_own
  on public.financial_overview_settings for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy financial_overview_settings_delete_own
  on public.financial_overview_settings for delete to authenticated
  using (owner_id = auth.uid());

revoke all on table public.financial_overview_settings from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.financial_overview_settings to authenticated, service_role;

-- Meses marcados manualmente como "não considerar nas projeções" (mês atípico).
create table public.projection_excluded_months (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projection_excluded_months_month_check check (extract(day from month) = 1),
  constraint projection_excluded_months_note_check check (note is null or char_length(note) <= 120),
  constraint projection_excluded_months_owner_month_key unique (owner_id, month)
);

comment on table public.projection_excluded_months is
  'Visão Financeira: meses (primeiro dia) desconsiderados nas projeções da reserva estimada.';

create trigger set_projection_excluded_months_updated_at
  before update on public.projection_excluded_months
  for each row execute function public.set_updated_at();

alter table public.projection_excluded_months enable row level security;

create policy projection_excluded_months_select_own
  on public.projection_excluded_months for select to authenticated
  using (owner_id = auth.uid());
create policy projection_excluded_months_insert_own
  on public.projection_excluded_months for insert to authenticated
  with check (owner_id = auth.uid());
create policy projection_excluded_months_update_own
  on public.projection_excluded_months for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy projection_excluded_months_delete_own
  on public.projection_excluded_months for delete to authenticated
  using (owner_id = auth.uid());

revoke all on table public.projection_excluded_months from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.projection_excluded_months to authenticated, service_role;
