begin transaction read only;
select table_name, column_name, data_type, is_nullable, column_default, numeric_precision, numeric_scale
from information_schema.columns where table_schema='public'
and table_name in ('accounts','transactions','account_closures','competence_closures','competences','investment_account_events','investment_exchange_rates','credit_card_statement_items','credit_card_statement_item_transactions')
order by table_name, ordinal_position;
select p.proname, pg_get_functiondef(p.oid) as definition from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and p.proname in ('get_finance_balance_for_bankroll','get_financial_balance_for_investment','assert_financial_scope_open','lock_financial_scope','protect_account_currency_history');
select c.relname, t.tgname, pg_get_triggerdef(t.oid) as definition from pg_trigger t
join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal and c.relname in ('accounts','transactions','account_closures','competence_closures');
select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname='public'
and tablename in ('accounts','transactions','account_closures','competence_closures') order by tablename,policyname;
rollback;
