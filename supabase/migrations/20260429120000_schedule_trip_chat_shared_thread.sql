-- Trip chat: shared thread id per logical pairing (month + primary pairing + date span) so crew on the
-- same trip see one room even when each user has a different schedule_entries.trip_group_id (e.g. demo copy).
-- Tightens RLS so only participants read/write; adds peer lookup for notifications.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Fixed namespace UUID (name v5) — must match app expectations; do not change after ship.
CREATE OR REPLACE FUNCTION public.schedule_trip_chat_namespace()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'a0000001-0001-5001-8001-0000000000c1'::uuid;
$$;

CREATE OR REPLACE FUNCTION public.schedule_trip_chat_primary_pairing_code(
  p_trip_group_id uuid,
  p_user_id uuid
) RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT trim(s.pairing_code)
      FROM public.schedule_entries s
      WHERE s.trip_group_id = p_trip_group_id
        AND s.user_id = p_user_id
        AND upper(trim(COALESCE(s.pairing_code, ''))) <> 'CONT'
      ORDER BY s.date ASC
      LIMIT 1
    ),
    (
      SELECT trim(s.pairing_code)
      FROM public.schedule_entries s
      WHERE s.trip_group_id = p_trip_group_id
        AND s.user_id = p_user_id
      ORDER BY s.date ASC
      LIMIT 1
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.schedule_trip_chat_thread_uuid_for_user_group(
  p_trip_group_id uuid,
  p_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_month text;
  v_pairing text;
  v_start date;
  v_end date;
  v_name text;
BEGIN
  SELECT e.month_key
    INTO v_month
  FROM public.schedule_entries e
  WHERE e.trip_group_id = p_trip_group_id
    AND e.user_id = p_user_id
  LIMIT 1;

  v_pairing := public.schedule_trip_chat_primary_pairing_code(p_trip_group_id, p_user_id);

  SELECT min(e.date), max(e.date)
    INTO v_start, v_end
  FROM public.schedule_entries e
  WHERE e.trip_group_id = p_trip_group_id
    AND e.user_id = p_user_id;

  IF v_month IS NULL OR v_pairing IS NULL OR v_pairing = '' OR v_start IS NULL OR v_end IS NULL THEN
    RETURN NULL;
  END IF;

  v_name :=
    'v1|'
    || v_month
    || '|'
    || upper(trim(v_pairing))
    || '|'
    || v_start::text
    || '|'
    || v_end::text;

  RETURN extensions.uuid_generate_v5(public.schedule_trip_chat_namespace(), v_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_trip_chat_thread_uuid_for_group(p_trip_group_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT public.schedule_trip_chat_thread_uuid_for_user_group(p_trip_group_id, auth.uid());
$$;

COMMENT ON FUNCTION public.schedule_trip_chat_thread_uuid_for_group(uuid) IS
  'Deterministic trip-chat thread UUID for the caller’s schedule block; same value for all users on the same pairing dates.';

GRANT EXECUTE ON FUNCTION public.schedule_trip_chat_thread_uuid_for_group(uuid) TO authenticated;

-- Peers (other users) on the same thread + their trip_group_id for deep links (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.schedule_trip_chat_peers_for_notify(p_thread_uuid uuid)
RETURNS TABLE (peer_user_id uuid, peer_trip_group_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_entries e
    WHERE e.user_id = me
      AND public.schedule_trip_chat_thread_uuid_for_user_group(e.trip_group_id, e.user_id) = p_thread_uuid
  ) THEN
    RAISE EXCEPTION 'Not a trip chat participant';
  END IF;

  RETURN QUERY
  SELECT DISTINCT e.user_id, e.trip_group_id
  FROM public.schedule_entries e
  WHERE public.schedule_trip_chat_thread_uuid_for_user_group(e.trip_group_id, e.user_id) = p_thread_uuid
    AND e.user_id IS DISTINCT FROM me;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_trip_chat_peers_for_notify(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_trip_chat_peers_for_notify(uuid) TO authenticated;

-- RLS: only participants (by shared thread uuid OR legacy trip_group_id = trip_id)
DROP POLICY IF EXISTS schedule_trip_chat_select ON public.schedule_trip_chat_messages;
DROP POLICY IF EXISTS schedule_trip_chat_insert ON public.schedule_trip_chat_messages;

CREATE POLICY schedule_trip_chat_select ON public.schedule_trip_chat_messages
  FOR SELECT
  TO authenticated
  USING (
    expires_at > now()
    AND EXISTS (
      SELECT 1
      FROM public.schedule_entries e
      WHERE e.user_id = auth.uid()
        AND (
          public.schedule_trip_chat_thread_uuid_for_user_group(e.trip_group_id, e.user_id)::text = trip_id
          OR e.trip_group_id::text = trip_id
        )
    )
  );

CREATE POLICY schedule_trip_chat_insert ON public.schedule_trip_chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND expires_at > now()
    AND EXISTS (
      SELECT 1
      FROM public.schedule_entries e
      WHERE e.user_id = auth.uid()
        AND (
          public.schedule_trip_chat_thread_uuid_for_user_group(e.trip_group_id, e.user_id)::text = trip_id
          OR e.trip_group_id::text = trip_id
        )
    )
  );
