-- Finance Smart - Fase 1: transferências vinculadas.
-- Preparada para revisão; NÃO aplicar automaticamente.
--
-- Uma transferência passa a ser uma operação lógica: duas linhas em
-- public.transactions (saída "Pago" e entrada "Recebido") com o mesmo
-- transfer_group_id, criadas, alteradas e excluídas somente pelas RPCs
-- create_transfer, update_transfer e delete_transfer.
--
-- Sem backfill: transferências históricas permanecem com transfer_group_id
-- NULL (legadas) e continuam no fluxo antigo. Nenhuma linha existente é
-- alterada por esta migration.
--
-- Preparação para a Fase 2 (câmbio): o schema identifica as pontas pela
-- estrutura (status + conta), nunca por valores. Nada aqui exige que a saída
-- e a entrada tenham o mesmo valor, data ou moeda; essas regras da Fase 1
-- ficam apenas nas RPCs.

alter table public.transactions
  add column transfer_group_id uuid;

comment on column public.transactions.transfer_group_id is
  'Operação lógica de transferência vinculada (Fase 1). NULL = lançamento comum ou transferência legada. Alterado somente pelas RPCs create_transfer, update_transfer e delete_transfer.';

-- Pontas estruturais: saída = Pago na conta de origem; entrada = Recebido na
-- conta de destino. Linhas legadas (NULL) não são afetadas.
alter table public.transactions
  add constraint transactions_transfer_group_check check (
    transfer_group_id is null
    or (
      type = 'Transferência'
      and mode = 'unico'
      and category_id is null
      and bankroll_integration_group_id is null
      and investment_integration_group_id is null
      and origin_account_id is not null
      and destination_account_id is not null
      and origin_account_id <> destination_account_id
      and (
        status = 'Pago' and account_id = origin_account_id
        or
        status = 'Recebido' and account_id = destination_account_id
      )
    )
  );

-- No máximo uma saída e uma entrada por grupo. Não é UNIQUE simples em
-- transfer_group_id: as duas pontas compartilham o mesmo valor.
create unique index transactions_transfer_group_leg_key
  on public.transactions (transfer_group_id, status)
  where transfer_group_id is not null;

-- Consulta das pontas pelo dono, usada pelo frontend e pelas RPCs.
create index transactions_owner_transfer_group_idx
  on public.transactions (owner_id, transfer_group_id)
  where transfer_group_id is not null;

create function public.lock_transfer_group(p_transfer_group_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_transfer_group_id is null then
    raise exception 'Informe a transferência.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'finance:transfer-group:' || p_transfer_group_id::text,
      0
    )
  );
end;
$$;

-- Regras de conta da Fase 1: contas financeiras do usuário, diferentes,
-- ativas (exceto as já presentes na transferência editada) e na mesma moeda.
-- A moeda vem sempre do banco; duas contas legadas sem moeda mantêm o
-- comportamento anterior (mesma regra de checkTransferCurrencies).
create function public.resolve_transfer_accounts(
  p_owner_id uuid,
  p_origin_account_id uuid,
  p_destination_account_id uuid,
  p_allowed_inactive_account_ids uuid[]
)
returns table (origin_name text, destination_name text)
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

  if origin_account.currency is null and destination_account.currency is null then
    null;
  elsif origin_account.currency is null or destination_account.currency is null then
    raise exception 'Confirme a moeda da conta em Contas/Cartões antes de realizar a transferência.'
      using errcode = '22023';
  elsif origin_account.currency <> destination_account.currency then
    raise exception 'Transferências entre moedas diferentes ainda não estão disponíveis. Utilize contas da mesma moeda.'
      using errcode = '22023';
  end if;

  return query select origin_account.name, destination_account.name;
end;
$$;

