-- Video / audio / reels: storage buckets, limits, and tables for Flight Club.
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT / DROP POLICY IF EXISTS where needed.

-- ---------------------------------------------------------------------------
-- MIME allowlists (explicit types; Supabase validates uploads when set)
-- ---------------------------------------------------------------------------
-- Images + video (social, room posts, DMs, reels) + audio (future crew tools)

-- ~200 MiB for short reels / HD clips (tune in dashboard if needed)
-- 52428800 = 50 MiB (previous room-posts default)

-- ---------------------------------------------------------------------------
-- 1) post-media (social feed) — create or widen for video + audio
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-media',
  'post-media',
  true,
  209715200,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp',
    'audio/mpeg', 'audio/mp4', 'audio/mp3', 'audio/wav', 'audio/x-m4a', 'audio/webm', 'audio/aac'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "post_media_public_select" ON storage.objects;
DROP POLICY IF EXISTS "post_media_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "post_media_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "post_media_owner_delete" ON storage.objects;

CREATE POLICY "post_media_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-media');

CREATE POLICY "post_media_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'post-media');

CREATE POLICY "post_media_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'post-media' AND owner_id::text = auth.uid()::text)
  WITH CHECK (bucket_id = 'post-media' AND owner_id::text = auth.uid()::text);

CREATE POLICY "post_media_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'post-media' AND owner_id::text = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 2) reels-media — optional dedicated prefix in app: reels/{user_id}/...
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reels-media',
  'reels-media',
  true,
  209715200,
  ARRAY[
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp',
    'image/jpeg', 'image/png', 'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "reels_media_public_select" ON storage.objects;
DROP POLICY IF EXISTS "reels_media_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "reels_media_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "reels_media_owner_delete" ON storage.objects;

CREATE POLICY "reels_media_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'reels-media');

CREATE POLICY "reels_media_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reels-media');

CREATE POLICY "reels_media_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'reels-media' AND owner_id::text = auth.uid()::text)
  WITH CHECK (bucket_id = 'reels-media' AND owner_id::text = auth.uid()::text);

CREATE POLICY "reels_media_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'reels-media' AND owner_id::text = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 3) crew-tools-audio — future voice notes / tool audio (user-scoped paths)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crew-tools-audio',
  'crew-tools-audio',
  true,
  52428800,
  ARRAY[
    'audio/mpeg', 'audio/mp4', 'audio/mp3', 'audio/wav', 'audio/x-m4a', 'audio/webm', 'audio/aac', 'audio/ogg'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "crew_tools_audio_public_select" ON storage.objects;
DROP POLICY IF EXISTS "crew_tools_audio_insert_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "crew_tools_audio_update_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "crew_tools_audio_delete_own_folder" ON storage.objects;

CREATE POLICY "crew_tools_audio_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'crew-tools-audio');

CREATE POLICY "crew_tools_audio_insert_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'crew-tools-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "crew_tools_audio_update_own_folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'crew-tools-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'crew-tools-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "crew_tools_audio_delete_own_folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'crew-tools-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 4) room-posts bucket — allow video MIME types + larger files
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
SET
  file_size_limit = 209715200,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp'
  ]::text[]
WHERE id = 'room-posts';

-- ---------------------------------------------------------------------------
-- 5) messages-media (DMs) — size + MIME for video / short audio snippets
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
SET
  file_size_limit = 209715200,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp',
    'audio/mpeg', 'audio/mp4', 'audio/mp3', 'audio/wav', 'audio/x-m4a', 'audio/webm', 'audio/aac'
  ]::text[]
WHERE id = 'messages-media';

-- ---------------------------------------------------------------------------
-- 6) Social posts — duration for video/reel playback UI
-- ---------------------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS duration_seconds numeric(10, 2);

COMMENT ON COLUMN public.posts.duration_seconds IS 'Primary video/reel duration in seconds when media_type is video or reel.';

-- ---------------------------------------------------------------------------
-- 7) Room posts — poster frame for video
-- ---------------------------------------------------------------------------
ALTER TABLE public.room_posts
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

COMMENT ON COLUMN public.room_posts.thumbnail_url IS 'Optional preview image URL for video posts (first frame or custom).';

-- ---------------------------------------------------------------------------
-- 8) Reels table — short-form vertical video metadata (links to optional feed post)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.posts (id) ON DELETE SET NULL,
  video_url text NOT NULL,
  thumbnail_url text,
  duration_seconds numeric(10, 2),
  width int,
  height int,
  caption text,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reels_user_created ON public.reels (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reels_post_id ON public.reels (post_id) WHERE post_id IS NOT NULL;

ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reels_select_public_or_own" ON public.reels;
DROP POLICY IF EXISTS "reels_insert_own" ON public.reels;
DROP POLICY IF EXISTS "reels_update_own" ON public.reels;
DROP POLICY IF EXISTS "reels_delete_own" ON public.reels;

CREATE POLICY "reels_select_public_or_own"
  ON public.reels FOR SELECT
  USING (
    visibility = 'public'
    OR user_id = auth.uid()
  );

CREATE POLICY "reels_insert_own"
  ON public.reels FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "reels_update_own"
  ON public.reels FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "reels_delete_own"
  ON public.reels FOR DELETE
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 9) Crew tool audio assets — future features (memo, schedule, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_tool_audio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  bucket_id text NOT NULL DEFAULT 'crew-tools-audio',
  storage_path text NOT NULL,
  public_url text,
  mime_type text NOT NULL,
  duration_seconds numeric(10, 2),
  title text,
  tool_context text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_crew_tool_audio_user_created
  ON public.crew_tool_audio_assets (user_id, created_at DESC);

ALTER TABLE public.crew_tool_audio_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crew_tool_audio_select_own" ON public.crew_tool_audio_assets;
DROP POLICY IF EXISTS "crew_tool_audio_insert_own" ON public.crew_tool_audio_assets;
DROP POLICY IF EXISTS "crew_tool_audio_update_own" ON public.crew_tool_audio_assets;
DROP POLICY IF EXISTS "crew_tool_audio_delete_own" ON public.crew_tool_audio_assets;

CREATE POLICY "crew_tool_audio_select_own"
  ON public.crew_tool_audio_assets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "crew_tool_audio_insert_own"
  ON public.crew_tool_audio_assets FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "crew_tool_audio_update_own"
  ON public.crew_tool_audio_assets FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "crew_tool_audio_delete_own"
  ON public.crew_tool_audio_assets FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE public.reels IS 'Short-form video metadata; video files live in reels-media or post-media.';
COMMENT ON TABLE public.crew_tool_audio_assets IS 'Registry for future crew-tool audio clips stored in crew-tools-audio bucket.';
