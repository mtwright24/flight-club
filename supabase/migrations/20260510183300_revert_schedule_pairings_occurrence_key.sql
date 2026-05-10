alter table public.schedule_pairings
  drop constraint if exists schedule_pairings_import_pairing_occurrence;

drop index if exists public.idx_schedule_pairings_user_import_pairing_occurrence;

alter table public.schedule_pairings
  drop column if exists occurrence_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'schedule_pairings_import_pairing'
      and conrelid = 'public.schedule_pairings'::regclass
  ) then
    alter table public.schedule_pairings
      add constraint schedule_pairings_import_pairing
      unique (user_id, import_id, pairing_id);
  end if;
end $$;
