import { supabase } from '../../lib/supabaseClient';

export type ScheduleTripChatMessage = {
  id: string;
  trip_id: string;
  user_id: string;
  text: string;
  created_at: string;
  expires_at: string;
};

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
