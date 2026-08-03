begin;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from auth.users order by created_at limit 1),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

set local role authenticated;

insert into public.investment_assets (
  owner_id,
  name,
  symbol,
  asset_type,
  currency,
  active
)
values (
  auth.uid(),
  'Codex RLS rollback test',
  'CRXT',
  'Criptomoeda',
  'BRL',
  true
);

do $$
declare
  cross_owner_rejected boolean := false;
begin
  begin
    insert into public.investment_assets (
      owner_id,
      name,
      asset_type,
      currency,
      active
    )
    values (
      gen_random_uuid(),
      'Codex cross-owner rollback test',
      'Outro',
      'BRL',
      true
    );
  exception
    when insufficient_privilege then
      cross_owner_rejected := true;
  end;

  if not cross_owner_rejected then
    raise exception 'Cross-owner insert unexpectedly passed RLS.';
  end if;
end;
$$;

reset role;
rollback;

select
  'own insert accepted; cross-owner insert rejected; transaction rolled back'
    as rls_test_result;
