alter table public.accounts
add column if not exists show_on_investments_dashboard boolean not null default false;

create index if not exists accounts_show_on_investments_dashboard_idx
on public.accounts (owner_id)
where show_on_investments_dashboard = true;