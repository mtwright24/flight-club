/**
 * Canonical notification type registry — single source of truth for metadata and route resolution.
 * Preference toggles in the DB remain unchanged; categories map onto existing columns in `shouldSendPush`.
 */

export type NotificationRegistryCategory =
  | 'social'
  | 'messages'
  | 'rooms'
  | 'trades'
  | 'housing'
  | 'alerts'
  | 'career'
  | 'account'
  | 'system';

export type NotificationPriority = 'high' | 'medium' | 'low';

/** Minimal fields needed to resolve a deep link (avoids circular imports with `notifications.ts`). */
export type NotificationRouteContext = {
  type: string;
  entity_type: string;
  entity_id: string;
  secondary_id?: string | null;
  data?: unknown;
};

export type NotificationRegistryEntry = {
  category: NotificationRegistryCategory;
  priority: NotificationPriority;
  /** When false, push is suppressed regardless of user preferences. */
  pushEligible: boolean;
  resolveRoute: (n: NotificationRouteContext) => string;
};

const enc = (id: string) => encodeURIComponent(id);

const routePost = (n: NotificationRouteContext) => `/post/${n.entity_id}`;
const routeProfile = (n: NotificationRouteContext) => `/profile/${enc(n.entity_id)}`;
const routeDm = (n: NotificationRouteContext) => `/dm-thread?conversationId=${enc(n.entity_id)}`;
const routeCrewRoom = (n: NotificationRouteContext) => `/crew-rooms/${enc(n.entity_id)}`;
const routeRoomPostDetail = (n: NotificationRouteContext) =>
  `/room-post-detail?postId=${enc(n.entity_id)}`;
const routeTrade = (n: NotificationRouteContext) => `/crew-exchange/${enc(n.entity_id)}`;
const routeExchangeHub = () => '/exchange';
const routeHousingHub = () => '/(screens)/crashpads';
const routeHousingDetail = (n: NotificationRouteContext) =>
  `/(screens)/crashpads-detail?id=${enc(n.entity_id)}`;
const routeLoadsHub = () => '/loads';
const routeLoadDetail = (n: NotificationRouteContext) => `/load-details/${enc(n.entity_id)}`;
const routeNonRev = () => '/non-rev-loads';
const routeCrewTools = () => '/(tabs)/crew-tools';
const routeCrewSchedule = () => '/crew-schedule';
const routeAccountSettings = () => '/account-settings';
const routeEditProfile = () => '/edit-profile';
const routeMessagesInbox = () => '/messages-inbox';
const routeNotifications = () => '/notifications';

/** Legacy DB / call-site type strings → canonical registry keys. */
export const LEGACY_NOTIFICATION_TYPE_ALIASES: Record<string, NotificationTypeKey> = {
  dm: 'message',
  post_like: 'like_post',
  post_comment: 'comment_post',
  comment_reply: 'reply_comment',
  crew_room_mention: 'room_mention',
  crew_room_invite: 'room_invite',
  crew_invite: 'room_invite',
  crew_room_post: 'room_post',
  mention: 'mention_post',
  listing_reply: 'housing_reply',
  housing_message: 'housing_inquiry',
  housing_alert: 'housing_listing_saved_match',
  saved_search_match: 'housing_listing_saved_match',
  standby_match: 'housing_availability_match',
  social_like: 'like_post',
  social_comment: 'comment_post',
  social_follow: 'follow',
  swap_match: 'trade_match',
};

export type NotificationTypeKey =
  | 'like_post'
  | 'comment_post'
  | 'reply_comment'
  | 'mention_post'
  | 'mention_comment'
  | 'follow'
  | 'follow_request'
  | 'follow_accept'
  | 'repost_post'
  | 'profile_tag'
  | 'message'
  | 'message_request'
  | 'message_request_accepted'
  | 'message_reaction'
  | 'message_media'
  | 'room_post'
  | 'crew_room_reply'
  | 'room_mention'
  | 'room_invite'
  | 'room_join_request'
  | 'room_join_approved'
  | 'room_join_denied'
  | 'room_role_changed'
  | 'room_announcement'
  | 'room_pinned_post'
  | 'trade_interest'
  | 'trade_match'
  | 'trade_message'
  | 'trade_update'
  | 'trade_closed'
  | 'trade_expiring'
  | 'swap_signal_near_match'
  | 'housing_inquiry'
  | 'housing_reply'
  | 'housing_listing_saved_match'
  | 'housing_listing_update'
  | 'housing_listing_expiring'
  | 'housing_availability_match'
  | 'housing_application_update'
  | 'loads_alert'
  | 'loads_route_update'
  | 'loads_watch_match'
  | 'loads_threshold_hit'
  | 'tool_alert'
  | 'schedule_reminder'
  | 'rest_warning'
  | 'calendar_event'
  | 'contract_alert'
  | 'document_ready'
  | 'scan_complete'
  | 'profile_verification'
  | 'application_update'
  | 'resume_feedback'
  | 'account_warning'
  | 'account_success'
  | 'system_announcement'
  | 'feature_launch'
  | 'maintenance_notice'
  | 'policy_update'
  | 'security_alert';

