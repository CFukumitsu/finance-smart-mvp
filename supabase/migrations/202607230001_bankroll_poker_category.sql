-- Define automaticamente a categoria especial Poker nos lançamentos
-- financeiros criados pela integração com o Bankroll.
-- Permite a função especial Poker nas categorias.
alter table public.categories
  drop constraint if exists categories_special_type_check;

alter table public.categories
  add constraint categories_special_type_check
  check (
    special_type is null
    or special_type in (
      'fuel',
      'poker',
      'vehicle_maintenance',
      'parking',
      'toll',
      'vehicle_insurance'
    )
  );
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
  -- Atua somente em lançamentos integrados ao Bankroll.
  if new.bankroll_integration_group_id is null then
    return new;
  end if;

  if new.bankroll_operation_type not in ('deposit', 'withdrawal') then
    return new;
  end if;

  select
    count(*),
    min(category_row.id)
  into
    poker_category_count,
    poker_category_id
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

  new.category_id := poker_category_id;

  return new;
end;
$$;

drop trigger if exists transactions_bankroll_poker_category
  on public.transactions;

create trigger transactions_bankroll_poker_category
before insert or update
on public.transactions
for each row
when (new.bankroll_integration_group_id is not null)
execute function public.assign_bankroll_poker_category();

alter function public.assign_bankroll_poker_category()
  owner to postgres;

revoke all
on function public.assign_bankroll_poker_category()
from public, anon, authenticated, service_role;

-- Impede mais de uma categoria Poker por usuário.
create unique index if not exists categories_owner_poker_special_type_key
  on public.categories (owner_id)
  where special_type = 'poker';

-- Categoriza operações integradas antigas quando o proprietário já possui
-- exatamente uma categoria Poker ativa e do tipo Transferência.
update public.transactions transaction_row
set
  category_id = category_row.id,
  updated_at = now()
from public.categories category_row
where transaction_row.owner_id = category_row.owner_id
  and transaction_row.bankroll_integration_group_id is not null
  and transaction_row.bankroll_operation_type in ('deposit', 'withdrawal')
  and category_row.special_type = 'poker'
  and category_row.type = 'Transferência'
  and category_row.active = true
  and (
    select count(*)
    from public.categories category_check
    where category_check.owner_id = transaction_row.owner_id
      and category_check.special_type = 'poker'
      and category_check.type = 'Transferência'
      and category_check.active = true
  ) = 1;