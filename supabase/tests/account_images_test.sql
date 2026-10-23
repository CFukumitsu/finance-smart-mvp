\set ON_ERROR_STOP on

-- Finance Smart - Contas/Cartões: imagem opcional (Storage).
-- Testes transacionais para banco Supabase LOCAL isolado, após aplicar
-- 202610230001 e 202610230002. Tudo é desfeito pelo ROLLBACK.
-- Este arquivo não deve ser executado em DEV ou PROD.
-- Insere em storage.objects diretamente (só metadados), como o Storage faz,
-- para exercitar as políticas sem enviar arquivos.

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'FALHOU: %', p_message;
  end if;
  raise notice 'OK: %', p_message;
end $$;

create or replace function pg_temp.expect_error(
  p_sql text, p_expected_state text, p_expected_message text, p_test_name text
) returns void language plpgsql as $$
declare
  actual_state text;
  actual_message text;
begin
  begin
    execute p_sql;
    raise exception 'FALHOU: % (nenhum erro)', p_test_name;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate, actual_message = message_text;
    if actual_message like 'FALHOU:%' then raise; end if;
    if actual_state <> p_expected_state or position(p_expected_message in actual_message) = 0 then
      raise exception 'FALHOU: % (recebido [%] %, esperado [%] contendo %)',
        p_test_name, actual_state, actual_message, p_expected_state, p_expected_message;
    end if;
    raise notice 'OK: %', p_test_name;
  end;
end $$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'af000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'images-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'af000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'images-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.accounts(id, owner_id, name, type, currency, current_balance, active) values
  ('af100000-0000-0000-0000-000000000001', 'af000000-0000-0000-0000-000000000001', 'Conta A', 'Conta', 'BRL', 0, true),
  ('af100000-0000-0000-0000-000000000002', 'af000000-0000-0000-0000-000000000002', 'Conta B', 'Conta', 'BRL', 0, true);

select pg_temp.assert_true(
  (select not public and file_size_limit = 2097152
          and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp']
          and cardinality(allowed_mime_types) = 3
     from storage.buckets where id = 'account-images'),
  'bucket privado, 2 MB, somente PNG/JPEG/WebP');
select pg_temp.assert_true(
  (select image_path is null from public.accounts where id = 'af100000-0000-0000-0000-000000000001'),
  'contas existentes ficam sem imagem');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000001', true);

-- Usuário A envia para a própria conta.
insert into storage.objects(bucket_id, name, owner)
values ('account-images',
        'af000000-0000-0000-0000-000000000001/af100000-0000-0000-0000-000000000001/a1.png',
        'af000000-0000-0000-0000-000000000001');
select pg_temp.assert_true(
  (select count(*) = 1 from storage.objects where bucket_id = 'account-images'),
  'dono envia e enxerga a própria imagem');

select pg_temp.expect_error($sql$
  insert into storage.objects(bucket_id, name, owner)
  values ('account-images',
          'af000000-0000-0000-0000-000000000002/af100000-0000-0000-0000-000000000002/x.png',
          'af000000-0000-0000-0000-000000000001')
$sql$, '42501', 'row-level security', 'não envia para a pasta de outro usuário');
select pg_temp.expect_error($sql$
  insert into storage.objects(bucket_id, name, owner)
  values ('account-images',
          'af000000-0000-0000-0000-000000000001/af100000-0000-0000-0000-000000000002/x.png',
          'af000000-0000-0000-0000-000000000001')
$sql$, '42501', 'row-level security', 'não envia para conta de outro usuário dentro da própria pasta');

update public.accounts
   set image_path = 'af000000-0000-0000-0000-000000000001/af100000-0000-0000-0000-000000000001/a1.png'
 where id = 'af100000-0000-0000-0000-000000000001';
select pg_temp.assert_true(
  (select image_path like '%/a1.png' from public.accounts where id = 'af100000-0000-0000-0000-000000000001'),
  'dono grava a referência da imagem');
select pg_temp.expect_error($sql$
  update public.accounts
     set image_path = 'af000000-0000-0000-0000-000000000002/af100000-0000-0000-0000-000000000002/x.png'
   where id = 'af100000-0000-0000-0000-000000000001'
$sql$, '23514', 'accounts_image_path_scope_check', 'referência a arquivo de outro usuário é rejeitada');
select pg_temp.expect_error($sql$
  update public.accounts set image_path = 'data:image/png;base64,AAAA'
   where id = 'af100000-0000-0000-0000-000000000001'
$sql$, '23514', 'accounts_image_path_scope_check', 'base64 na tabela é rejeitado');

-- Usuário B não vê, não apaga e não reaproveita a imagem de A.
select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(
  (select count(*) = 0 from storage.objects where bucket_id = 'account-images'),
  'RLS: outro usuário não enxerga a imagem');
delete from storage.objects where bucket_id = 'account-images';
select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(
  (select count(*) = 1 from storage.objects where bucket_id = 'account-images'),
  'RLS: outro usuário não apaga a imagem');

delete from storage.objects where bucket_id = 'account-images';
select pg_temp.assert_true(
  (select count(*) = 0 from storage.objects where bucket_id = 'account-images'),
  'dono remove a própria imagem');

select pg_temp.assert_true(true, 'TODOS OS TESTES DE IMAGEM DE CONTAS PASSARAM');

rollback;
