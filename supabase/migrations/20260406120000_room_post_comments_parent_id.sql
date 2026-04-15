-- Threaded replies on crew room post comments (same pattern as post_comments).
alter table if exists public.room_post_comments
  add column if not exists parent_comment_id uuid references public.room_post_comments(id) on delete cascade;

create index if not exists idx_room_post_comments_parent_id on public.room_post_comments(parent_comment_id);
