import { supabase } from '../supabaseClient';

export async function getConnectionStatus(currentUserId: string, targetUserId: string): Promise<'none' | 'pending' | 'accepted' | 'rejected'> {
  const { data, error } = await supabase
    .from('user_connections')
    .select('status')
    .or(`user_id_1.eq.${currentUserId},user_id_2.eq.${currentUserId}`)
    .or(`user_id_1.eq.${targetUserId},user_id_2.eq.${targetUserId}`)
    .single();
  if (error || !data) return 'none';
  return data.status;
}

export async function requestConnection(currentUserId: string, targetUserId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_connections')
    .insert({ user_id_1: currentUserId, user_id_2: targetUserId, status: 'pending', requested_by: currentUserId });
  return !error;
}

export async function acceptConnection(connectionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_connections')
    .update({ status: 'accepted' })
    .eq('id', connectionId);
  return !error;
}

export async function rejectConnection(connectionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_connections')
    .update({ status: 'rejected' })
    .eq('id', connectionId);
  return !error;
}

export async function getConnectionsCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('user_connections')
    .select('id', { count: 'exact', head: true })
    .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
    .eq('status', 'accepted');
  return count || 0;
}