-- Bloqueia escrita direta em pontas vinculadas. As RPCs oficiais habilitam a
-- escrita somente dentro da própria transação (set_config local), no mesmo
-- padrão do módulo de Investimentos. Linhas com transfer_group_id NULL
-- (lançamentos comuns e transferências legadas) não são afetadas.
create function public.transfer_group_mutation_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if (
    (tg_op = 'INSERT' and new.transfer_group_id is not null)
    or (tg_op = 'UPDATE' and (old.transfer_group_id is not null or new.transfer_group_id is not null))
    or (tg_op = 'DELETE' and old.transfer_group_id is not null)
  ) and pg_catalog.current_setting('app.transfer_group_mutation', true) is distinct from 'on' then
    raise exception 'Esta transferência é vinculada e deve ser alterada ou excluída pelo fluxo de transferências.'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Invariante verificado no COMMIT: um grupo tem zero ou exatamente duas
-- pontas (uma saída e uma entrada) do mesmo dono e com as mesmas contas de
-- origem/destino. Não compara valor, data nem moeda (Fase 2).
create function public.assert_transfer_group_consistent(p_transfer_group_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  leg_count integer;
  owner_count integer;
  valid_count integer;
begin
  select count(*), count(distinct movement.owner_id)
    into leg_count, owner_count
    from public.transactions movement
   where movement.transfer_group_id = p_transfer_group_id;

  if leg_count = 0 then
    return;
  end if;
  if leg_count <> 2 or owner_count <> 1 then
    raise exception 'Uma transferência vinculada deve possuir exatamente uma saída e uma entrada.'
      using errcode = '23514';
  end if;

  select count(*) into valid_count
    from public.transactions outgoing
    join public.transactions incoming
      on incoming.transfer_group_id = outgoing.transfer_group_id
     and incoming.owner_id = outgoing.owner_id
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
end;
$$;

create function public.assert_transfer_group_invariant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  old_group_id uuid;
  new_group_id uuid;
begin
  if tg_op <> 'INSERT' then
    old_group_id := old.transfer_group_id;
  end if;
  if tg_op <> 'DELETE' then
    new_group_id := new.transfer_group_id;
  end if;

  if old_group_id is not null then
    perform public.assert_transfer_group_consistent(old_group_id);
  end if;
  if new_group_id is not null and new_group_id is distinct from old_group_id then
    perform public.assert_transfer_group_consistent(new_group_id);
  end if;
  return null;
end;
$$;

create trigger transactions_transfer_group_mutation_guard
  before insert or update or delete on public.transactions
  for each row execute function public.transfer_group_mutation_guard();

create constraint trigger transactions_transfer_group_invariant
  after insert or update or delete on public.transactions
  deferrable initially deferred
  for each row execute function public.assert_transfer_group_invariant();

-- Cria a transferência vinculada. p_idempotency_key é gerada pelo cliente uma
-- vez por formulário e se torna o transfer_group_id das duas pontas (mesmo
-- padrão das integrações do Bankroll): um duplo envio com a mesma chave
-- devolve a transferência já criada em vez de duplicá-la.
create function public.create_transfer(
  p_origin_account_id uuid,
  p_destination_account_id uuid,
  p_date date,
  p_competence_id uuid,
  p_amount numeric,
  p_description text,
  p_idempotency_key uuid
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
  existing_count integer;
  existing_outgoing public.transactions;
  existing_incoming public.transactions;
  account_names record;
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
    if existing_count <> 2
       or existing_outgoing.id is null
       or existing_incoming.id is null
       or existing_outgoing.origin_account_id <> p_origin_account_id
       or existing_outgoing.destination_account_id <> p_destination_account_id
       or existing_outgoing.due_date <> p_date
       or existing_outgoing.competence_id <> p_competence_id
       or existing_outgoing.value <> p_amount
       or existing_incoming.value <> p_amount
       or (normalized_description is not null
           and existing_outgoing.description <> normalized_description) then
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

  select * into account_names
    from public.resolve_transfer_accounts(
      authenticated_owner_id, p_origin_account_id, p_destination_account_id, array[]::uuid[]
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
    coalesce(normalized_description, 'Transferência para ' || account_names.destination_name),
    p_date, 'Transferência', 'unico', p_amount, 'Pago', null,
    p_origin_account_id, p_destination_account_id, new_group_id
  ) returning id into created_outgoing_id;

  insert into public.transactions (
    owner_id, competence_id, account_id, description, due_date, type, mode,
    value, status, category_id, origin_account_id, destination_account_id,
    transfer_group_id
  ) values (
    authenticated_owner_id, p_competence_id, p_destination_account_id,
    coalesce(normalized_description, 'Transferência recebida de ' || account_names.origin_name),
    p_date, 'Transferência', 'unico', p_amount, 'Recebido', null,
    p_origin_account_id, p_destination_account_id, new_group_id
  ) returning id into created_incoming_id;

  perform pg_catalog.set_config('app.transfer_group_mutation', 'off', true);

  return query select new_group_id, created_outgoing_id, created_incoming_id;
end;
$$;

-- Atualiza as duas pontas como uma operação. As pontas são localizadas pela
-- estrutura (Pago na conta de origem; Recebido na conta de destino), nunca
-- pela ordem do SELECT. Tipo e status são fixos: não vira Receita/Despesa.
create function public.update_transfer(
  p_transfer_group_id uuid,
  p_origin_account_id uuid,
  p_destination_account_id uuid,
  p_date date,
  p_competence_id uuid,
  p_amount numeric,
  p_description text
)
returns table (group_id uuid, outgoing_id uuid, incoming_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  normalized_description text := nullif(pg_catalog.btrim(p_description), '');
  leg_count integer;
  outgoing_row public.transactions;
  incoming_row public.transactions;
  account_names record;
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

  select * into account_names
    from public.resolve_transfer_accounts(
      authenticated_owner_id, p_origin_account_id, p_destination_account_id,
      array[outgoing_row.account_id, incoming_row.account_id]
    );

  -- Nem a situação atual nem a nova podem estar em período fechado.
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
         description = coalesce(normalized_description, 'Transferência para ' || account_names.destination_name),
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
         description = coalesce(normalized_description, 'Transferência recebida de ' || account_names.origin_name),
         due_date = p_date,
         value = p_amount,
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

  perform pg_catalog.set_config('app.transfer_group_mutation', 'off', true);

  return query select p_transfer_group_id, outgoing_row.id, incoming_row.id;
end;
$$;

-- Exclui as duas pontas na mesma transação. Vínculos de conciliação de fatura
-- são removidos como em deleteTransaction; referências sem CASCADE
-- (fechamentos, pagamento de fatura, conciliação legada) bloqueiam a exclusão
-- com mensagem clara em vez de remover dados de outros módulos.
create function public.delete_transfer(p_transfer_group_id uuid)
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

alter function public.lock_transfer_group(uuid) owner to postgres;
alter function public.resolve_transfer_accounts(uuid, uuid, uuid, uuid[]) owner to postgres;
alter function public.transfer_group_mutation_guard() owner to postgres;
alter function public.assert_transfer_group_consistent(uuid) owner to postgres;
alter function public.assert_transfer_group_invariant() owner to postgres;
alter function public.create_transfer(uuid, uuid, date, uuid, numeric, text, uuid) owner to postgres;
alter function public.update_transfer(uuid, uuid, uuid, date, uuid, numeric, text) owner to postgres;
alter function public.delete_transfer(uuid) owner to postgres;

revoke all on function public.lock_transfer_group(uuid) from public, anon, authenticated, service_role;
revoke all on function public.resolve_transfer_accounts(uuid, uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.transfer_group_mutation_guard() from public, anon, authenticated, service_role;
revoke all on function public.assert_transfer_group_consistent(uuid) from public, anon, authenticated, service_role;
revoke all on function public.assert_transfer_group_invariant() from public, anon, authenticated, service_role;
revoke all on function public.create_transfer(uuid, uuid, date, uuid, numeric, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.update_transfer(uuid, uuid, uuid, date, uuid, numeric, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_transfer(uuid) from public, anon, authenticated, service_role;

grant execute on function public.create_transfer(uuid, uuid, date, uuid, numeric, text, uuid) to authenticated;
grant execute on function public.update_transfer(uuid, uuid, uuid, date, uuid, numeric, text) to authenticated;
grant execute on function public.delete_transfer(uuid) to authenticated;