export const NOTIFICATION_REGISTRY: Record<NotificationTypeKey, NotificationRegistryEntry> = {
  // Social
  like_post: {
    category: 'social',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routePost,
  },
  comment_post: {
    category: 'social',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routePost,
  },
  reply_comment: {
    category: 'social',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routePost,
  },
  mention_post: {
    category: 'social',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routePost,
  },
  mention_comment: {
    category: 'social',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routePost,
  },
  follow: {
    category: 'social',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeProfile,
  },
  follow_request: {
    category: 'social',
    priority: 'high',
    pushEligible: true,
    resolveRoute: routeProfile,
  },
  follow_accept: {
    category: 'social',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeProfile,
  },
  repost_post: {
    category: 'social',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routePost,
  },
  profile_tag: {
    category: 'social',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeProfile,
  },
  // Messages
  message: {
    category: 'messages',
    priority: 'high',
    pushEligible: true,
    resolveRoute: routeDm,
  },
  message_request: {
    category: 'messages',
    priority: 'high',
    pushEligible: true,
    resolveRoute: routeDm,
  },
  message_request_accepted: {
    category: 'messages',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeMessagesInbox,
  },
  message_reaction: {
    category: 'messages',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeDm,
  },
  message_media: {
    category: 'messages',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeDm,
  },
  // Rooms
  room_post: {
    category: 'rooms',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeRoomPostDetail,
  },
  crew_room_reply: {
    category: 'rooms',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeRoomPostDetail,
  },
  room_mention: {
    category: 'rooms',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeRoomPostDetail,
  },
  room_invite: {
    category: 'rooms',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeCrewRoom,
  },
  room_join_request: {
    category: 'rooms',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeCrewRoom,
  },
  room_join_approved: {
    category: 'rooms',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeCrewRoom,
  },
  room_join_denied: {
    category: 'rooms',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeCrewRoom,
  },
  room_role_changed: {
    category: 'rooms',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeCrewRoom,
  },
  room_announcement: {
    category: 'rooms',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeCrewRoom,
  },
  room_pinned_post: {
    category: 'rooms',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeRoomPostDetail,
  },
  // Trades
  trade_interest: {
    category: 'trades',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeTrade(n) : routeExchangeHub()),
  },
  trade_match: {
    category: 'trades',
    priority: 'high',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeTrade(n) : routeExchangeHub()),
  },
  trade_message: {
    category: 'trades',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeTrade(n) : routeExchangeHub()),
  },
  trade_update: {
    category: 'trades',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeTrade(n) : routeExchangeHub()),
  },
  trade_closed: {
    category: 'trades',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeTrade(n) : routeExchangeHub()),
  },
  trade_expiring: {
    category: 'trades',
    priority: 'high',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeTrade(n) : routeExchangeHub()),
  },
  swap_signal_near_match: {
    category: 'trades',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeExchangeHub,
  },
  // Housing
  housing_inquiry: {
    category: 'housing',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeHousingDetail(n) : routeHousingHub()),
  },
  housing_reply: {
    category: 'housing',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeHousingDetail(n) : routeHousingHub()),
  },
  housing_listing_saved_match: {
    category: 'housing',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeHousingDetail(n) : routeHousingHub()),
  },
  housing_listing_update: {
    category: 'housing',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeHousingDetail(n) : routeHousingHub()),
  },
  housing_listing_expiring: {
    category: 'housing',
    priority: 'high',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeHousingDetail(n) : routeHousingHub()),
  },
  housing_availability_match: {
    category: 'housing',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeHousingDetail(n) : routeHousingHub()),
  },
  housing_application_update: {
    category: 'housing',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeHousingHub,
  },
  // Alerts / tools / loads
  loads_alert: {
    category: 'alerts',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeLoadDetail(n) : routeLoadsHub()),
  },
  loads_route_update: {
    category: 'alerts',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeLoadDetail(n) : routeLoadsHub()),
  },
  loads_watch_match: {
    category: 'alerts',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeLoadDetail(n) : routeLoadsHub()),
  },
  loads_threshold_hit: {
    category: 'alerts',
    priority: 'high',
    pushEligible: true,
    resolveRoute: (n) => (n.entity_id ? routeLoadDetail(n) : routeLoadsHub()),
  },
  tool_alert: {
    category: 'alerts',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeCrewTools,
  },
  schedule_reminder: {
    category: 'alerts',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeCrewSchedule,
  },
  rest_warning: {
    category: 'alerts',
    priority: 'high',
    pushEligible: true,
    resolveRoute: routeCrewTools,
  },
  calendar_event: {
    category: 'alerts',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeCrewSchedule,
  },
  contract_alert: {
    category: 'alerts',
    priority: 'high',
    pushEligible: true,
    resolveRoute: routeNonRev,
  },
  document_ready: {
    category: 'alerts',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeNotifications,
  },
  scan_complete: {
    category: 'alerts',
    priority: 'low',
    pushEligible: true,
    resolveRoute: routeNotifications,
  },
  // Career
  profile_verification: {
    category: 'career',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeEditProfile,
  },
  application_update: {
    category: 'career',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeNotifications,
  },
  resume_feedback: {
    category: 'career',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeNotifications,
  },
  // Account
  account_warning: {
    category: 'account',
    priority: 'high',
    pushEligible: true,
    resolveRoute: routeAccountSettings,
  },
  account_success: {
    category: 'account',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeAccountSettings,
  },
  // System
  system_announcement: {
    category: 'system',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeNotifications,
  },
  feature_launch: {
    category: 'system',
    priority: 'low',
    pushEligible: true,
    resolveRoute: routeNotifications,
  },
  maintenance_notice: {
    category: 'system',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeNotifications,
  },
  policy_update: {
    category: 'system',
    priority: 'medium',
    pushEligible: true,
    resolveRoute: routeNotifications,
  },
  security_alert: {
    category: 'system',
    priority: 'high',
    pushEligible: true,
    resolveRoute: routeAccountSettings,
  },
};

