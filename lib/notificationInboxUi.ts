import type { Notification } from './notifications';
import { parseNotificationData } from './notifications';
import { canonicalNotificationType, NOTIFICATION_REGISTRY } from './notificationRegistry';

export function notificationIsRead(n: Notification): boolean {
  if (typeof n.is_read === 'boolean') return n.is_read;
  if (typeof n.read === 'boolean') return n.read;
  return false;
}

function pickNonEmptyString(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === 'string') {
      const t = c.trim();
      if (t) return t;
    }
  }
  return '';
}

/**
 * Best-effort actor label: embedded profile, then JSON payload hints (push/server may set these).
 */
export function getActorDisplayName(n: Notification): string {
  const data = parseNotificationData(n) as Record<string, unknown>;
  const fromJson = pickNonEmptyString(
    data.actor_display_name,
    data.actor_name,
    data.sender_name,
    data.sender_display_name,
    data.from_name,
    data.from_display_name
  );
  const act = n.actor;
  const fromProfile = pickNonEmptyString(act?.display_name, act?.full_name);
  return fromProfile || fromJson;
}

/** Avatar URL: embedded actor, then notification `data` fallbacks (DM / push). */
export function getActorAvatarUri(n: Notification): string | null {
  const fromActor = pickNonEmptyString(n.actor?.avatar_url);
  if (fromActor) return fromActor;
  const d = parseNotificationData(n) as Record<string, unknown>;
  return (
    pickNonEmptyString(
      d.actor_avatar_url,
      d.sender_avatar_url,
      d.sender_avatar,
      d.avatar_url
    ) || null
  );
}

function actorNameOrSomeone(n: Notification): string {
  return getActorDisplayName(n) || 'Someone';
}

/** Crew-room invite rows stored as whitelisted `room_post` + `data.room_invite` (RPC allowlist). */
function isRoomInviteRoomPost(n: Notification): boolean {
  if (n.type !== 'room_post') return false;
  const d = parseNotificationData(n) as Record<string, unknown>;
  return d.room_invite === true;
}

/** Short label for top-right of row (5m, 4h, 3d — compact). */
export function formatNotificationTimeShort(iso: string): string {
  const date = new Date(iso || 0);
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: '2-digit' }),
  });
}

/**
 * Facebook-style primary line: bold real name + regular action suffix when we know both.
 */
export function getNotificationRowPrimary(
  n: Notification
):
  | { mode: 'split'; name: string; rest: string }
  | { mode: 'plain'; text: string } {
  const name = getActorDisplayName(n);
  const rest = isRoomInviteRoomPost(n)
    ? ' invited you to a crew room'
    : actionSuffixForNotificationType(n.type);
  if (name && rest !== null) {
    return { mode: 'split', name, rest };
  }
  const { primary } = getNotificationDisplayLines(n);
  return { mode: 'plain', text: primary };
}

/** Returns suffix after actor name, or null if the line should not be split. */
function actionSuffixForNotificationType(type: string): string | null {
  switch (type) {
    case 'like_post':
    case 'post_like':
      return ' liked your post';
    case 'comment_post':
    case 'post_comment':
      return ' commented on your post';
    case 'comment_reply':
    case 'reply_comment':
      return ' replied to your comment';
    case 'crew_room_reply':
      return ' replied in your crew room';
    case 'room_post':
      return ' posted in your crew room';
    case 'follow':
      return ' started following you';
    case 'follow_request':
      return ' requested to follow you';
    case 'follow_accept':
      return ' accepted your follow request';
    case 'room_invite':
    case 'crew_invite':
    case 'crew_room_invite':
      return ' invited you to a crew room';
    case 'crew_room_mention':
    case 'mention':
    case 'mention_post':
    case 'mention_comment':
      return ' mentioned you';
    case 'message':
      return ' sent you a message';
    case 'message_request':
      return ' wants to message you';
    case 'dm_share_post':
      return ' shared a post with you';
    case 'dm_share_media':
      return ' shared media with you';
    case 'housing_reply':
    case 'listing_reply':
      return ' replied to your listing';
    case 'housing_message':
      return ' messaged you about housing';
    default:
      return null;
  }
}

/**
 * Bold primary line + optional secondary snippet (body / preview).
 */
