-- Finance Smart - Contas/Cartões: ícone e atalhos de Lançamentos.
-- Preparada para revisão; NÃO aplicar automaticamente em DEV/PROD.
--
-- Somente acréscimos: nenhuma linha existente é alterada (sem UPDATE/backfill).
-- Contas existentes ficam sem ícone (a aplicação usa um ícone genérico pelo
-- cadastro) e fora dos atalhos: nenhuma conta vira favorita automaticamente.
-- Colunas puramente visuais: não participam de saldo, fatura, fechamento,
-- conciliação, planejamento ou qualquer regra financeira.
-- RLS: public.accounts já isola por owner_id (accounts_owner_select/insert/
-- update/delete com owner_id = auth.uid()); as novas colunas herdam as
-- mesmas políticas. Nenhuma política ou grant é alterado.

alter table public.accounts
  add column if not exists icon_key text,
  add column if not exists show_in_transaction_shortcuts boolean not null default false,
  add column if not exists transaction_shortcut_order integer;

-- Somente uma chave do catálogo da aplicação (letras minúsculas, números e
-- hífen). Nunca HTML, SVG ou URL.
alter table public.accounts
  add constraint accounts_icon_key_format_check
    check (icon_key is null or icon_key ~ '^[a-z0-9-]{1,40}$');

alter table public.accounts
  add constraint accounts_transaction_shortcut_order_check
    check (transaction_shortcut_order is null or transaction_shortcut_order between 1 and 999);

comment on column public.accounts.icon_key is
  'Visual: chave do ícone escolhido (catálogo da aplicação). NULL = ícone genérico pelo tipo/moeda. Não define regras financeiras.';
comment on column public.accounts.show_in_transaction_shortcuts is
  'Visual: exibir a conta/cartão nos atalhos da tela Lançamentos.';
comment on column public.accounts.transaction_shortcut_order is
  'Visual: posição do atalho em Lançamentos (1 = primeiro). NULL = depois dos ordenados, por nome.';

create index if not exists accounts_transaction_shortcuts_idx
  on public.accounts (owner_id, transaction_shortcut_order)
  where show_in_transaction_shortcuts = true;
