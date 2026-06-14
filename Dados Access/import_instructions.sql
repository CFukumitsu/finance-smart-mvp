-- FINANCE SMART MVP — importação Access tratada
-- Ordem no Supabase Table Editor:
-- 1) 01_accounts_import.csv      -> accounts
-- 2) 02_categories_import.csv    -> categories
-- 3) 03_competences_import.csv   -> competences
-- 4) 04_transactions_import.csv  -> transactions

-- Limpeza antes de importar:
truncate table public.competence_closures restart identity cascade;
truncate table public.recurring_transactions restart identity cascade;
truncate table public.transactions restart identity cascade;
truncate table public.competences restart identity cascade;
truncate table public.categories restart identity cascade;
truncate table public.accounts restart identity cascade;

notify pgrst, 'reload schema';

-- Validação depois de importar:
select 'accounts' as tabela, count(*) from public.accounts
union all select 'categories', count(*) from public.categories
union all select 'competences', count(*) from public.competences
union all select 'transactions', count(*) from public.transactions;

-- Totais por tipo:
select
  type,
  status,
  count(*) as quantidade,
  sum(value) as total
from public.transactions
group by type, status
order by type, status;

-- Conferência de lançamentos sem vínculo:
select count(*) as transactions_without_account from public.transactions where account_id is null;
select count(*) as transactions_without_category from public.transactions where category_id is null;
select count(*) as transactions_without_competence from public.transactions where competence_id is null;
