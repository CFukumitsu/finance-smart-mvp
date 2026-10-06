-- Finance Smart - Fase 2: transferências vinculadas entre moedas diferentes.
-- Preparada para revisão; NÃO aplicar automaticamente.
-- Depende de 202610060001_linked_transfers_phase_1.sql (não alterada).
--
-- Uma conversão continua sendo UMA transferência (mesmo transfer_group_id):
--   saída (Pago)     value = total efetivamente debitado, moeda da origem;
--   entrada (Recebido) value = total efetivamente recebido, moeda do destino.
-- currency_conversions guarda só os metadados (provedor, taxa informativa e
-- cotação informada). Valores, moedas e custo efetivo NÃO são duplicados:
-- vêm das pontas/contas ou são derivados. A taxa nunca gera lançamento nem é
-- debitada de novo. Mesma moeda continua exatamente como na Fase 1.

create table public.currency_conversion_providers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint currency_conversion_providers_name_check
    check (name = pg_catalog.btrim(name) and name <> '' and char_length(name) <= 80),
  constraint currency_conversion_providers_owner_id_id_key unique (owner_id, id)
);

-- Sem duplicidade por usuário: "Wise", "wise" e " Wise" são o mesmo provedor.
create unique index currency_conversion_providers_owner_name_key
  on public.currency_conversion_providers (owner_id, lower(btrim(name)));

create trigger set_currency_conversion_providers_updated_at
  before update on public.currency_conversion_providers
  for each row execute function public.set_updated_at();

alter table public.currency_conversion_providers enable row level security;

create policy currency_conversion_providers_select_own
  on public.currency_conversion_providers for select to authenticated
  using (owner_id = auth.uid());
create policy currency_conversion_providers_insert_own
  on public.currency_conversion_providers for insert to authenticated
  with check (owner_id = auth.uid());
create policy currency_conversion_providers_update_own
  on public.currency_conversion_providers for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy currency_conversion_providers_delete_own
  on public.currency_conversion_providers for delete to authenticated
  using (owner_id = auth.uid());

create table public.currency_conversions (
  transfer_group_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete restrict,
  provider_id uuid not null,
  fee_amount numeric(12,2),
  fee_currency text,
  quoted_rate numeric(24,12),
  quoted_rate_base_currency text,
  quoted_rate_quote_currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint currency_conversions_provider_owner_fk
    foreign key (owner_id, provider_id)
    references public.currency_conversion_providers(owner_id, id)
    on delete restrict,
  -- NULL = taxa desconhecida; 0 = sem taxa; > 0 = taxa conhecida.
  constraint currency_conversions_fee_check check (
    (fee_amount is null and fee_currency is null)
    or (
      fee_amount is not null and fee_amount >= 0
      and fee_currency is not null and fee_currency ~ '^[A-Z]{3}$'
    )
  ),
  -- 1 unidade da base = quoted_rate unidades da quote (cotação INFORMADA).
  constraint currency_conversions_quote_check check (
    (quoted_rate is null and quoted_rate_base_currency is null and quoted_rate_quote_currency is null)
    or (
      quoted_rate is not null and quoted_rate > 0
      and quoted_rate_base_currency is not null and quoted_rate_base_currency ~ '^[A-Z]{3}$'
      and quoted_rate_quote_currency is not null and quoted_rate_quote_currency ~ '^[A-Z]{3}$'
      and quoted_rate_base_currency <> quoted_rate_quote_currency
    )
  )
);

comment on table public.currency_conversions is
  'Metadados da conversão de uma transferência vinculada entre moedas diferentes (1:1 com transfer_group_id). Valores e moedas vêm das pontas; custo efetivo é derivado. Escrita somente pelas RPCs de transferência.';

create index currency_conversions_owner_provider_idx
  on public.currency_conversions (owner_id, provider_id);

create trigger set_currency_conversions_updated_at
  before update on public.currency_conversions
  for each row execute function public.set_updated_at();

-- Mesmo guard da Fase 1: escrita só com a flag local ligada pelas RPCs.
create trigger currency_conversions_transfer_group_mutation_guard
  before insert or update or delete on public.currency_conversions
  for each row execute function public.transfer_group_mutation_guard();

alter table public.currency_conversions enable row level security;

create policy currency_conversions_select_own
  on public.currency_conversions for select to authenticated
  using (owner_id = auth.uid());

