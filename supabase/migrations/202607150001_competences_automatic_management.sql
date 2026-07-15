-- Competencias automaticas, isoladas por usuario e seguras sob concorrencia.
-- Esta migration nao remove duplicidades. Se elas existirem, a aplicacao deve
-- ser interrompida para saneamento manual antes da criacao da constraint.

alter table public.competences
  drop constraint if exists competences_month_year_key;

do $$
declare
  duplicate_summary text;
  equivalent_unique_exists boolean;
begin
  -- Evita que uma gravacao concorrente apareca entre a auditoria e a criacao
  -- da unicidade. O lock e liberado ao final da transacao da migration.
  lock table public.competences in share row exclusive mode;

  select string_agg(
    format('owner_id=%s, competencia=%s-%s, quantidade=%s',
      coalesce(owner_id::text, '<null>'),
      year,
      lpad(month::text, 2, '0'),
      duplicate_count
    ),
    E'\n'
  )
  into duplicate_summary
  from (
    select owner_id, year, month, count(*) as duplicate_count
    from public.competences
    group by owner_id, year, month
    having count(*) > 1
    order by owner_id, year, month
  ) duplicates;

  if duplicate_summary is not null then
    raise exception using
      message = 'Existem competencias duplicadas por usuario; nenhuma linha foi removida.',
      detail = duplicate_summary,
      hint = 'Resolva as duplicidades manualmente e execute a migration novamente.';
  end if;

  -- A inferencia usada por ON CONFLICT depende de um indice UNIQUE valido,
  -- imediato, sem predicado e com exatamente estas tres colunas-chave. A
  -- inferencia ignora a ordem e o nome da constraint ou do indice.
  select exists (
    select 1
    from pg_catalog.pg_index as index_definition
    join pg_catalog.pg_class as table_definition
      on table_definition.oid = index_definition.indrelid
    join pg_catalog.pg_namespace as table_namespace
      on table_namespace.oid = table_definition.relnamespace
    where table_namespace.nspname = 'public'
      and table_definition.relname = 'competences'
      and index_definition.indisunique
      and index_definition.indisvalid
      and index_definition.indisready
      and index_definition.indimmediate
      and index_definition.indpred is null
      and index_definition.indexprs is null
      and (
        select array_agg(attribute_definition.attname order by attribute_definition.attname)
        from unnest(index_definition.indkey) with ordinality
          as key_column(attnum, ordinality)
        join pg_catalog.pg_attribute as attribute_definition
          on attribute_definition.attrelid = index_definition.indrelid
         and attribute_definition.attnum = key_column.attnum
        where key_column.ordinality <= index_definition.indnkeyatts
      ) = array['month', 'owner_id', 'year']::name[]
  ) into equivalent_unique_exists;

  if not equivalent_unique_exists then
    if exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = 'public.competences'::regclass
        and conname = 'competences_owner_year_month_key'
    ) then
      raise exception using
        message = 'A constraint competences_owner_year_month_key existe, mas nao representa UNIQUE (owner_id, year, month).',
        hint = 'Revise a constraint existente antes de executar a migration novamente.';
    end if;

    alter table public.competences
      add constraint competences_owner_year_month_key
      unique (owner_id, year, month);
  end if;
end;
$$;

create or replace function public.ensure_competence(p_reference text)
returns public.competences
language plpgsql
security invoker
set search_path = ''
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  normalized_reference text := trim(p_reference);
  competence_year integer;
  competence_month integer;
  competence_name text;
  result public.competences;
