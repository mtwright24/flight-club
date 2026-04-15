-- Storage bucket for direct message media (images/videos shared in DMs)

insert into storage.buckets (id, name, public)
values ('messages-media', 'messages-media', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload/update/delete their DM media objects
create policy "DM media: authenticated insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'messages-media');

create policy "DM media: authenticated update" on storage.objects
  for update to authenticated
  using (bucket_id = 'messages-media')
  with check (bucket_id = 'messages-media');

create policy "DM media: authenticated delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'messages-media');

-- Anyone can view DM media by public URL
create policy "DM media: public select" on storage.objects
  for select to public
  using (bucket_id = 'messages-media');
