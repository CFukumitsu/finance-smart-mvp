create index if not exists transactions_owner_description_history_idx
  on public.transactions (owner_id, lower(btrim(description)), created_at desc, id desc);

-- FIN-01: query existing history before deduplication and limiting.
create or replace function public.search_transaction_descriptions(search_text text)
returns table(description text)
language sql stable security invoker set search_path = public
as $$
  with history as (
    select distinct on (lower(btrim(t.description)))
      btrim(t.description) as description, lower(btrim(t.description)) as normalized,
      t.created_at
    from public.transactions t
    where t.owner_id = auth.uid()
      and btrim(t.description) <> ''
      and strpos(lower(btrim(t.description)), lower(btrim(coalesce(search_text, '')))) > 0
    order by lower(btrim(t.description)), t.created_at desc, t.id desc
  )
  select h.description from history h
  order by (strpos(h.normalized, lower(btrim(coalesce(search_text, '')))) = 1) desc,
    h.created_at desc, h.description
  limit 10;
$$;

-- FIN-03: all writes roll back together if any step fails. RLS remains active.
create or replace function public.reconcile_transaction_with_value(
  p_statement_item_id uuid, p_transaction_id uuid,
  p_value numeric, p_expected_value numeric
)
returns setof public.transactions
language plpgsql security invoker set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_item public.credit_card_statement_items%rowtype;
  v_transaction public.transactions%rowtype;
begin
  if v_owner is null then raise exception 'Usuário não autenticado.'; end if;
  if p_value is null or p_value <= 0 or p_value > 9999999999.99
    or p_value <> round(p_value, 2) then
    raise exception 'Valor conciliado inválido.';
  end if;

  select * into v_item from public.credit_card_statement_items
    where id = p_statement_item_id and owner_id = v_owner for update;
  if not found then raise exception 'Item da fatura não encontrado.'; end if;
  select * into v_transaction from public.transactions
    where id = p_transaction_id and owner_id = v_owner for update;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if v_transaction.account_id is distinct from v_item.account_id
    or v_transaction.competence_id is distinct from v_item.competence_id then
    raise exception 'Lançamento incompatível com a conta ou competência da fatura.';
  end if;
  if v_transaction.value is distinct from p_expected_value then
    raise exception 'O valor do lançamento mudou. Recarregue a conciliação.';
  end if;

  update public.transactions set value = p_value
    where id = p_transaction_id and owner_id = v_owner
    returning * into v_transaction;
  if not found then raise exception 'Não foi possível atualizar o lançamento.'; end if;
  delete from public.credit_card_statement_item_transactions
    where statement_item_id = p_statement_item_id and owner_id = v_owner;
  insert into public.credit_card_statement_item_transactions
    (owner_id, statement_item_id, transaction_id)
    values (v_owner, p_statement_item_id, p_transaction_id);
  update public.credit_card_statement_items
    set status = 'Conciliado', ignored_reason = null, updated_at = now()
    where id = p_statement_item_id and owner_id = v_owner;
  if not found then raise exception 'Não foi possível conciliar o item.'; end if;
  return next v_transaction;
end;
$$;

revoke all on function public.search_transaction_descriptions(text) from public, anon;
grant execute on function public.search_transaction_descriptions(text) to authenticated;
revoke all on function public.reconcile_transaction_with_value(uuid, uuid, numeric, numeric) from public, anon;
grant execute on function public.reconcile_transaction_with_value(uuid, uuid, numeric, numeric) to authenticated;
