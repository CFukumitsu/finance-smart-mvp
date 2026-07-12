begin;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fuel_records'::regclass
      and conname = 'fuel_records_station_id_fkey'
  ) then
    alter table public.fuel_records
      add constraint fuel_records_station_id_fkey
      foreign key (station_id)
      references public.fuel_stations(id)
      on delete restrict;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
