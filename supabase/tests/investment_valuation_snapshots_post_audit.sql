-- Execute immediately after 202608040001_investment_valuation_snapshots.sql.
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
select 'valuations_with_any_null_snapshot', count(*)::bigint
  from public.investment_monthly_valuations
 where quantity_snapshot is null or total_market_value is null
union all
select 'valuations_with_null_quantity_snapshot', count(*)::bigint
  from public.investment_monthly_valuations
 where quantity_snapshot is null
union all
select 'valuations_with_null_total_market_value', count(*)::bigint
  from public.investment_monthly_valuations
 where total_market_value is null
union all
select 'valuations_with_null_average_price_snapshot', count(*)::bigint
  from public.investment_monthly_valuations
 where average_price_snapshot is null
union all
select 'valuations_with_total_zero', count(*)::bigint
  from public.investment_monthly_valuations
 where total_market_value = 0
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
select 'complete_snapshots_difference_gt_0_01', count(*)::bigint
  from public.investment_monthly_valuations
 where quantity_snapshot is not null
   and total_market_value is not null
   and abs(total_market_value - market_value * quantity_snapshot) > 0.01
union all
select 'snapshots_quantity_without_total', count(*)::bigint
  from public.investment_monthly_valuations
 where quantity_snapshot is not null
   and total_market_value is null
union all
select 'snapshots_total_without_quantity', count(*)::bigint
  from public.investment_monthly_valuations
 where quantity_snapshot is null
   and total_market_value is not null
order by metric;

select valuation.id,
       valuation.owner_id,
       valuation.asset_id,
       valuation.reference_month,
       historical.operation_count,
       historical.historical_quantity,
       valuation.market_value,
       valuation.quantity_snapshot,
       valuation.total_market_value,
       valuation.average_price_snapshot
  from public.investment_monthly_valuations as valuation
  join pg_temp.investment_valuation_historical_quantities as historical
    on historical.valuation_id = valuation.id
 where valuation.quantity_snapshot is null
    or valuation.total_market_value is null
    or valuation.average_price_snapshot is null
 order by valuation.owner_id, valuation.asset_id, valuation.reference_month;
