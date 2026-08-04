-- Execute immediately before 202608040001_investment_valuation_snapshots.sql.
-- Read-only: this script does not change persisted data.

create or replace view pg_temp.investment_valuation_historical_quantities as
select
  valuation.id as valuation_id,
  count(operation.id) as operation_count,
  sum(operation.quantity) as historical_quantity
from public.investment_monthly_valuations as valuation
left join public.investment_operations as operation
  on operation.owner_id = valuation.owner_id
 and operation.asset_id = valuation.asset_id
 and operation.operation_date <
     date_trunc('month', valuation.reference_month)::date + interval '1 month'
group by valuation.id;

create temporary table investment_snapshot_consistency_audit (
  valuation_id uuid,
  owner_id uuid,
  asset_id uuid,
  reference_month date,
  issue text,
  market_value numeric,
  quantity_snapshot numeric,
  total_market_value numeric,
  calculated_total numeric,
  absolute_difference numeric
);

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'investment_monthly_valuations'
       and column_name = 'quantity_snapshot'
  ) and exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'investment_monthly_valuations'
       and column_name = 'total_market_value'
  ) then
    execute $audit$
      insert into investment_snapshot_consistency_audit
      select
        id,
        owner_id,
        asset_id,
        reference_month,
        case
          when quantity_snapshot is not null and total_market_value is null
            then 'quantity_without_total'
          when quantity_snapshot is null and total_market_value is not null
            then 'total_without_quantity'
          when quantity_snapshot is not null
           and total_market_value is not null
           and abs(total_market_value - market_value * quantity_snapshot) > 0.01
            then 'complete_snapshot_difference_gt_0_01'
          when quantity_snapshot is not null
           and total_market_value is not null
           and total_market_value <> round(market_value * quantity_snapshot, 2)
            then 'complete_snapshot_rounding_difference'
        end,
        market_value,
        quantity_snapshot,
        total_market_value,
        round(market_value * quantity_snapshot, 2),
        abs(total_market_value - market_value * quantity_snapshot)
      from public.investment_monthly_valuations
      where (quantity_snapshot is not null and total_market_value is null)
         or (quantity_snapshot is null and total_market_value is not null)
         or (
           quantity_snapshot is not null
           and total_market_value is not null
           and total_market_value <> round(market_value * quantity_snapshot, 2)
         )
    $audit$;
  end if;
end;
$$;

select 'total_valuations' as metric, count(*)::bigint as value
  from public.investment_monthly_valuations
union all
select 'valuations_with_positive_historical_quantity', count(*)::bigint
  from pg_temp.investment_valuation_historical_quantities
 where historical_quantity > 0
union all
select 'valuations_without_historical_operations', count(*)::bigint
  from pg_temp.investment_valuation_historical_quantities
 where operation_count = 0
union all
select 'valuations_that_will_keep_null_snapshots', count(*)::bigint
  from pg_temp.investment_valuation_historical_quantities
 where historical_quantity is null or historical_quantity <= 0
union all
select 'valuations_with_calculated_total_zero', count(*)::bigint
  from public.investment_monthly_valuations as valuation
  join pg_temp.investment_valuation_historical_quantities as historical
    on historical.valuation_id = valuation.id
 where historical.historical_quantity > 0
   and round(valuation.market_value * historical.historical_quantity, 2) = 0
union all
select 'duplicate_owner_asset_reference_month_groups', count(*)::bigint
  from (
    select 1
      from public.investment_monthly_valuations
     group by owner_id, asset_id, reference_month
    having count(*) > 1
  ) as duplicates
union all
select 'operations_with_unhandled_types', count(*)::bigint
  from public.investment_operations
 where operation_type not in ('Compra', 'Venda')
union all
select 'operations_with_null_or_zero_quantity', count(*)::bigint
  from public.investment_operations
 where quantity is null or quantity = 0
union all
select 'operations_with_incompatible_sign', count(*)::bigint
  from public.investment_operations
 where (operation_type = 'Compra' and quantity < 0)
    or (operation_type = 'Venda' and quantity > 0)
union all
select 'valuations_with_non_normalized_reference_month', count(*)::bigint
  from public.investment_monthly_valuations
 where reference_month <> date_trunc('month', reference_month)::date
union all
select 'snapshots_quantity_without_total', count(*)::bigint
  from investment_snapshot_consistency_audit
 where issue = 'quantity_without_total'
union all
select 'snapshots_total_without_quantity', count(*)::bigint
  from investment_snapshot_consistency_audit
 where issue = 'total_without_quantity'
union all
select 'complete_snapshots_with_rounding_difference', count(*)::bigint
  from investment_snapshot_consistency_audit
 where issue in (
   'complete_snapshot_difference_gt_0_01',
   'complete_snapshot_rounding_difference'
 )
union all
select 'complete_snapshots_difference_gt_0_01', count(*)::bigint
  from investment_snapshot_consistency_audit
 where issue = 'complete_snapshot_difference_gt_0_01'
order by metric;

select *
  from investment_snapshot_consistency_audit
 order by owner_id, asset_id, reference_month;

select operation_type, count(*) as operation_count
  from public.investment_operations
 group by operation_type
 order by operation_type;

select owner_id, asset_id, reference_month, count(*) as duplicate_count
  from public.investment_monthly_valuations
 group by owner_id, asset_id, reference_month
having count(*) > 1
 order by owner_id, asset_id, reference_month;

select id, owner_id, asset_id, operation_type, operation_date, quantity
  from public.investment_operations
 where operation_type not in ('Compra', 'Venda')
    or quantity is null
    or quantity = 0
    or (operation_type = 'Compra' and quantity < 0)
    or (operation_type = 'Venda' and quantity > 0)
 order by owner_id, asset_id, operation_date, id;