-- Invariante do grupo estendido. Mantém as regras e mensagens da Fase 1 e
-- acrescenta a conversão:
--   moedas confirmadas e diferentes -> exatamente 1 conversão coerente;
--   demais casos (mesma moeda ou moeda não confirmada) -> nenhuma conversão;
--   conversão sem pontas -> inválida.
-- Continua sem comparar valores: saída e entrada podem ter valores diferentes.
create or replace function public.assert_transfer_group_consistent(p_transfer_group_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  leg_count integer;
  owner_count integer;
  valid_count integer;
  conversion_row public.currency_conversions;
  legs_owner_id uuid;
  origin_currency text;
  destination_currency text;
begin
  select count(*), count(distinct movement.owner_id), min(movement.owner_id::text)::uuid
    into leg_count, owner_count, legs_owner_id
    from public.transactions movement
   where movement.transfer_group_id = p_transfer_group_id;

  select * into conversion_row from public.currency_conversions conversion
   where conversion.transfer_group_id = p_transfer_group_id;

  if leg_count = 0 then
    if conversion_row.transfer_group_id is not null then
      raise exception 'A conversão não possui a transferência vinculada correspondente.'
        using errcode = '23514';
    end if;
    return;
  end if;
  if leg_count <> 2 or owner_count <> 1 then
    raise exception 'Uma transferência vinculada deve possuir exatamente uma saída e uma entrada.'
      using errcode = '23514';
  end if;

  select count(*), min(origin_account.currency), min(destination_account.currency)
    into valid_count, origin_currency, destination_currency
    from public.transactions outgoing
    join public.transactions incoming
      on incoming.transfer_group_id = outgoing.transfer_group_id
     and incoming.owner_id = outgoing.owner_id
    left join public.accounts origin_account
      on origin_account.id = outgoing.account_id and origin_account.owner_id = outgoing.owner_id
    left join public.accounts destination_account
      on destination_account.id = incoming.account_id and destination_account.owner_id = incoming.owner_id
   where outgoing.transfer_group_id = p_transfer_group_id
     and outgoing.status = 'Pago'
     and outgoing.account_id = outgoing.origin_account_id
     and incoming.status = 'Recebido'
     and incoming.account_id = incoming.destination_account_id
     and incoming.origin_account_id = outgoing.origin_account_id
     and incoming.destination_account_id = outgoing.destination_account_id;

  if valid_count <> 1 then
    raise exception 'As pontas da transferência vinculada estão inconsistentes.'
      using errcode = '23514';
  end if;

  if origin_currency is not null
     and destination_currency is not null
     and origin_currency <> destination_currency then
    if conversion_row.transfer_group_id is null then
      raise exception 'Transferência entre moedas diferentes sem dados de conversão.'
        using errcode = '23514';
    end if;
    if conversion_row.owner_id <> legs_owner_id
       or (conversion_row.fee_currency is not null
           and conversion_row.fee_currency not in (origin_currency, destination_currency))
       or (conversion_row.quoted_rate is not null
           and not (
             conversion_row.quoted_rate_base_currency in (origin_currency, destination_currency)
             and conversion_row.quoted_rate_quote_currency in (origin_currency, destination_currency)
           )) then
      raise exception 'Os dados de conversão não correspondem às moedas da transferência.'
        using errcode = '23514';
    end if;
  elsif conversion_row.transfer_group_id is not null then
    raise exception 'Transferência da mesma moeda não pode ter dados de conversão.'
      using errcode = '23514';
  end if;
end;
$$;

-- assert_transfer_group_invariant (Fase 1) lê old/new.transfer_group_id e
-- serve também para currency_conversions.
create constraint trigger currency_conversions_transfer_group_invariant
  after insert or update or delete on public.currency_conversions
  deferrable initially deferred
  for each row execute function public.assert_transfer_group_invariant();

-- Risco R1: duas contas legadas sem moeda podem ter transferência vinculada
-- (regra NULL + NULL da Fase 0/1). Confirmar NULL -> código continua
-- permitido, exceto quando deixaria um grupo vinculado entre moedas
-- confirmadas diferentes sem conversão. Moeda ainda não confirmada na outra
-- ponta não é comparável e não bloqueia.
create function public.protect_linked_transfer_currency_confirmation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.currency is not null or new.currency is null then
    return new;
  end if;

  if exists (
    select 1
      from public.transactions movement
      join public.transactions counterpart
        on counterpart.transfer_group_id = movement.transfer_group_id
       and counterpart.owner_id = movement.owner_id
       and counterpart.id <> movement.id
      join public.accounts counterpart_account
        on counterpart_account.id = counterpart.account_id
       and counterpart_account.owner_id = counterpart.owner_id
     where movement.owner_id = old.owner_id
       and movement.account_id = old.id
       and movement.transfer_group_id is not null
       and counterpart.account_id <> old.id
       and counterpart_account.currency is not null
       and counterpart_account.currency <> new.currency
       and not exists (
         select 1 from public.currency_conversions conversion
          where conversion.transfer_group_id = movement.transfer_group_id
       )
  ) then
    raise exception 'Esta conta possui transferência vinculada com uma conta em outra moeda. Confirme a mesma moeda da outra conta.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger accounts_currency_20_linked_transfer_guard
  before update of currency on public.accounts
  for each row execute function public.protect_linked_transfer_currency_confirmation();

-- Regras de contas da Fase 2: as mesmas da Fase 1, mas moedas confirmadas
-- diferentes passam a ser permitidas (conversão). Devolve as moedas para a
-- RPC decidir entre mesma moeda e conversão.
drop function public.create_transfer(uuid, uuid, date, uuid, numeric, text, uuid);
drop function public.update_transfer(uuid, uuid, uuid, date, uuid, numeric, text);
drop function public.resolve_transfer_accounts(uuid, uuid, uuid, uuid[]);

create function public.resolve_transfer_accounts(
  p_owner_id uuid,
  p_origin_account_id uuid,
  p_destination_account_id uuid,
  p_allowed_inactive_account_ids uuid[]
)
returns table (
  origin_name text,
  destination_name text,
  origin_currency text,
  destination_currency text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  origin_account public.accounts;
  destination_account public.accounts;
begin
  if p_origin_account_id is null or p_destination_account_id is null then
    raise exception 'Informe as contas de origem e destino.' using errcode = '22023';
  end if;
  if p_origin_account_id = p_destination_account_id then
    raise exception 'A conta de origem deve ser diferente da conta de destino.' using errcode = '22023';
  end if;

  perform 1
    from public.accounts account_row
   where account_row.owner_id = p_owner_id
     and account_row.id in (p_origin_account_id, p_destination_account_id)
   order by account_row.id
   for update;

  select * into origin_account from public.accounts account_row
   where account_row.id = p_origin_account_id and account_row.owner_id = p_owner_id;
  select * into destination_account from public.accounts account_row
   where account_row.id = p_destination_account_id and account_row.owner_id = p_owner_id;

  if origin_account.id is null or destination_account.id is null then
    raise exception 'Conta de origem ou destino não encontrada.' using errcode = '42501';
  end if;
  if origin_account.type <> 'Conta' or destination_account.type <> 'Conta' then
    raise exception 'Transferências só podem movimentar contas, não cartões.' using errcode = '22023';
  end if;
  if origin_account.show_on_investments_dashboard
     or destination_account.show_on_investments_dashboard
     or origin_account.investment_account_kind is not null
     or destination_account.investment_account_kind is not null then
    raise exception 'Contas de investimento devem ser movimentadas exclusivamente pelo módulo Investimentos.'
      using errcode = '22023';
  end if;
  if (not origin_account.active
      and not origin_account.id = any(coalesce(p_allowed_inactive_account_ids, array[]::uuid[])))
     or (not destination_account.active
      and not destination_account.id = any(coalesce(p_allowed_inactive_account_ids, array[]::uuid[]))) then
    raise exception 'A conta de origem ou destino está inativa.' using errcode = '22023';
  end if;

  -- Duas contas legadas sem moeda mantêm a regra anterior; misturar conta
  -- sem moeda com conta confirmada continua exigindo confirmação.
  if (origin_account.currency is null) <> (destination_account.currency is null) then
    raise exception 'Confirme a moeda da conta em Contas/Cartões antes de realizar a transferência.'
      using errcode = '22023';
  end if;

  return query select origin_account.name, destination_account.name,
    origin_account.currency, destination_account.currency;
end;
$$;

-- Valida os dados da operação conforme as moedas das contas e devolve o
-- valor recebido efetivo. Mesma moeda: recebido = debitado, sem conversão.
-- Moedas diferentes: valor recebido e provedor obrigatórios; taxa e cotação
-- opcionais, sempre nas moedas da operação.
create function public.validate_transfer_conversion(
  p_owner_id uuid,
  p_origin_currency text,
  p_destination_currency text,
  p_amount numeric,
  p_destination_amount numeric,
  p_provider_id uuid,
  p_fee_amount numeric,
  p_fee_currency text,
  p_quoted_rate numeric,
  p_quoted_rate_base_currency text,
  p_quoted_rate_quote_currency text,
  p_allowed_inactive_provider_id uuid
)
returns table (is_conversion boolean, destination_amount numeric)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  provider_row public.currency_conversion_providers;
begin
  if p_origin_currency is null
     or p_destination_currency is null
     or p_origin_currency = p_destination_currency then
    if p_destination_amount is not null and p_destination_amount <> p_amount then
      raise exception 'Em transferências da mesma moeda o valor recebido deve ser igual ao valor debitado.'
        using errcode = '22023';
    end if;
    if p_provider_id is not null or p_fee_amount is not null or p_fee_currency is not null
       or p_quoted_rate is not null or p_quoted_rate_base_currency is not null
       or p_quoted_rate_quote_currency is not null then
      raise exception 'Dados de conversão só se aplicam a transferências entre moedas diferentes.'
        using errcode = '22023';
    end if;
    return query select false, p_amount;
    return;
  end if;

  if p_destination_amount is null or p_provider_id is null then
    raise exception 'Transferências entre moedas diferentes exigem o valor recebido e o provedor da conversão.'
      using errcode = '22023';
  end if;
  if p_destination_amount <= 0 then
    raise exception 'O valor recebido deve ser maior que zero.' using errcode = '22023';
  end if;

  select * into provider_row from public.currency_conversion_providers provider
   where provider.id = p_provider_id and provider.owner_id = p_owner_id;
  if provider_row.id is null then
    raise exception 'Provedor de conversão não encontrado.' using errcode = '42501';
  end if;
  if not provider_row.active and provider_row.id is distinct from p_allowed_inactive_provider_id then
    raise exception 'O provedor de conversão está inativo.' using errcode = '22023';
  end if;

  if (p_fee_amount is null) <> (p_fee_currency is null) then
    raise exception 'Informe o valor e a moeda da taxa, ou deixe os dois vazios.' using errcode = '22023';
  end if;
  if p_fee_amount is not null and p_fee_amount < 0 then
    raise exception 'A taxa não pode ser negativa.' using errcode = '22023';
  end if;
  if p_fee_currency is not null and p_fee_currency not in (p_origin_currency, p_destination_currency) then
    raise exception 'A moeda da taxa deve ser a moeda de origem ou a de destino.' using errcode = '22023';
  end if;

  if (p_quoted_rate is null) <> (p_quoted_rate_base_currency is null)
     or (p_quoted_rate is null) <> (p_quoted_rate_quote_currency is null) then
    raise exception 'Informe a cotação completa (valor e direção) ou deixe-a vazia.' using errcode = '22023';
  end if;
  if p_quoted_rate is not null then
    if p_quoted_rate <= 0 then
      raise exception 'A cotação informada deve ser maior que zero.' using errcode = '22023';
    end if;
    if p_quoted_rate_base_currency = p_quoted_rate_quote_currency
       or p_quoted_rate_base_currency not in (p_origin_currency, p_destination_currency)
       or p_quoted_rate_quote_currency not in (p_origin_currency, p_destination_currency) then
      raise exception 'As moedas da cotação devem ser as moedas de origem e de destino.' using errcode = '22023';
    end if;
  end if;

  return query select true, p_destination_amount;
end;
$$;

-- create_transfer: assinatura nova (a anterior foi removida acima para não
-- haver sobrecarga ambígua no PostgREST). Os 7 primeiros parâmetros são os
-- mesmos da Fase 1; p_amount continua sendo o valor DEBITADO.
create function public.create_transfer(
  p_origin_account_id uuid,
  p_destination_account_id uuid,
  p_date date,
  p_competence_id uuid,
  p_amount numeric,
  p_description text,
  p_idempotency_key uuid,
  p_destination_amount numeric default null,
  p_provider_id uuid default null,
  p_fee_amount numeric default null,
  p_fee_currency text default null,
  p_quoted_rate numeric default null,
  p_quoted_rate_base_currency text default null,
  p_quoted_rate_quote_currency text default null
)
returns table (group_id uuid, outgoing_id uuid, incoming_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  new_group_id uuid := p_idempotency_key;
  normalized_description text := nullif(pg_catalog.btrim(p_description), '');
  fee_currency_code text := nullif(upper(pg_catalog.btrim(p_fee_currency)), '');
  quote_base_code text := nullif(upper(pg_catalog.btrim(p_quoted_rate_base_currency)), '');
  quote_quote_code text := nullif(upper(pg_catalog.btrim(p_quoted_rate_quote_currency)), '');
  existing_count integer;
  existing_outgoing public.transactions;
  existing_incoming public.transactions;
  existing_conversion public.currency_conversions;
  account_info record;
  conversion_info record;
  created_outgoing_id uuid;
  created_incoming_id uuid;
begin
  if authenticated_owner_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Informe a chave idempotente da transferência.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor deve ser maior que zero.' using errcode = '22023';
  end if;
  if p_date is null then
    raise exception 'Informe a data da transferência.' using errcode = '22007';
  end if;
  if p_competence_id is null then
    raise exception 'Informe a competência da transferência.' using errcode = '22023';
  end if;

  -- Ordem global: grupo; escopo; contas; lançamentos.
  perform public.lock_transfer_group(new_group_id);

  select count(*) into existing_count
    from public.transactions movement
   where movement.transfer_group_id = new_group_id;

  if existing_count > 0 then
    select * into existing_outgoing from public.transactions movement
     where movement.transfer_group_id = new_group_id
       and movement.owner_id = authenticated_owner_id
       and movement.status = 'Pago';
    select * into existing_incoming from public.transactions movement
     where movement.transfer_group_id = new_group_id
       and movement.owner_id = authenticated_owner_id
       and movement.status = 'Recebido';
    select * into existing_conversion from public.currency_conversions conversion
     where conversion.transfer_group_id = new_group_id
       and conversion.owner_id = authenticated_owner_id;
    if existing_count <> 2
       or existing_outgoing.id is null
       or existing_incoming.id is null
       or existing_outgoing.origin_account_id <> p_origin_account_id
       or existing_outgoing.destination_account_id <> p_destination_account_id
       or existing_outgoing.due_date <> p_date
       or existing_outgoing.competence_id <> p_competence_id
       or existing_outgoing.value <> round(p_amount, 2)
       or existing_incoming.value <> round(coalesce(p_destination_amount, p_amount), 2)
       or (normalized_description is not null
           and existing_outgoing.description <> normalized_description)
       or existing_conversion.provider_id is distinct from p_provider_id
       or existing_conversion.fee_amount is distinct from round(p_fee_amount, 2)
       or existing_conversion.fee_currency is distinct from fee_currency_code
       or existing_conversion.quoted_rate is distinct from round(p_quoted_rate, 12)
       or existing_conversion.quoted_rate_base_currency is distinct from quote_base_code
       or existing_conversion.quoted_rate_quote_currency is distinct from quote_quote_code then
      raise exception 'A chave de idempotência já foi usada com dados diferentes.'
        using errcode = '23505';
    end if;
    return query select new_group_id, existing_outgoing.id, existing_incoming.id;
    return;
  end if;

  perform public.lock_financial_scope(
    array[authenticated_owner_id::text || ':' || p_competence_id::text],
    array[
      authenticated_owner_id::text || ':' || p_competence_id::text || ':' || p_origin_account_id::text,
      authenticated_owner_id::text || ':' || p_competence_id::text || ':' || p_destination_account_id::text
    ]
  );

  select * into account_info
    from public.resolve_transfer_accounts(
      authenticated_owner_id, p_origin_account_id, p_destination_account_id, array[]::uuid[]
    );

  select * into conversion_info
    from public.validate_transfer_conversion(
      authenticated_owner_id, account_info.origin_currency, account_info.destination_currency,
      p_amount, p_destination_amount, p_provider_id, p_fee_amount, fee_currency_code,
      p_quoted_rate, quote_base_code, quote_quote_code, null
    );

  perform public.assert_financial_scope_open(authenticated_owner_id, p_competence_id, p_origin_account_id);
  perform public.assert_financial_scope_open(authenticated_owner_id, p_competence_id, p_destination_account_id);

  perform pg_catalog.set_config('app.transfer_group_mutation', 'on', true);

  insert into public.transactions (
    owner_id, competence_id, account_id, description, due_date, type, mode,
    value, status, category_id, origin_account_id, destination_account_id,
    transfer_group_id
  ) values (
    authenticated_owner_id, p_competence_id, p_origin_account_id,
    coalesce(normalized_description, 'Transferência para ' || account_info.destination_name),
    p_date, 'Transferência', 'unico', p_amount, 'Pago', null,
    p_origin_account_id, p_destination_account_id, new_group_id
  ) returning id into created_outgoing_id;

  insert into public.transactions (
    owner_id, competence_id, account_id, description, due_date, type, mode,
    value, status, category_id, origin_account_id, destination_account_id,
    transfer_group_id
  ) values (
    authenticated_owner_id, p_competence_id, p_destination_account_id,
    coalesce(normalized_description, 'Transferência recebida de ' || account_info.origin_name),
    p_date, 'Transferência', 'unico', conversion_info.destination_amount, 'Recebido', null,
    p_origin_account_id, p_destination_account_id, new_group_id
  ) returning id into created_incoming_id;

  if conversion_info.is_conversion then
    insert into public.currency_conversions (
      transfer_group_id, owner_id, provider_id, fee_amount, fee_currency,
      quoted_rate, quoted_rate_base_currency, quoted_rate_quote_currency
    ) values (
      new_group_id, authenticated_owner_id, p_provider_id, p_fee_amount, fee_currency_code,
      p_quoted_rate, quote_base_code, quote_quote_code
    );
  end if;

  perform pg_catalog.set_config('app.transfer_group_mutation', 'off', true);

  return query select new_group_id, created_outgoing_id, created_incoming_id;
end;
$$;

-- update_transfer: atualiza as duas pontas e a conversão como uma operação.
-- Suporta mesma->mesma, conversão->conversão, mesma->conversão (cria a
-- conversão) e conversão->mesma (remove a conversão; recebido = debitado).
create function public.update_transfer(
  p_transfer_group_id uuid,
  p_origin_account_id uuid,
  p_destination_account_id uuid,
  p_date date,
  p_competence_id uuid,
  p_amount numeric,
  p_description text,
  p_destination_amount numeric default null,
  p_provider_id uuid default null,
  p_fee_amount numeric default null,
  p_fee_currency text default null,
  p_quoted_rate numeric default null,
  p_quoted_rate_base_currency text default null,
  p_quoted_rate_quote_currency text default null
)
returns table (group_id uuid, outgoing_id uuid, incoming_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  normalized_description text := nullif(pg_catalog.btrim(p_description), '');
  fee_currency_code text := nullif(upper(pg_catalog.btrim(p_fee_currency)), '');
  quote_base_code text := nullif(upper(pg_catalog.btrim(p_quoted_rate_base_currency)), '');
  quote_quote_code text := nullif(upper(pg_catalog.btrim(p_quoted_rate_quote_currency)), '');
  leg_count integer;
  outgoing_row public.transactions;
  incoming_row public.transactions;
  current_conversion public.currency_conversions;
  account_info record;
  conversion_info record;
  affected integer;
begin
  if authenticated_owner_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor deve ser maior que zero.' using errcode = '22023';
  end if;
  if p_date is null then
    raise exception 'Informe a data da transferência.' using errcode = '22007';
  end if;
  if p_competence_id is null then
    raise exception 'Informe a competência da transferência.' using errcode = '22023';
  end if;

  perform public.lock_transfer_group(p_transfer_group_id);

  select count(*) into leg_count
    from public.transactions movement
   where movement.owner_id = authenticated_owner_id
     and movement.transfer_group_id = p_transfer_group_id;
  if leg_count = 0 then
    raise exception 'Transferência não encontrada.' using errcode = '42501';
  end if;

  select * into outgoing_row from public.transactions movement
   where movement.owner_id = authenticated_owner_id
     and movement.transfer_group_id = p_transfer_group_id
     and movement.status = 'Pago'
     and movement.account_id = movement.origin_account_id
   for update;
  select * into incoming_row from public.transactions movement
   where movement.owner_id = authenticated_owner_id
     and movement.transfer_group_id = p_transfer_group_id
     and movement.status = 'Recebido'
     and movement.account_id = movement.destination_account_id
   for update;

  if leg_count <> 2 or outgoing_row.id is null or incoming_row.id is null then
    raise exception 'As pontas da transferência vinculada estão inconsistentes.' using errcode = '55000';
  end if;

  select * into current_conversion from public.currency_conversions conversion
   where conversion.owner_id = authenticated_owner_id
     and conversion.transfer_group_id = p_transfer_group_id
   for update;

  perform public.lock_financial_scope(
    array[
      authenticated_owner_id::text || ':' || outgoing_row.competence_id::text,
      authenticated_owner_id::text || ':' || incoming_row.competence_id::text,
      authenticated_owner_id::text || ':' || p_competence_id::text
    ],
    array[
      authenticated_owner_id::text || ':' || outgoing_row.competence_id::text || ':' || outgoing_row.account_id::text,
      authenticated_owner_id::text || ':' || incoming_row.competence_id::text || ':' || incoming_row.account_id::text,
      authenticated_owner_id::text || ':' || p_competence_id::text || ':' || p_origin_account_id::text,
      authenticated_owner_id::text || ':' || p_competence_id::text || ':' || p_destination_account_id::text
    ]
  );

  select * into account_info
    from public.resolve_transfer_accounts(
      authenticated_owner_id, p_origin_account_id, p_destination_account_id,
      array[outgoing_row.account_id, incoming_row.account_id]
    );

  -- O provedor já usado nesta transferência pode estar inativo (permite
  -- corrigir valores sem trocá-lo); trocar PARA provedor inativo não.
  select * into conversion_info
    from public.validate_transfer_conversion(
      authenticated_owner_id, account_info.origin_currency, account_info.destination_currency,
      p_amount, p_destination_amount, p_provider_id, p_fee_amount, fee_currency_code,
      p_quoted_rate, quote_base_code, quote_quote_code, current_conversion.provider_id
    );

  perform public.assert_financial_scope_open(authenticated_owner_id, outgoing_row.competence_id, outgoing_row.account_id);
  perform public.assert_financial_scope_open(authenticated_owner_id, incoming_row.competence_id, incoming_row.account_id);
  perform public.assert_financial_scope_open(authenticated_owner_id, p_competence_id, p_origin_account_id);
  perform public.assert_financial_scope_open(authenticated_owner_id, p_competence_id, p_destination_account_id);

  perform pg_catalog.set_config('app.transfer_group_mutation', 'on', true);

  update public.transactions movement
     set account_id = p_origin_account_id,
         origin_account_id = p_origin_account_id,
         destination_account_id = p_destination_account_id,
         competence_id = p_competence_id,
         description = coalesce(normalized_description, 'Transferência para ' || account_info.destination_name),
         due_date = p_date,
         value = p_amount,
         type = 'Transferência',
         mode = 'unico',
         status = 'Pago',
         category_id = null
   where movement.id = outgoing_row.id
     and movement.owner_id = authenticated_owner_id;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'As pontas da transferência vinculada estão inconsistentes.' using errcode = '55000';
  end if;

  update public.transactions movement
     set account_id = p_destination_account_id,
         origin_account_id = p_origin_account_id,
         destination_account_id = p_destination_account_id,
         competence_id = p_competence_id,
         description = coalesce(normalized_description, 'Transferência recebida de ' || account_info.origin_name),
         due_date = p_date,
         value = conversion_info.destination_amount,
         type = 'Transferência',
         mode = 'unico',
         status = 'Recebido',
         category_id = null
   where movement.id = incoming_row.id
     and movement.owner_id = authenticated_owner_id;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'As pontas da transferência vinculada estão inconsistentes.' using errcode = '55000';
  end if;

  if conversion_info.is_conversion then
    insert into public.currency_conversions (
      transfer_group_id, owner_id, provider_id, fee_amount, fee_currency,
      quoted_rate, quoted_rate_base_currency, quoted_rate_quote_currency
    ) values (
      p_transfer_group_id, authenticated_owner_id, p_provider_id, p_fee_amount, fee_currency_code,
      p_quoted_rate, quote_base_code, quote_quote_code
    )
    on conflict (transfer_group_id) do update
       set provider_id = excluded.provider_id,
           fee_amount = excluded.fee_amount,
           fee_currency = excluded.fee_currency,
           quoted_rate = excluded.quoted_rate,
           quoted_rate_base_currency = excluded.quoted_rate_base_currency,
           quoted_rate_quote_currency = excluded.quoted_rate_quote_currency
     where currency_conversions.owner_id = authenticated_owner_id;
  else
    delete from public.currency_conversions conversion
     where conversion.owner_id = authenticated_owner_id
       and conversion.transfer_group_id = p_transfer_group_id;
  end if;

  perform pg_catalog.set_config('app.transfer_group_mutation', 'off', true);

  return query select p_transfer_group_id, outgoing_row.id, incoming_row.id;
end;
$$;

-- delete_transfer: mesmo comportamento da Fase 1, removendo também a
-- conversão do grupo na mesma transação.
create or replace function public.delete_transfer(p_transfer_group_id uuid)
returns table (group_id uuid, outgoing_id uuid, incoming_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  leg_count integer;
  outgoing_row public.transactions;
  incoming_row public.transactions;
  affected integer;
begin
  if authenticated_owner_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  perform public.lock_transfer_group(p_transfer_group_id);

  select count(*) into leg_count
    from public.transactions movement
   where movement.owner_id = authenticated_owner_id
     and movement.transfer_group_id = p_transfer_group_id;
  if leg_count = 0 then
    raise exception 'Transferência não encontrada.' using errcode = '42501';
  end if;

  select * into outgoing_row from public.transactions movement
   where movement.owner_id = authenticated_owner_id
     and movement.transfer_group_id = p_transfer_group_id
     and movement.status = 'Pago'
     and movement.account_id = movement.origin_account_id
   for update;
  select * into incoming_row from public.transactions movement
   where movement.owner_id = authenticated_owner_id
     and movement.transfer_group_id = p_transfer_group_id
     and movement.status = 'Recebido'
     and movement.account_id = movement.destination_account_id
   for update;

  if leg_count <> 2 or outgoing_row.id is null or incoming_row.id is null then
    raise exception 'As pontas da transferência vinculada estão inconsistentes.' using errcode = '55000';
  end if;

  perform public.lock_financial_scope(
    array[
      authenticated_owner_id::text || ':' || outgoing_row.competence_id::text,
      authenticated_owner_id::text || ':' || incoming_row.competence_id::text
    ],
    array[
      authenticated_owner_id::text || ':' || outgoing_row.competence_id::text || ':' || outgoing_row.account_id::text,
      authenticated_owner_id::text || ':' || incoming_row.competence_id::text || ':' || incoming_row.account_id::text
    ]
  );

  perform public.assert_financial_scope_open(authenticated_owner_id, outgoing_row.competence_id, outgoing_row.account_id);
  perform public.assert_financial_scope_open(authenticated_owner_id, incoming_row.competence_id, incoming_row.account_id);

  if exists (
       select 1 from public.account_closures closure
        where closure.generated_transaction_id in (outgoing_row.id, incoming_row.id)
     )
     or exists (
       select 1 from public.credit_card_statements statement
        where statement.payment_transaction_id in (outgoing_row.id, incoming_row.id)
     )
     or exists (
       select 1 from public.transaction_reconciliations reconciliation
        where reconciliation.transaction_id in (outgoing_row.id, incoming_row.id)
     ) then
    raise exception 'Esta transferência está vinculada a um fechamento ou conciliação e não pode ser excluída.'
      using errcode = '23503';
  end if;

  delete from public.credit_card_statement_item_transactions item_link
   where item_link.owner_id = authenticated_owner_id
     and item_link.transaction_id in (outgoing_row.id, incoming_row.id);

  perform pg_catalog.set_config('app.transfer_group_mutation', 'on', true);

  delete from public.currency_conversions conversion
   where conversion.owner_id = authenticated_owner_id
     and conversion.transfer_group_id = p_transfer_group_id;

  delete from public.transactions movement
   where movement.owner_id = authenticated_owner_id
     and movement.transfer_group_id = p_transfer_group_id
     and movement.id in (outgoing_row.id, incoming_row.id);
  get diagnostics affected = row_count;
  if affected <> 2 then
    raise exception 'As pontas da transferência vinculada estão inconsistentes.' using errcode = '55000';
  end if;

  perform pg_catalog.set_config('app.transfer_group_mutation', 'off', true);

  return query select p_transfer_group_id, outgoing_row.id, incoming_row.id;
end;
$$;

alter function public.assert_transfer_group_consistent(uuid) owner to postgres;
alter function public.protect_linked_transfer_currency_confirmation() owner to postgres;
alter function public.resolve_transfer_accounts(uuid, uuid, uuid, uuid[]) owner to postgres;
alter function public.validate_transfer_conversion(uuid, text, text, numeric, numeric, uuid, numeric, text, numeric, text, text, uuid) owner to postgres;
alter function public.create_transfer(uuid, uuid, date, uuid, numeric, text, uuid, numeric, uuid, numeric, text, numeric, text, text) owner to postgres;
alter function public.update_transfer(uuid, uuid, uuid, date, uuid, numeric, text, numeric, uuid, numeric, text, numeric, text, text) owner to postgres;
alter function public.delete_transfer(uuid) owner to postgres;

revoke all on function public.assert_transfer_group_consistent(uuid) from public, anon, authenticated, service_role;
revoke all on function public.protect_linked_transfer_currency_confirmation() from public, anon, authenticated, service_role;
revoke all on function public.resolve_transfer_accounts(uuid, uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.validate_transfer_conversion(uuid, text, text, numeric, numeric, uuid, numeric, text, numeric, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_transfer(uuid, uuid, date, uuid, numeric, text, uuid, numeric, uuid, numeric, text, numeric, text, text) from public, anon, authenticated, service_role;
revoke all on function public.update_transfer(uuid, uuid, uuid, date, uuid, numeric, text, numeric, uuid, numeric, text, numeric, text, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_transfer(uuid) from public, anon, authenticated, service_role;

grant execute on function public.create_transfer(uuid, uuid, date, uuid, numeric, text, uuid, numeric, uuid, numeric, text, numeric, text, text) to authenticated;
grant execute on function public.update_transfer(uuid, uuid, uuid, date, uuid, numeric, text, numeric, uuid, numeric, text, numeric, text, text) to authenticated;
grant execute on function public.delete_transfer(uuid) to authenticated;

revoke all on table public.currency_conversion_providers from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.currency_conversion_providers to authenticated, service_role;

revoke all on table public.currency_conversions from public, anon, authenticated, service_role;
grant select on table public.currency_conversions to authenticated, service_role;
