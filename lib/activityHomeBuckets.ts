/**
 * Buckets for the Home "Activity" dashboard (2×2 tiles). Aligns with notification
 * filters in `app/notifications.tsx` where possible.
 */
export type HomeActivityBucket = 'social' | 'trades' | 'housing' | 'crew';

const SOCIAL_TYPES = new Set([
  'follow',
  'follow_request',
  'follow_accept',
  'post_like',
  'like_post',
  'post_comment',
  'comment_post',
  'comment_reply',
  'reply_comment',
  'mention_post',
  'mention_comment',
  'mention',
  'repost_post',
  'profile_tag',
  'message',
  'message_request',
  'message_request_accepted',
  'message_reaction',
  'message_media',
  'dm_share_post',
  'dm_share_media',
]);

const TRADES_TYPES = new Set([
  'trade_interest',
  'trade_match',
  'trade_message',
  'trade_update',
  'trade_closed',
  'trade_expiring',
  'load_request',
  'load_match',
  'standby_match',
  'saved_search_match',
  'housing_listing_saved_match',
  'housing_availability_match',
]);

const HOUSING_TYPES = new Set([
  'housing_reply',
  'listing_reply',
  'housing_message',
  'housing_inquiry',
]);

/** Crew rooms, room posts, invites — not DMs (those are under social for home tiles). */
const CREW_TYPES = new Set([
  'crew_room_reply',
  'crew_room_mention',
  'crew_room_invite',
  'crew_invite',
  'room_post',
  'room_mention',
  'room_invite',
  'room_join_request',
  'room_join_approved',
  'room_join_denied',
  'room_role_changed',
  'room_announcement',
  'room_pinned_post',
]);

export function homeActivityBucket(type: string): HomeActivityBucket {
  const t = (type || '').trim();
  if (SOCIAL_TYPES.has(t)) return 'social';
  if (TRADES_TYPES.has(t)) return 'trades';
  if (HOUSING_TYPES.has(t)) return 'housing';
  if (CREW_TYPES.has(t)) return 'crew';
  if (t === 'system_announcement') return 'social';
  return 'crew';
}

export function isNotificationUnreadRow(n: { is_read?: boolean; read?: boolean }): boolean {
  if (typeof n.is_read === 'boolean') return !n.is_read;
  if (typeof n.read === 'boolean') return !n.read;
  return true;
}
