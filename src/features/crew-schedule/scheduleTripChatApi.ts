import { createNotification } from '../../../lib/notifications';
import { supabase } from '../../lib/supabaseClient';

export type ScheduleTripChatMessage = {
  id: string;
  trip_id: string;
  user_id: string;
  text: string;
  created_at: string;
  expires_at: string;
};

/** Shared thread UUID for this trip_group (same for all crew on the same pairing dates). */
export async function resolveTripChatThreadId(tripGroupId: string): Promise<string> {
  const { data, error } = await supabase.rpc('schedule_trip_chat_thread_uuid_for_group', {
    p_trip_group_id: tripGroupId,
  });
  if (error) {
    console.warn('[TripChat] resolveTripChatThreadId:', error.message);
    return tripGroupId;
  }
  if (data == null) return tripGroupId;
  return String(data);
}

export async function fetchTripChatMessages(tripId: string): Promise<ScheduleTripChatMessage[]> {
  const { data, error } = await supabase
    .from('schedule_trip_chat_messages')
    .select('id, trip_id, user_id, text, created_at, expires_at')
    .eq('trip_id', tripId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data || []) as ScheduleTripChatMessage[];
}

export async function insertTripChatMessage(params: {
  tripId: string;
  userId: string;
  text: string;
  /** ISO — must be trip window end + 24h; must be in the future for RLS */
  roomExpiresAtIso: string;
}): Promise<ScheduleTripChatMessage | null> {
  const { data, error } = await supabase
    .from('schedule_trip_chat_messages')
    .insert({
      trip_id: params.tripId,
      user_id: params.userId,
      text: params.text.trim(),
      expires_at: params.roomExpiresAtIso,
    })
    .select('id, trip_id, user_id, text, created_at, expires_at')
    .single();

  if (error) throw error;
  return data as ScheduleTripChatMessage;
}

/** Notify other crew on the same trip thread (RPC is security definer). */
export async function notifyScheduleTripChatPeers(params: {
  threadUuid: string;
  pairingLabel: string;
  preview: string;
}): Promise<void> {
  const { data, error } = await supabase.rpc('schedule_trip_chat_peers_for_notify', {
    p_thread_uuid: params.threadUuid,
  });
  if (error) {
    if (__DEV__) console.warn('[TripChat] peers RPC:', error.message);
    return;
  }
  const rows = (data || []) as { peer_user_id?: string; peer_trip_group_id?: string }[];
  if (!rows.length) return;

  const preview =
    params.preview.length > 140 ? `${params.preview.slice(0, 137)}…` : params.preview;

  await Promise.all(
    rows
      .filter((r) => r.peer_user_id && r.peer_trip_group_id)
      .map((row) =>
        createNotification({
          user_id: String(row.peer_user_id),
          actor_id: String(row.peer_user_id),
          type: 'schedule_trip_chat_message',
          entity_type: 'schedule_trip_chat',
          entity_id: params.threadUuid,
          title: params.pairingLabel,
          body: preview,
          data: {
            route: `/crew-schedule/trip-chat?tripId=${encodeURIComponent(String(row.peer_trip_group_id))}`,
            trip_group_id: String(row.peer_trip_group_id),
            thread_uuid: params.threadUuid,
          },
        })
      )
  ).catch(() => {});
}
