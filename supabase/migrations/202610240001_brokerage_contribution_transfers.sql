-- Finance Smart - Aportes e resgates entre contas financeiras e corretoras.
-- Preparada para revisão; NÃO aplicar automaticamente.
--
-- Reutiliza as transferências vinculadas (create_transfer, update_transfer e
-- delete_transfer): duas pontas em public.transactions com o mesmo
-- transfer_group_id, gravadas numa única transação, com idempotência pela
-- chave do formulário e isolamento por owner_id. Só muda a validação das
-- contas (resolve_transfer_accounts):
--
--   * Corretora de ativos = Conta ativa marcada para Investimentos
--     (show_on_investments_dashboard) que NÃO é investimento por saldo
--     (investment_account_kind IS NULL). É a mesma conta exigida pelas
--     operações de compra/venda. Nada depende de nome, banco ou ticker.
--   * APORTE: conta financeira -> corretora. RESGATE: corretora -> conta
--     financeira. Exatamente uma ponta pode ser corretora.
--   * Mesma moeda obrigatória nas duas pontas (sem conversão neste fluxo).
--   * Cartões continuam bloqueados; contas por saldo (BALANCE) continuam
--     exclusivas do módulo Investimentos; corretora <-> corretora bloqueado.
--
-- Efeito financeiro: a ponta da conta financeira debita (aporte) ou credita
-- (resgate) uma única vez. A ponta da corretora não entra em saldo
-- operacional, fechamento nem patrimônio (o patrimônio da corretora continua
-- sendo o valor das posições; ver investmentReserves.ts). Compras e vendas
-- de ativos continuam sem gerar lançamento financeiro.
--
-- Sem alteração de tabelas, sem backfill e sem tocar em dados existentes.

begin;

create or replace function public.resolve_transfer_accounts(
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
  origin_is_brokerage boolean;
  destination_is_brokerage boolean;
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
  if origin_account.investment_account_kind is not null
     or destination_account.investment_account_kind is not null then
    raise exception 'Contas de investimento por saldo devem ser movimentadas exclusivamente pelo módulo Investimentos.'
      using errcode = '22023';
  end if;

  origin_is_brokerage := coalesce(origin_account.show_on_investments_dashboard, false);
  destination_is_brokerage := coalesce(destination_account.show_on_investments_dashboard, false);

  if origin_is_brokerage and destination_is_brokerage then
    raise exception 'Transferências entre duas corretoras não são suportadas. Registre um resgate para uma conta financeira e depois um aporte.'
      using errcode = '22023';
  end if;

  if (not origin_account.active
      and not origin_account.id = any(coalesce(p_allowed_inactive_account_ids, array[]::uuid[])))
     or (not destination_account.active
      and not destination_account.id = any(coalesce(p_allowed_inactive_account_ids, array[]::uuid[]))) then
    raise exception 'A conta de origem ou destino está inativa.' using errcode = '22023';
  end if;

  if origin_is_brokerage or destination_is_brokerage then
    -- Aporte/resgate: sem conversão cambial nesta entrega.
    if origin_account.currency is null or destination_account.currency is null then
      raise exception 'Confirme a moeda das duas contas em Contas/Cartões antes de registrar aporte ou resgate.'
        using errcode = '22023';
    end if;
    if origin_account.currency <> destination_account.currency then
      raise exception 'Aportes e resgates com corretora exigem a mesma moeda nas duas contas (% e %).',
        origin_account.currency, destination_account.currency
        using errcode = '22023';
    end if;
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

-- CREATE OR REPLACE preserva dono e permissões; reafirmados por segurança:
-- função interna, chamada apenas pelas RPCs de transferência.
alter function public.resolve_transfer_accounts(uuid, uuid, uuid, uuid[]) owner to postgres;
revoke all on function public.resolve_transfer_accounts(uuid, uuid, uuid, uuid[]) from public, anon, authenticated, service_role;

comment on function public.resolve_transfer_accounts(uuid, uuid, uuid, uuid[]) is
  'Valida as contas de uma transferência vinculada. Aceita aporte (financeira -> corretora) e resgate (corretora -> financeira) na mesma moeda; bloqueia cartões, contas por saldo e corretora <-> corretora.';

notify pgrst, 'reload schema';

commit;
