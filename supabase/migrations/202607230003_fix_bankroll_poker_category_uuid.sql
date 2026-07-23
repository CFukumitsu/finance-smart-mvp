-- Corrige a seleção da categoria Poker.
-- PostgreSQL não oferece min(uuid), portanto a contagem e a seleção
-- do identificador são realizadas separadamente.

create or replace function public.assign_bankroll_poker_category()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  poker_category_id uuid;
  poker_category_count integer;
begin
  -- Atua somente nos lançamentos integrados ao Bankroll.
  if new.bankroll_integration_group_id is null then
    return new;
  end if;

  if new.bankroll_operation_type not in ('deposit', 'withdrawal') then
    return new;
  end if;

  select count(*)
    into poker_category_count
    from public.categories category_row
   where category_row.owner_id = new.owner_id
     and category_row.special_type = 'poker'
     and category_row.type = 'Transferência'
     and category_row.active = true;

  if poker_category_count = 0 then
    raise exception
      'Cadastre uma categoria ativa do tipo Transferência com a função especial Poker.'
      using errcode = '22023';
  end if;

  if poker_category_count > 1 then
    raise exception
      'Existe mais de uma categoria ativa com a função especial Poker.'
      using errcode = '23505';
  end if;

  select category_row.id
    into poker_category_id
    from public.categories category_row
   where category_row.owner_id = new.owner_id
     and category_row.special_type = 'poker'
     and category_row.type = 'Transferência'
     and category_row.active = true
   limit 1;

  new.category_id := poker_category_id;

  return new;
end;
$$;

alter function public.assign_bankroll_poker_category()
  owner to postgres;

revoke all
on function public.assign_bankroll_poker_category()
from public, anon, authenticated, service_role;