export function getNotificationDisplayLines(n: Notification): { primary: string; secondary: string | null } {
  const who = actorNameOrSomeone(n);
  const body = (n.body || '').trim();
  const title = (n.title || '').trim();
  const type = n.type;

  const lineForType = (): string => {
    switch (type) {
      case 'like_post':
      case 'post_like':
        return `${who} liked your post`;
      case 'comment_post':
      case 'post_comment':
        return `${who} commented on your post`;
      case 'comment_reply':
      case 'reply_comment':
        return `${who} replied to your comment`;
      case 'crew_room_reply':
        return `${who} replied in your crew room`;
      case 'room_post':
        return isRoomInviteRoomPost(n) ? `${who} invited you to a crew room` : `${who} posted in your crew room`;
      case 'follow':
        return `${who} started following you`;
      case 'follow_request':
        return `${who} requested to follow you`;
      case 'follow_accept':
        return `${who} accepted your follow request`;
      case 'room_invite':
      case 'crew_invite':
      case 'crew_room_invite':
        return `${who} invited you to a crew room`;
      case 'crew_room_mention':
      case 'mention':
      case 'mention_post':
      case 'mention_comment':
        return `${who} mentioned you`;
      case 'message':
        return `${who} sent you a message`;
      case 'message_request':
        return `${who} wants to message you`;
      case 'dm_share_post':
        return `${who} shared a post with you`;
      case 'dm_share_media':
        return `${who} shared media with you`;
      case 'housing_reply':
      case 'listing_reply':
        return title || `${who} replied to your listing`;
      case 'housing_message':
        return title || `${who} messaged you about housing`;
      case 'saved_search_match':
        return title || 'New listing match';
      case 'standby_match':
        return title || 'Standby match available';
      case 'system_announcement':
        return title || 'Flight Club update';
      default: {
        const key = canonicalNotificationType(type);
        if (key === 'trade_match' || key === 'trade_interest') return title || 'Trade activity';
        if (key === 'swap_signal_near_match') return title || 'Swap signal near you';
        if (key === 'tool_alert' || key === 'schedule_reminder') return title || 'Crew tools update';
        if (key === 'loads_alert' || key === 'loads_watch_match' || key === 'loads_route_update' || key === 'loads_threshold_hit')
          return title || 'Loads update';
        if (key === 'staff_loads_request_answered') return title || 'Your load request was answered';
        if (key === 'staff_loads_request_loads_updated') return title || 'New loads on your request';
        if (key === 'staff_loads_request_status') return title || 'Status update on your request';
        if (key === 'staff_loads_request_refresh') return title || 'Your request needs a refresh';
        if (key === 'staff_loads_lock_expiring') return title || 'Answer lock expiring';
        return title || body || 'New notification';
      }
    }
  };

  let primary = lineForType();
  let secondary: string | null = null;

  if (type === 'message' && body) {
    primary = `${who} sent you a message`;
    secondary = body;
  } else if (type === 'room_post' || type === 'crew_room_reply') {
    if (body) secondary = body;
  } else if (type === 'comment_post' || type === 'post_comment' || type === 'comment_reply') {
    if (body) secondary = body;
  } else if (!title && body && primary !== body) {
    secondary = body;
  } else if (title && body && title !== body && !['message', 'system_announcement'].includes(type)) {
    secondary = body;
  }

  const data = parseNotificationData(n);
  const preview = typeof data.preview === 'string' ? data.preview.trim() : '';
  if (preview && !secondary) secondary = preview;

  return { primary, secondary: secondary || null };
}

export function getNotificationThumbnailUri(n: Notification): string | null {
  const data = parseNotificationData(n);
  const d = data as Record<string, unknown>;
  const candidates = [d.thumbnail, d.thumbnail_url, d.image_url, d.preview_url, d.listing_image_url];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().startsWith('http')) return c.trim();
  }
  return null;
}

export type RowVisualKind = 'avatar' | 'housing' | 'trade' | 'tools' | 'system';

export function notificationRowVisualKind(n: Notification): RowVisualKind {
  const key = canonicalNotificationType(n.type);
  if (key) {
    const cat = NOTIFICATION_REGISTRY[key].category;
    if (cat === 'housing') return 'housing';
    if (cat === 'trades') return 'trade';
    if (cat === 'alerts') return 'tools';
    if (cat === 'system') return 'system';
  }
  if (
    ['housing_reply', 'listing_reply', 'housing_message', 'saved_search_match', 'standby_match'].includes(n.type)
  ) {
    return 'housing';
  }
  return 'avatar';
}

/** Small overlay badge on avatar for crew-room activity (mockup-style). */
export function notificationAvatarBadge(n: Notification): 'crew' | 'housing' | 'none' {
  const key = canonicalNotificationType(n.type);
  if (key && NOTIFICATION_REGISTRY[key].category === 'rooms') {
    return 'crew';
  }
  if (notificationRowVisualKind(n) === 'housing') {
    return 'housing';
  }
  return 'none';
}

export function shouldOfferFollowBack(n: Notification): boolean {
  if (!n.actor_id) return false;
  return n.type === 'follow' || n.type === 'follow_request';
}
