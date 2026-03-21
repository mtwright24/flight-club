-- Only run this if posts, post_likes, post_comments, follows tables are missing!
-- Create posts table
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  created_at timestamptz default now(),
  content text,
  media_type text default 'none',
  media_url text,
  thumbnail_url text,
  aspect_ratio numeric,
  like_count int default 0,
  comment_count int default 0,
  visibility text default 'public'
);

create table if not exists public.post_likes (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references auth.users(id),
  created_at timestamptz default now(),
  body text not null
);

create table if not exists public.follows (
  follower_id uuid references auth.users(id) on delete cascade,
  following_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);

-- RLS policies
alter table posts enable row level security;
create policy "Public posts" on posts for select using (visibility = 'public');

alter table post_likes enable row level security;
create policy "Likes: select" on post_likes for select using (true);
create policy "Likes: insert" on post_likes for insert with check (auth.uid() = user_id);
create policy "Likes: delete" on post_likes for delete using (auth.uid() = user_id);

alter table post_comments enable row level security;
create policy "Comments: select" on post_comments for select using (true);
create policy "Comments: insert" on post_comments for insert with check (auth.uid() = user_id);
create policy "Comments: delete" on post_comments for delete using (auth.uid() = user_id);

alter table follows enable row level security;
create policy "Follows: select" on follows for select using (true);
create policy "Follows: insert" on follows for insert with check (auth.uid() = follower_id);
create policy "Follows: delete" on follows for delete using (auth.uid() = follower_id);

-- Indexes for performance
create index if not exists idx_posts_created_at on posts(created_at desc);
create index if not exists idx_posts_user_id on posts(user_id);
create index if not exists idx_post_likes_post_id on post_likes(post_id);
create index if not exists idx_post_comments_post_id on post_comments(post_id);
create index if not exists idx_follows_follower_id on follows(follower_id);
create index if not exists idx_follows_following_id on follows(following_id);
