begin;

do $$
begin
  if not exists (select 1 from auth.users) then
    raise exception 'O teste exige ao menos um usuário em auth.users.';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  (
    select id::text
      from auth.users
     order by created_at
     limit 1
  ),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('investment_test.owner_id', auth.uid()::text, true);
select set_config('investment_test.account_id', gen_random_uuid()::text, true);
select set_config('investment_test.asset_id', gen_random_uuid()::text, true);
select set_config('investment_test.usd_asset_id', gen_random_uuid()::text, true);
select set_config('investment_test.buy_id', gen_random_uuid()::text, true);
select set_config('investment_test.sale_id', gen_random_uuid()::text, true);
select set_config('investment_test.valuation_id', gen_random_uuid()::text, true);
select set_config('investment_test.rate_id', gen_random_uuid()::text, true);

insert into public.accounts (
  id,
  owner_id,
  name,
  type,
  currency,
  active,
  show_on_investments_dashboard
)
values (
  current_setting('investment_test.account_id')::uuid,
  auth.uid(),
  'Conta BRL - teste transacional',
  'Conta',
  'BRL',
  true,
  true
);

set local role authenticated;

insert into public.investment_assets (
  id,
  owner_id,
  name,
  symbol,
  asset_type,
  currency,
  active
)
values
  (
    current_setting('investment_test.asset_id')::uuid,
    auth.uid(),
    'Ativo BRL - teste transacional',
    'TBRL',
    'Tipo configurável de teste',
    'BRL',
    true
  ),
  (
    current_setting('investment_test.usd_asset_id')::uuid,
    auth.uid(),
    'Ativo USD - teste transacional',
    'TUSD',
    'ETF',
    'USD',
    true
  );

insert into public.investment_operations (
  id,
  owner_id,
  asset_id,
  account_id,
  operation_type,
  operation_date,
  quantity,
  unit_price,
  fees,
  notes
)
values
  (
    current_setting('investment_test.buy_id')::uuid,
    auth.uid(),
    current_setting('investment_test.asset_id')::uuid,
    current_setting('investment_test.account_id')::uuid,
    'Compra',
    date '2026-08-01',
    10,
    10,
    2.50,
    null
  ),
  (
    current_setting('investment_test.sale_id')::uuid,
    auth.uid(),
    current_setting('investment_test.asset_id')::uuid,
    current_setting('investment_test.account_id')::uuid,
    'Venda',
    date '2026-08-02',
    -2,
    15,
    1.25,
    'Venda parcial de teste'
  );

insert into public.investment_monthly_valuations (
  id,
  owner_id,
  asset_id,
  reference_month,
  market_value,
  total_market_value,
  quantity_snapshot,
  average_price_snapshot,
  currency,
  consolidation_currency,
  exchange_rate,
  notes
)
values (
  current_setting('investment_test.valuation_id')::uuid,
  auth.uid(),
  current_setting('investment_test.asset_id')::uuid,
  date '2026-08-01',
  14.50,
  145.00,
  10,
  10.25,
  'BRL',
  'BRL',
  1,
  'Valor para validar os cards'
);

insert into public.investment_settings (owner_id, consolidation_currency)
values (auth.uid(), 'BRL');

insert into public.investment_exchange_rates (
  id, owner_id, base_currency, quote_currency, rate, source, quoted_at, updated_by
)
values (
  current_setting('investment_test.rate_id')::uuid,
  auth.uid(), 'USD', 'BRL', 5.43, 'MANUAL', now(), auth.uid()
);

do $$
declare
  duplicate_rejected boolean := false;
  snapshot_currency_rejected boolean := false;
begin
  begin
    insert into public.investment_monthly_valuations (
      owner_id,
      asset_id,
      reference_month,
      market_value,
      total_market_value,
      quantity_snapshot,
      average_price_snapshot
      , currency
      , consolidation_currency
      , exchange_rate
    )
    values (
      auth.uid(),
      current_setting('investment_test.asset_id')::uuid,
      date '2026-08-01',
      15,
      150,
      10,
      10.25
      , 'BRL'
      , 'BRL'
      , 1
    );
  exception
    when unique_violation then
      duplicate_rejected := true;
  end;

  if not duplicate_rejected then
    raise exception 'Foi aceita uma valorização duplicada para o mesmo ativo/mês.';
  end if;

  begin
    insert into public.investment_monthly_valuations (
      owner_id, asset_id, reference_month, market_value, total_market_value,
      quantity_snapshot, average_price_snapshot, currency,
      consolidation_currency, exchange_rate
    ) values (
      auth.uid(), current_setting('investment_test.asset_id')::uuid,
      date '2026-09-01', 15, 150, 10, 10.25, 'USD', 'BRL', 5.43
    );
  exception
    when check_violation then snapshot_currency_rejected := true;
  end;

  if not snapshot_currency_rejected then
    raise exception 'Foi aceito snapshot com moeda diferente da moeda do ativo.';
  end if;
end;
$$;

do $$
declare
  operation_count integer;
  position_quantity numeric;
