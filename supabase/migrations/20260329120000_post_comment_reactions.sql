-- Reactions on social feed comments (`post_comments`), same emoji set as room comment reactions.
create table if not exists public.post_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (
    reaction in (
      'solid', 'love', 'dead', 'yikes', 'tea', 'heads_up', 'cap', 'yeah_sure', 'nah'
    )
  ),
  created_at timestamptz not null default now(),
  constraint post_comment_reactions_one_per_user unique (comment_id, user_id)
);

alter table public.post_comment_reactions enable row level security;

create policy "post_comment_reactions_select"
  on public.post_comment_reactions for select
  using (true);

create policy "post_comment_reactions_insert_own"
  on public.post_comment_reactions for insert
  with check (auth.uid() = user_id);

create policy "post_comment_reactions_update_own"
  on public.post_comment_reactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "post_comment_reactions_delete_own"
  on public.post_comment_reactions for delete
  using (auth.uid() = user_id);

create index if not exists idx_post_comment_reactions_comment_id
  on public.post_comment_reactions(comment_id);

create index if not exists idx_post_comment_reactions_user_id
  on public.post_comment_reactions(user_id);
