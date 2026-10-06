-- Finance Smart - Visão Financeira (Dashboard Premium): parâmetros de
-- planejamento por conta e meta mensal de economia.
-- Preparada para revisão; NÃO aplicar automaticamente em DEV/PROD.
--
-- Somente acréscimos: nenhuma linha existente é alterada (sem UPDATE/backfill)
-- e o Dashboard antigo não lê nenhuma destas colunas.

-- Papel da conta no planejamento. NULL = automático, resolvido pela aplicação
-- a partir do cadastro que já existe (contas de investimento -> 'savings';
-- demais contas e cartões -> 'operational'). Assim não é preciso reescrever
-- dados para o default ser coerente.
--   operational : saldo conta como disponível; despesas/faturas são compromissos
--   savings     : destino de dinheiro guardado (reserva/investimento); o saldo
--                 NÃO é disponível e transferências para ela são "guardado"
--   excluded    : fora do planejamento
alter table public.accounts
  add column planning_role text,
  add column use_spending_history boolean not null default true,
  add column spending_history_start_date date;

alter table public.accounts
  add constraint accounts_planning_role_check
    check (planning_role is null or planning_role in ('operational', 'savings', 'excluded'));

comment on column public.accounts.planning_role is
  'Visão Financeira: operational | savings | excluded. NULL = automático (investimento -> savings; demais -> operational).';
comment on column public.accounts.use_spending_history is
  'Visão Financeira: despesas variáveis desta conta entram na reserva estimada pelo histórico.';
comment on column public.accounts.spending_history_start_date is
  'Visão Financeira: usar histórico de gastos somente a partir desta data (mudança de comportamento).';

-- Meta mensal de economia por competência (valor na moeda principal, BRL).
create table public.monthly_savings_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  competence_id uuid not null references public.competences(id) on delete cascade,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_savings_goals_amount_check check (amount >= 0),
  constraint monthly_savings_goals_owner_competence_key unique (owner_id, competence_id)
);

create trigger set_monthly_savings_goals_updated_at
  before update on public.monthly_savings_goals
  for each row execute function public.set_updated_at();

alter table public.monthly_savings_goals enable row level security;

-- A competência também precisa ser do próprio usuário.
create policy monthly_savings_goals_select_own
  on public.monthly_savings_goals for select to authenticated
  using (owner_id = auth.uid());
create policy monthly_savings_goals_insert_own
  on public.monthly_savings_goals for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.competences competence
       where competence.id = competence_id and competence.owner_id = auth.uid()
    )
  );
create policy monthly_savings_goals_update_own
  on public.monthly_savings_goals for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.competences competence
       where competence.id = competence_id and competence.owner_id = auth.uid()
    )
  );
create policy monthly_savings_goals_delete_own
  on public.monthly_savings_goals for delete to authenticated
  using (owner_id = auth.uid());

revoke all on table public.monthly_savings_goals from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.monthly_savings_goals to authenticated, service_role;
