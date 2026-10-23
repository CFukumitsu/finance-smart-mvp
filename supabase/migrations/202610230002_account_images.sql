-- Finance Smart - Contas/Cartões: imagem opcional (Supabase Storage).
-- Preparada para revisão; NÃO aplicar automaticamente em DEV/PROD.
-- Aplicar DEPOIS de 202610230001_account_transaction_shortcuts.sql.
--
-- Somente acréscimos: nenhuma linha existente é alterada (sem UPDATE/backfill).
-- Imagem puramente visual: não participa de saldo, fatura, fechamento,
-- conciliação, planejamento ou qualquer regra financeira.
--
-- Estrutura: bucket PRIVADO "account-images"; cada arquivo fica em
--   <owner_id>/<account_id>/<uuid>.<png|jpg|webp>
-- A leitura usa URLs assinadas e temporárias geradas para o próprio dono.
-- Nada em base64 na tabela: accounts.image_path guarda só o caminho.

-- 1) Referência da imagem na conta.
alter table public.accounts
  add column if not exists image_path text;

-- O caminho precisa estar na pasta do dono E da própria conta. Impede apontar
-- para arquivo de outro usuário ou de outra conta.
alter table public.accounts
  add constraint accounts_image_path_scope_check
    check (
      image_path is null
      or image_path ~ (
        '^' || owner_id::text || '/' || id::text || '/[A-Za-z0-9._-]{1,80}\.(png|jpg|webp)$'
      )
    );

comment on column public.accounts.image_path is
  'Visual: caminho da imagem no bucket privado account-images (<owner_id>/<account_id>/<arquivo>). NULL = ícone escolhido ou automático. Não define regras financeiras.';

-- 2) Bucket privado com limite de 2 MB e somente PNG, JPEG e WebP.
--    (o app também valida tipo, tamanho e assinatura do arquivo).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('account-images', 'account-images', false, 2097152,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3) Políticas em storage.objects (RLS já habilitada pelo Supabase).
--    Primeira pasta = auth.uid(); envio só para conta do próprio usuário.
--    Sem política de UPDATE: arquivos não são sobrescritos (cada envio cria
--    um arquivo novo; o antigo é removido só depois do cadastro salvo).
create policy account_images_select_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'account-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy account_images_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'account-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
        from public.accounts account
       where account.id::text = (storage.foldername(name))[2]
         and account.owner_id = auth.uid()
    )
  );

create policy account_images_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'account-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
