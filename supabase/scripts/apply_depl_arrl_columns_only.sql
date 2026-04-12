-- Safe to run on remote before full 20260411180000 (adds columns only).

alter table public.schedule_entries
  add column if not exists depart_local text,
  add column if not exists arrive_local text;

alter table public.schedule_import_candidates
  add column if not exists depart_local text,
  add column if not exists arrive_local text;
