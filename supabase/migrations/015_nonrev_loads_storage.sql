-- Storage bucket for loads media uploads

-- Create bucket if not exists
insert into storage.buckets (id, name, public)
values ('loads-media', 'loads-media', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to loads-media bucket
drop policy if exists "Authenticated users can upload to loads-media" on storage.objects;
create policy "Authenticated users can upload to loads-media"
on storage.objects for insert
with check (bucket_id = 'loads-media' and auth.role() = 'authenticated');

-- Allow public read access to loads-media bucket
drop policy if exists "Public can read loads-media" on storage.objects;
create policy "Public can read loads-media"
on storage.objects for select
using (bucket_id = 'loads-media');

-- Allow users to delete their own uploads
drop policy if exists "Users can delete their own loads-media uploads" on storage.objects;
create policy "Users can delete their own loads-media uploads"
on storage.objects for delete
using (
  bucket_id = 'loads-media' 
  and auth.uid()::text = (string_to_array(name, '/'))[1]
);
