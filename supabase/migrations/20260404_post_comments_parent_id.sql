-- Optional threading: reply targets a parent comment on the same post.
alter table if exists public.post_comments
  add column if not exists parent_comment_id uuid references public.post_comments(id) on delete cascade;

create index if not exists idx_post_comments_parent_id on public.post_comments(parent_comment_id);