begin
  if authenticated_owner_id is null then
    raise exception 'Usuario nao autenticado.' using errcode = '42501';
  end if;

  if normalized_reference !~ '^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$' then
    raise exception 'Competencia invalida. Use YYYY-MM ou YYYY-MM-DD.' using errcode = '22007';
  end if;

  competence_year := substring(normalized_reference from 1 for 4)::integer;
  competence_month := substring(normalized_reference from 6 for 2)::integer;
  competence_name := format('%s-%s', competence_year, lpad(competence_month::text, 2, '0'));

  insert into public.competences (
    owner_id, year, month, name, status, start_date, end_date
  ) values (
    authenticated_owner_id,
    competence_year,
    competence_month,
    competence_name,
    'ABERTA',
    make_date(competence_year, competence_month, 1),
    (make_date(competence_year, competence_month, 1) + interval '1 month - 1 day')::date
  )
  on conflict (owner_id, year, month) do nothing;

  select competence.*
    into result
    from public.competences as competence
   where competence.owner_id = authenticated_owner_id
     and competence.year = competence_year
     and competence.month = competence_month;

  if result.id is null then
    raise exception 'Nao foi possivel localizar ou criar a competencia.';
  end if;

  return result;
end;
$$;

create or replace function public.ensure_competence_range(
  p_start_reference text,
  p_end_reference text,
  p_max_months integer default 120
)
returns table (created_count integer, existing_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  start_month date;
  end_month date;
  requested_months integer;
  inserted_months integer;
begin
  if authenticated_owner_id is null then
    raise exception 'Usuario nao autenticado.' using errcode = '42501';
  end if;

  if trim(p_start_reference) !~ '^\d{4}-(0[1-9]|1[0-2])$'
     or trim(p_end_reference) !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Intervalo invalido. Use YYYY-MM.' using errcode = '22007';
  end if;

  if p_max_months < 1 or p_max_months > 120 then
    raise exception 'O limite deve estar entre 1 e 120 meses.' using errcode = '22023';
  end if;

  start_month := (trim(p_start_reference) || '-01')::date;
  end_month := (trim(p_end_reference) || '-01')::date;

  if end_month < start_month then
    raise exception 'A competencia final deve ser igual ou posterior a inicial.' using errcode = '22023';
  end if;

  requested_months := (
    extract(year from age(end_month, start_month))::integer * 12
    + extract(month from age(end_month, start_month))::integer
    + 1
  );

  if requested_months > p_max_months then
    raise exception 'O intervalo excede o limite de % meses.', p_max_months using errcode = '22023';
  end if;

  insert into public.competences (
    owner_id, year, month, name, status, start_date, end_date
  )
  select
    authenticated_owner_id,
    extract(year from month_start)::integer,
    extract(month from month_start)::integer,
    to_char(month_start, 'YYYY-MM'),
    'ABERTA',
    month_start::date,
    (month_start + interval '1 month - 1 day')::date
  from generate_series(start_month, end_month, interval '1 month') as months(month_start)
  on conflict (owner_id, year, month) do nothing;

  get diagnostics inserted_months = row_count;

  return query select inserted_months, requested_months - inserted_months;
end;
$$;

-- Somente usuarios criados depois desta migration recebem a janela inicial.
-- O backfill dos usuarios existentes permanece deliberadamente fora da aplicacao.
create or replace function public.initialize_new_user_competences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date;
begin
  for month_start in
    select generate_series(
      date_trunc('month', timezone('America/Sao_Paulo', now()))::date - interval '1 month',
      date_trunc('month', timezone('America/Sao_Paulo', now()))::date + interval '12 months',
      interval '1 month'
    )::date
  loop
    insert into public.competences (
      owner_id, year, month, name, status, start_date, end_date
    ) values (
      new.id,
      extract(year from month_start)::integer,
      extract(month from month_start)::integer,
      to_char(month_start, 'YYYY-MM'),
      'ABERTA',
      month_start,
      (month_start + interval '1 month - 1 day')::date
    )
    on conflict (owner_id, year, month) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_initialize_competences on auth.users;
create trigger on_auth_user_created_initialize_competences
  after insert on auth.users
  for each row execute function public.initialize_new_user_competences();

revoke all on function public.ensure_competence(text) from public, anon;
revoke all on function public.ensure_competence_range(text, text, integer) from public, anon;
grant execute on function public.ensure_competence(text) to authenticated;
grant execute on function public.ensure_competence_range(text, text, integer) to authenticated;
revoke all on function public.initialize_new_user_competences() from public, anon, authenticated;
