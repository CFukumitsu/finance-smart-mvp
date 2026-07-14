begin;

alter table public.fuel_stations
  add column if not exists station_type text not null default 'registered';

alter table public.fuel_stations
  drop constraint if exists fuel_stations_station_type_check;

alter table public.fuel_stations
  add constraint fuel_stations_station_type_check
  check (station_type in ('registered', 'generic'));

alter table public.fuel_stations
  drop constraint if exists fuel_stations_generic_metadata_check;

alter table public.fuel_stations
  add constraint fuel_stations_generic_metadata_check
  check (
    station_type <> 'generic'
    or (
      google_place_id is null
      and google_maps_uri is null
      and latitude is null
      and longitude is null
    )
  );

-- Compatibilidade segura: somente um cadastro legado inequívoco, sem vínculo
-- Google nem coordenadas, é promovido. Casos ambíguos permanecem registrados
-- para revisão manual; a regra de domínio nunca depende do nome.
with eligible_legacy_station as (
  select owner_id, min(id::text)::uuid as id
  from public.fuel_stations
  where lower(trim(name)) = lower('Outros postos')
    and google_place_id is null
    and latitude is null
    and longitude is null
  group by owner_id
  having count(*) = 1
)
update public.fuel_stations station
set station_type = 'generic',
    google_place_id = null,
    google_maps_uri = null,
    latitude = null,
    longitude = null,
    updated_at = now()
from eligible_legacy_station eligible
where station.id = eligible.id;

create unique index if not exists fuel_stations_one_generic_per_owner
  on public.fuel_stations(owner_id)
  where station_type = 'generic';

create or replace function public.ensure_generic_fuel_station()
returns public.fuel_stations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_station public.fuel_stations;
begin
  if v_owner_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  select * into v_station
  from public.fuel_stations
  where owner_id = v_owner_id
    and station_type = 'generic'
  limit 1;

  if found then
    if not v_station.active then
      update public.fuel_stations
      set active = true, updated_at = now()
      where id = v_station.id
      returning * into v_station;
    end if;
    return v_station;
  end if;

  begin
    insert into public.fuel_stations (
      owner_id,
      name,
      station_type,
      active,
      google_place_id,
      google_maps_uri,
      latitude,
      longitude
    ) values (
      v_owner_id,
      'Outros postos',
      'generic',
      true,
      null,
      null,
      null,
      null
    )
    returning * into v_station;
  exception when unique_violation then
    select * into v_station
    from public.fuel_stations
    where owner_id = v_owner_id
      and station_type = 'generic'
    limit 1;
  end;

  return v_station;
end;
$$;

grant execute on function public.ensure_generic_fuel_station() to authenticated;

comment on column public.fuel_stations.station_type is
  'Classifica postos reais cadastrados e o fallback genérico exclusivo do owner.';

commit;
