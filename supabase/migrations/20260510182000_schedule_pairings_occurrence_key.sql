alter table public.schedule_pairings
  add column if not exists occurrence_key text;

update public.schedule_pairings
set occurrence_key =
  coalesce(operate_start_date::text, pairing_start_date::text, 'unknown-start')
  || ':'
  || coalesce(operate_end_date::text, pairing_end_date::text, 'unknown-end')
where occurrence_key is null or btrim(occurrence_key) = '';

alter table public.schedule_pairings
  alter column occurrence_key set not null;

alter table public.schedule_pairings
  alter column occurrence_key set default 'unknown-start:unknown-end';

alter table public.schedule_pairings
  drop constraint if exists schedule_pairings_import_pairing;

alter table public.schedule_pairings
  add constraint schedule_pairings_import_pairing_occurrence
  unique (user_id, import_id, pairing_id, occurrence_key);

create index if not exists idx_schedule_pairings_user_import_pairing_occurrence
  on public.schedule_pairings (user_id, import_id, pairing_id, occurrence_key);
