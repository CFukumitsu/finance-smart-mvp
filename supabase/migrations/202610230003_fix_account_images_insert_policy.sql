-- Corrige account_images_insert_own: dentro do EXISTS, "name" sem qualificador
-- resolvia para public.accounts.name (e não storage.objects.name), fazendo a
-- política negar todo upload. Somente recria a política; nenhum dado é alterado.

drop policy if exists account_images_insert_own on storage.objects;

create policy account_images_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'account-images'
    and (storage.foldername(objects.name))[1] = auth.uid()::text
    and exists (
      select 1
        from public.accounts account
       where account.id::text = (storage.foldername(objects.name))[2]
         and account.owner_id = auth.uid()
    )
  );
