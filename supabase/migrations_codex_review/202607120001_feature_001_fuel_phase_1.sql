begin;

alter table public.categories
  add column if not exists special_type text;

alter table public.categories drop constraint if exists categories_special_type_check;
alter table public.categories add constraint categories_special_type_check
  check (special_type is null or special_type in ('fuel', 'vehicle_maintenance', 'parking', 'toll', 'vehicle_insurance'));

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null, brand text, model text, model_year integer, plate text, fuel_type text not null,
  tank_capacity numeric(10,3), initial_odometer numeric(12,1), is_default boolean not null default false,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists vehicles_one_active_default_per_owner
  on public.vehicles(owner_id) where is_default and active;
create unique index if not exists vehicles_owner_plate_unique
  on public.vehicles(owner_id, upper(plate)) where plate is not null;

create table if not exists public.fuel_stations (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null, brand text, address text, neighborhood text, city text, state text, postal_code text,
  latitude double precision, longitude double precision, active boolean not null default true,
  google_place_id text, google_maps_uri text, google_rating numeric(3,2), google_user_rating_count integer,
  google_business_status text, google_primary_type text, google_display_name text,
  google_formatted_address text, google_last_synced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.fuel_stations add column if not exists google_place_id text;
alter table public.fuel_stations add column if not exists google_maps_uri text;
alter table public.fuel_stations add column if not exists google_rating numeric(3,2);
alter table public.fuel_stations add column if not exists google_user_rating_count integer;
alter table public.fuel_stations add column if not exists google_business_status text;
alter table public.fuel_stations add column if not exists google_primary_type text;
alter table public.fuel_stations add column if not exists google_display_name text;
alter table public.fuel_stations add column if not exists google_formatted_address text;
alter table public.fuel_stations add column if not exists google_last_synced_at timestamptz;
create unique index if not exists fuel_stations_owner_google_place_unique
  on public.fuel_stations(owner_id, google_place_id) where google_place_id is not null;

create table if not exists public.fuel_records (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  station_id uuid not null references public.fuel_stations(id) on delete restrict,
  fuel_type text not null, odometer numeric(12,1) not null check (odometer >= 0),
  liters numeric(12,3) not null check (liters > 0), price_per_liter numeric(12,4) not null check (price_per_liter > 0),
  total_value numeric(14,2) not null check (total_value > 0), full_tank boolean not null,
  latitude double precision, longitude double precision, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists fuel_records_owner_vehicle_date_idx on public.fuel_records(owner_id, vehicle_id, created_at desc);

alter table public.vehicles enable row level security;
alter table public.fuel_stations enable row level security;
alter table public.fuel_records enable row level security;

do $$ declare t text; op text; begin
  foreach t in array array['vehicles','fuel_stations','fuel_records'] loop
    foreach op in array array['select','insert','update','delete'] loop
      execute format('drop policy if exists %I on public.%I', t || '_owner_' || op, t);
      if op = 'insert' then
        execute format('create policy %I on public.%I for insert with check (owner_id = auth.uid())', t || '_owner_' || op, t);
      elsif op = 'update' then
        execute format('create policy %I on public.%I for update using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t || '_owner_' || op, t);
      else
        execute format('create policy %I on public.%I for %s using (owner_id = auth.uid())', t || '_owner_' || op, t, op);
      end if;
    end loop;
  end loop;
end $$;

create or replace function public.save_fuel_transaction(p_transaction jsonb, p_fuel_record jsonb, p_transaction_id uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_owner uuid := auth.uid(); v_transaction_id uuid; v_vehicle_owner uuid; v_station_owner uuid;
begin
  if v_owner is null then raise exception 'Usuário não autenticado'; end if;
  select owner_id into v_vehicle_owner from vehicles where id = (p_fuel_record->>'vehicle_id')::uuid;
  select owner_id into v_station_owner from fuel_stations where id = (p_fuel_record->>'station_id')::uuid;
  if v_vehicle_owner is distinct from v_owner or v_station_owner is distinct from v_owner then raise exception 'Veículo ou posto inválido'; end if;
  if p_transaction_id is null then
    insert into transactions(description,value,due_date,type,mode,status,account_id,category_id,competence_id,owner_id)
    values (p_transaction->>'description',(p_transaction->>'value')::numeric,p_transaction->>'due_date','Despesa','unico',p_transaction->>'status',(p_transaction->>'account_id')::uuid,(p_transaction->>'category_id')::uuid,(p_transaction->>'competence_id')::uuid,v_owner)
    returning id into v_transaction_id;
  else
    update transactions set description=p_transaction->>'description',value=(p_transaction->>'value')::numeric,due_date=p_transaction->>'due_date',type='Despesa',mode='unico',status=p_transaction->>'status',account_id=(p_transaction->>'account_id')::uuid,category_id=(p_transaction->>'category_id')::uuid,competence_id=(p_transaction->>'competence_id')::uuid
    where id=p_transaction_id and owner_id=v_owner returning id into v_transaction_id;
    if v_transaction_id is null then raise exception 'Lançamento não encontrado'; end if;
  end if;
  insert into fuel_records(owner_id,transaction_id,vehicle_id,station_id,fuel_type,odometer,liters,price_per_liter,total_value,full_tank,latitude,longitude,notes)
  values(v_owner,v_transaction_id,(p_fuel_record->>'vehicle_id')::uuid,(p_fuel_record->>'station_id')::uuid,p_fuel_record->>'fuel_type',(p_fuel_record->>'odometer')::numeric,(p_fuel_record->>'liters')::numeric,(p_fuel_record->>'price_per_liter')::numeric,(p_fuel_record->>'total_value')::numeric,(p_fuel_record->>'full_tank')::boolean,nullif(p_fuel_record->>'latitude','')::double precision,nullif(p_fuel_record->>'longitude','')::double precision,nullif(p_fuel_record->>'notes',''))
  on conflict(transaction_id) do update set vehicle_id=excluded.vehicle_id,station_id=excluded.station_id,fuel_type=excluded.fuel_type,odometer=excluded.odometer,liters=excluded.liters,price_per_liter=excluded.price_per_liter,total_value=excluded.total_value,full_tank=excluded.full_tank,latitude=excluded.latitude,longitude=excluded.longitude,notes=excluded.notes,updated_at=now()
  where fuel_records.owner_id=v_owner;
  return v_transaction_id;
end $$;
grant execute on function public.save_fuel_transaction(jsonb,jsonb,uuid) to authenticated;

commit;
