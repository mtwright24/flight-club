import { supabase } from '../src/lib/supabaseClient';
import {
  LEGACY_NOTIFICATION_TYPE_ALIASES,
  NOTIFICATION_REGISTRY,
  type NotificationRegistryCategory,
  type NotificationTypeKey,
} from './notificationRegistry';

export const TOP_BLOCK_SECTIONS = [
  'message-requests',
  'crew-invites',
  'trade-matches',
  'housing-alerts',
] as const;

export type TopBlockSection = (typeof TOP_BLOCK_SECTIONS)[number];

export function isTopBlockSection(s: string | string[] | undefined): s is TopBlockSection {
  const v = Array.isArray(s) ? s[0] : s;
  return !!v && (TOP_BLOCK_SECTIONS as readonly string[]).includes(v);
}

export type TopBlockCounts = {
  messageRequests: number;
  crewRoomInvites: number;
  tradeMatches: number;
  housingAlerts: number;
};

function keysForRegistryCategory(cat: NotificationRegistryCategory): NotificationTypeKey[] {
  return (Object.keys(NOTIFICATION_REGISTRY) as NotificationTypeKey[]).filter(
    (k) => NOTIFICATION_REGISTRY[k].category === cat
  );
}

/** Every `notifications.type` string that should match a set of canonical registry keys (canonical + legacy aliases). */
export function expandCanonicalToDbStrings(canonicalKeys: NotificationTypeKey[]): string[] {
  const set = new Set<string>();
  for (const k of canonicalKeys) set.add(k);
  for (const [legacy, canon] of Object.entries(LEGACY_NOTIFICATION_TYPE_ALIASES)) {
    if (canonicalKeys.includes(canon as NotificationTypeKey)) set.add(legacy);
  }
  return [...set];
}

export function rawDbTypesForNotificationsSubsection(
  section: Exclude<TopBlockSection, 'message-requests'>
): string[] {
  switch (section) {
    case 'crew-invites':
      return expandCanonicalToDbStrings(['room_invite', 'room_join_request']);
    case 'trade-matches':
      return expandCanonicalToDbStrings(keysForRegistryCategory('trades'));
    case 'housing-alerts':
      return expandCanonicalToDbStrings(keysForRegistryCategory('housing'));
    default:
      return [];
  }
}

/** One inbox row per conversation with at least one pending request to this user. */
export async function countPendingMessageRequestInboxRows(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('dm_message_requests')
    .select('conversation_id')
    .eq('to_user_id', userId)
    .eq('status', 'pending');

  if (error || !data?.length) return 0;
  return new Set((data as { conversation_id: string }[]).map((r) => String(r.conversation_id))).size;
}

async function countUnreadNotificationsByTypes(userId: string, types: string[]): Promise<number> {
  if (!types.length) return 0;
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .in('type', types);

  if (error) {
    if (__DEV__) console.warn('[TopBlocks] countUnreadNotificationsByTypes:', error.message);
    return 0;
  }
  return count ?? 0;
}

export async function fetchTopBlockCounts(userId: string): Promise<TopBlockCounts> {
  const crewTypes = rawDbTypesForNotificationsSubsection('crew-invites');
  const tradeTypes = rawDbTypesForNotificationsSubsection('trade-matches');
  const housingTypes = rawDbTypesForNotificationsSubsection('housing-alerts');

  const [messageRequests, crewRoomInvites, tradeMatches, housingAlerts] = await Promise.all([
    countPendingMessageRequestInboxRows(userId),
    countUnreadNotificationsByTypes(userId, crewTypes),
    countUnreadNotificationsByTypes(userId, tradeTypes),
    countUnreadNotificationsByTypes(userId, housingTypes),
  ]);

  return { messageRequests, crewRoomInvites, tradeMatches, housingAlerts };
}

export function topBlockSectionTitle(section: TopBlockSection): string {
  switch (section) {
    case 'message-requests':
      return 'Message Requests';
    case 'crew-invites':
      return 'Crew Room Invites';
    case 'trade-matches':
      return 'Trade Matches';
    case 'housing-alerts':
      return 'Housing Alerts';
  }
}

export function topBlockSectionEmptyMessage(section: TopBlockSection): string {
  switch (section) {
    case 'message-requests':
      return 'No message requests right now.';
    case 'crew-invites':
      return 'No crew room invites right now.';
    case 'trade-matches':
      return 'No trade matches right now.';
    case 'housing-alerts':
      return 'No housing alerts right now.';
  }
}
