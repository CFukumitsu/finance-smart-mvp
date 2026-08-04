begin;

do $$
begin
  if exists (
    select 1
      from public.investment_operations
     where operation_type not in ('Compra', 'Venda')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existem tipos de operação não contemplados pelo cálculo histórico de investimentos.';
  end if;

  if exists (
    select 1
      from public.investment_operations
     where quantity is null
        or quantity = 0
        or (operation_type = 'Compra' and quantity < 0)
        or (operation_type = 'Venda' and quantity > 0)
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existem operações com quantidade nula, zero ou sinal incompatível com o tipo.';
  end if;

  if exists (
    select 1
      from public.investment_monthly_valuations
     where reference_month <> date_trunc('month', reference_month)::date
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existem valorizações cujo reference_month não é o primeiro dia do mês.';
  end if;
end;
$$;

alter table public.investment_monthly_valuations
  alter column market_value type numeric(18, 8)
    using market_value::numeric(18, 8),
  add column if not exists total_market_value numeric(18, 2),
  add column if not exists quantity_snapshot numeric(18, 8),
  add column if not exists average_price_snapshot numeric(18, 8);

do $$
begin
  if exists (
    select 1
      from public.investment_monthly_valuations
     where quantity_snapshot is null
       and total_market_value is not null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existem valorizações com total_market_value preenchido e quantity_snapshot nulo.',
      hint = 'Execute investment_valuation_snapshots_pre_audit.sql e corrija os registros listados antes de reaplicar a migration.';
  end if;

  if exists (
    select 1
      from public.investment_monthly_valuations
     where quantity_snapshot is not null
       and quantity_snapshot <= 0
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existem valorizações com quantity_snapshot inválido.';
  end if;

  if exists (
    select 1
      from public.investment_monthly_valuations
     where quantity_snapshot is not null
       and total_market_value is not null
       and abs(
         total_market_value - market_value * quantity_snapshot
       ) > 0.01
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existem valorizações com snapshots matematicamente incompatíveis.',
      hint = 'Execute investment_valuation_snapshots_pre_audit.sql e corrija os registros cuja diferença seja superior a R$ 0,01.';
  end if;
end;
$$;

alter table public.investment_monthly_valuations
  drop constraint if exists investment_monthly_valuations_total_market_value_non_negative,
  drop constraint if exists investment_monthly_valuations_quantity_snapshot_positive,
  drop constraint if exists investment_monthly_valuations_average_price_snapshot_non_negative;

alter table public.investment_monthly_valuations
  add constraint investment_monthly_valuations_total_market_value_non_negative
    check (total_market_value is null or total_market_value >= 0),
  add constraint investment_monthly_valuations_quantity_snapshot_positive
    check (quantity_snapshot is null or quantity_snapshot > 0),
  add constraint investment_monthly_valuations_average_price_snapshot_non_negative
    check (average_price_snapshot is null or average_price_snapshot >= 0);

-- market_value has always been consumed by the application as a unit price.
-- Existing totals are filled only when the historical quantity is unambiguous.
with historical_quantities as (
  select
    valuation.id,
    sum(operation.quantity) as quantity
  from public.investment_monthly_valuations as valuation
  left join public.investment_operations as operation
    on operation.owner_id = valuation.owner_id
   and operation.asset_id = valuation.asset_id
   and operation.operation_date <
       date_trunc('month', valuation.reference_month)::date + interval '1 month'
  group by valuation.id
)
update public.investment_monthly_valuations as valuation
   set quantity_snapshot = coalesce(
         valuation.quantity_snapshot,
         historical.quantity
       ),
       total_market_value = coalesce(
         valuation.total_market_value,
         round(
           valuation.market_value * coalesce(
             valuation.quantity_snapshot,
             historical.quantity
           ),
           2
         )
       )
 from historical_quantities as historical
 where historical.id = valuation.id
   and valuation.total_market_value is null
   and coalesce(valuation.quantity_snapshot, historical.quantity) > 0;

notify pgrst, 'reload schema';

commit;