begin
  select count(*), sum(quantity)
    into operation_count, position_quantity
    from public.investment_operations
   where owner_id = auth.uid()
     and asset_id = current_setting('investment_test.asset_id')::uuid
     and account_id = current_setting('investment_test.account_id')::uuid;

  if operation_count <> 2 or position_quantity <> 8 then
    raise exception 'Compra/venda não produziram a quantidade esperada.';
  end if;

  if not exists (
    select 1
      from public.investment_operations
     where id = current_setting('investment_test.buy_id')::uuid
       and fees = 2.50
       and notes is null
  ) then
    raise exception 'Compra com taxa e observação vazia não foi preservada.';
  end if;

  if not exists (
    select 1
      from public.investment_operations
     where id = current_setting('investment_test.sale_id')::uuid
       and fees = 1.25
       and notes = 'Venda parcial de teste'
  ) then
    raise exception 'Venda com taxa e observação preenchida não foi preservada.';
  end if;
end;
$$;

update public.investment_operations
   set quantity = 12,
       unit_price = 11,
       fees = 3.75,
       notes = 'Compra editada',
       updated_at = created_at - interval '1 day'
 where id = current_setting('investment_test.buy_id')::uuid
   and owner_id = auth.uid();

do $$
begin
  if not exists (
    select 1
      from public.investment_operations
     where id = current_setting('investment_test.buy_id')::uuid
       and quantity = 12
       and unit_price = 11
       and fees = 3.75
       and notes = 'Compra editada'
       and updated_at >= created_at
  ) then
    raise exception 'A edição ou o trigger updated_at não funcionou.';
  end if;
end;
$$;

do $$
declare
  currency_mismatch_rejected boolean := false;
begin
  begin
    insert into public.investment_operations (
      owner_id,
      asset_id,
      account_id,
      operation_type,
      operation_date,
      quantity,
      unit_price,
      fees
    )
    values (
      auth.uid(),
      current_setting('investment_test.usd_asset_id')::uuid,
      current_setting('investment_test.account_id')::uuid,
      'Compra',
      date '2026-08-03',
      1,
      100,
      0
    );
  exception
    when check_violation then
      currency_mismatch_rejected := true;
  end;

  if not currency_mismatch_rejected then
    raise exception 'Uma conta BRL aceitou operação de ativo USD.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);

do $$
declare
  visible_rows integer;
  visible_valuations integer;
  visible_rates integer;
  cross_owner_insert_rejected boolean := false;
begin
  select count(*)
    into visible_rows
    from public.investment_operations
   where owner_id = current_setting('investment_test.owner_id')::uuid;

  if visible_rows <> 0 then
    raise exception 'RLS permitiu leitura de operações de outro usuário.';
  end if;

  select count(*)
    into visible_valuations
    from public.investment_monthly_valuations
   where owner_id = current_setting('investment_test.owner_id')::uuid;

  if visible_valuations <> 0 then
    raise exception 'RLS permitiu leitura de valorizações de outro usuário.';
  end if;

  select count(*) into visible_rates
    from public.investment_exchange_rates
   where owner_id = current_setting('investment_test.owner_id')::uuid;
  if visible_rates <> 0 then
    raise exception 'RLS permitiu leitura de cotações de outro usuário.';
  end if;

  begin
    insert into public.investment_operations (
      owner_id,
      asset_id,
      account_id,
      operation_type,
      operation_date,
      quantity,
      unit_price,
      fees
    )
    values (
      current_setting('investment_test.owner_id')::uuid,
      current_setting('investment_test.asset_id')::uuid,
      current_setting('investment_test.account_id')::uuid,
      'Compra',
      date '2026-08-04',
      1,
      10,
      0
    );
  exception
    when insufficient_privilege then
      cross_owner_insert_rejected := true;
  end;

  if not cross_owner_insert_rejected then
    raise exception 'RLS permitiu INSERT com owner_id diferente de auth.uid().';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  current_setting('investment_test.owner_id'),
  true
);

delete from public.investment_operations
 where id = current_setting('investment_test.sale_id')::uuid
   and owner_id = auth.uid()
   and event_group_id is null;

do $$
declare
  remaining_quantity numeric;
begin
  select sum(quantity)
    into remaining_quantity
    from public.investment_operations
   where owner_id = auth.uid()
     and asset_id = current_setting('investment_test.asset_id')::uuid
     and account_id = current_setting('investment_test.account_id')::uuid;

  if remaining_quantity <> 12 then
    raise exception 'A exclusão não atualizou a quantidade da posição.';
  end if;

  if not exists (
    select 1
      from public.investment_monthly_valuations
     where id = current_setting('investment_test.valuation_id')::uuid
       and market_value = 14.50
       and total_market_value = 145.00
       and quantity_snapshot = 10
       and average_price_snapshot = 10.25
       and currency = 'BRL'
       and consolidation_currency = 'BRL'
       and exchange_rate = 1
  ) then
    raise exception 'A valorização necessária aos cards não foi carregada.';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from public.investment_exchange_rates
     where id = current_setting('investment_test.rate_id')::uuid
       and owner_id = auth.uid()
       and rate = 5.43
       and source = 'MANUAL'
       and updated_by = auth.uid()
  ) then
    raise exception 'A cotação manual e sua autoria não foram preservadas.';
  end if;
end;
$$;

reset role;
rollback;

select 'investments module flow passed; transaction rolled back' as result;
