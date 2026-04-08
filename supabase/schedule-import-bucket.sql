-- Run in Supabase SQL Editor if import fails with "Bucket not found".
-- (Full schema is in migrations/20260404150000_crew_schedule_import.sql)

insert into storage.buckets (id, name, public)
values ('schedule-imports', 'schedule-imports', false)
on conflict (id) do nothing;

drop policy if exists "schedule_imports_insert_own" on storage.objects;
create policy "schedule_imports_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'schedule-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "schedule_imports_select_own" on storage.objects;
create policy "schedule_imports_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'schedule-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "schedule_imports_update_own" on storage.objects;
create policy "schedule_imports_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'schedule-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'schedule-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "schedule_imports_delete_own" on storage.objects;
create policy "schedule_imports_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'schedule-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
