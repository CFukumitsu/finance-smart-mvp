-- Promove explicitamente o administrador inicial do Finance Smart.
-- A migration aborta se o e-mail nao identificar exatamente um usuario.

do $$
declare
  target_user_id uuid;
  matching_users integer;
begin
  select count(*)
    into matching_users
    from auth.users
   where lower(email) = lower('cesar.fukumitsu@gmail.com');

  select id
    into target_user_id
    from auth.users
   where lower(email) = lower('cesar.fukumitsu@gmail.com')
   limit 1;

  if matching_users <> 1 or target_user_id is null then
    raise exception using
      message = 'Nao foi possivel identificar exatamente um administrador inicial.',
      detail = format('Usuarios encontrados para o e-mail informado: %s.', matching_users),
      hint = 'Confirme o e-mail no Supabase Auth antes de executar novamente.';
  end if;

  update public.profiles
     set role = 'admin',
         status = 'active',
         disabled_at = null,
         updated_at = now()
   where id = target_user_id;

  if not found then
    raise exception using
      message = 'O usuario existe no Auth, mas nao possui perfil em public.profiles.',
      hint = 'Revise o backfill de perfis antes de executar novamente.';
  end if;
end;
$$;