export function canonicalNotificationType(type: string): NotificationTypeKey | null {
  if (Object.prototype.hasOwnProperty.call(NOTIFICATION_REGISTRY, type)) {
    return type as NotificationTypeKey;
  }
  const mapped = LEGACY_NOTIFICATION_TYPE_ALIASES[type];
  return mapped ?? null;
}

export function resolveRouteFromRegistry(n: NotificationRouteContext): string | null {
  const key = canonicalNotificationType(n.type);
  if (!key) return null;
  return NOTIFICATION_REGISTRY[key].resolveRoute(n);
}

export function isPushEligibleForCanonicalType(type: string): boolean | null {
  const key = canonicalNotificationType(type);
  if (!key) return null;
  return NOTIFICATION_REGISTRY[key].pushEligible;
}

type PreferenceBucket = 'messages' | 'crew_rooms' | 'social' | 'housing' | 'updates';

/** Maps registry categories onto existing `notification_preferences` columns (no SQL changes). */
export function preferenceBucketForRegistryCategory(
  category: NotificationRegistryCategory
): PreferenceBucket {
  switch (category) {
    case 'social':
      return 'social';
    case 'messages':
      return 'messages';
    case 'rooms':
      return 'crew_rooms';
    case 'housing':
      return 'housing';
    default:
      return 'updates';
  }
}

export function preferenceBucketForType(type: string): PreferenceBucket | null {
  const key = canonicalNotificationType(type);
  if (!key) return null;
  return preferenceBucketForRegistryCategory(NOTIFICATION_REGISTRY[key].category);
}

/**
 * Layer-B category chips (under All / Unread). Social / feed / system types only match `all`.
 */
export type NotificationCategoryChip = 'all' | 'messages' | 'crew_rooms' | 'tradeboard' | 'housing';

const CHIP_MESSAGES = new Set([
  'message',
  'message_request',
  'message_request_accepted',
  'message_reaction',
  'message_media',
  'dm_share_post',
  'dm_share_media',
]);

/** Crew-room activity: matches registry `rooms` + legacy strings used in DB / RPCs. */
const CHIP_CREW_ROOMS = new Set([
  'room_post',
  'crew_room_reply',
  'crew_room_invite',
  'crew_invite',
  'crew_room_mention',
  'room_join_request',
  'room_join_approved',
  'room_join_denied',
  'room_role_changed',
  'room_announcement',
]);

const CHIP_HOUSING_LEGACY = new Set([
  'housing_reply',
  'listing_reply',
  'housing_message',
  'saved_search_match',
  'standby_match',
  'crashpad_match',
  'housing_alert',
]);

function registryCategoryForType(type: string): NotificationRegistryCategory | null {
  const key = canonicalNotificationType(type);
  if (!key) return null;
  return NOTIFICATION_REGISTRY[key].category;
}

/**
 * Layer-B chip filter. Uses canonical registry categories + explicit legacy type strings from this app.
 */
export function notificationMatchesCategoryChip(chip: NotificationCategoryChip, type: string): boolean {
  if (chip === 'all') return true;
  const t = (type || '').trim();
  const reg = registryCategoryForType(t);

  if (chip === 'messages') {
    if (CHIP_MESSAGES.has(t)) return true;
    return reg === 'messages';
  }
  if (chip === 'crew_rooms') {
    if (CHIP_CREW_ROOMS.has(t)) return true;
    return reg === 'rooms';
  }
  if (chip === 'tradeboard') {
    return reg === 'trades';
  }
  if (chip === 'housing') {
    if (CHIP_HOUSING_LEGACY.has(t)) return true;
    return reg === 'housing';
  }
  return true;
}

/** @deprecated Prefer notificationMatchesCategoryChip — kept for any external imports. */
export type NotificationInboxFilter = 'all' | 'social' | 'messages' | 'housing';

/** @deprecated */
export function notificationMatchesInboxFilter(filter: NotificationInboxFilter, type: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'messages') return notificationMatchesCategoryChip('messages', type);
  if (filter === 'housing') return notificationMatchesCategoryChip('housing', type);
  if (filter === 'social') {
    const reg = registryCategoryForType(type);
    return reg === 'social' || reg === 'rooms';
  }
  return true;
}
