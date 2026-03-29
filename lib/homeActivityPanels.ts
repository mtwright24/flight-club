/**
 * Single source of truth for Home Activity Center: three swipe panels derived from
 * recent notifications. Each card carries an Expo Router href + optional mark-read ids.
 */
import type { Href } from 'expo-router';
import type { NotificationItem } from '../components/ActivityPreview';
import { collectDistinctAvatarUris } from './homeActivityAvatars';
import {
  notificationTargetHref,
  parseNotificationData,
  type Notification,
} from './notifications';
import { homeActivityBucket, isNotificationUnreadRow } from './activityHomeBuckets';
import {
  canonicalNotificationType,
  NOTIFICATION_REGISTRY,
  type NotificationRegistryCategory,
} from './notificationRegistry';

const DM_TYPES = new Set([
  'message',
  'message_request',
  'message_request_accepted',
  'message_reaction',
  'message_media',
  'dm_share_post',
  'dm_share_media',
]);

const MENTION_ROOM_TYPES = new Set(['room_mention', 'crew_room_mention']);

export type ActivityCardModel = {
  id: string;
  label: string;
  title: string;
  subtitle?: string;
  timestamp?: string;
  detailRoute?: string;
  sparkleCount?: number;
  primaryLine?: string;
  secondaryLine?: string;
  imageUrl?: string;
  href: Href;
  markReadIds: string[];
  /** Small blue pill on featured comms hero */
  inlineCount?: number;
  /** All notification row ids this card represents (dedupe across slides; includes aggregates) */
  coversNotificationIds?: string[];
};

export type HomeActivityPanels = {
  mixedPriority: {
    featured: ActivityCardModel;
    bottomLeft: ActivityCardModel;
    bottomRight: ActivityCardModel;
  };
  messageRooms: {
    featured: ActivityCardModel;
    messageRequests: ActivityCardModel;
    crewRooms: ActivityCardModel;
  };
  toolAlerts: {
    featured: ActivityCardModel;
    housing: ActivityCardModel;
    loadsOps: ActivityCardModel;
  };
  /** Unread rows per panel scope [mixed/feed, comms/inbox, tools] — matches pager order */
  badgeByPanel: [number, number, number];
};

const HREF_NOTIFICATIONS = '/notifications' as Href;
const HREF_MESSAGES = '/messages-inbox' as Href;
const HREF_MESSAGE_REQUESTS = '/notifications/sublist/message-requests' as Href;
const HREF_CREW_ROOMS = '/(tabs)/crew-rooms' as Href;
const HREF_HOUSING = '/(screens)/crashpads' as Href;
const HREF_TRADES = '/exchange' as Href;
const HREF_LOADS = '/loads' as Href;
const HREF_CREW_TOOLS = '/(tabs)/crew-tools' as Href;

function registryCategory(type: string): NotificationRegistryCategory | null {
  const key = canonicalNotificationType(type);
  if (!key) return null;
  return NOTIFICATION_REGISTRY[key].category;
}

function coarseCategory(type: string): NotificationRegistryCategory | 'unknown' {
  const reg = registryCategory(type);
  if (reg) return reg;
  const b = homeActivityBucket(type);
  if (b === 'social') return 'social';
  if (b === 'crew') return 'rooms';
  if (b === 'trades') return 'trades';
  if (b === 'housing') return 'housing';
  return 'unknown';
}

function isSocialFeedType(type: string): boolean {
  const t = (type || '').trim();
  if (DM_TYPES.has(t)) return false;
  const c = registryCategory(t);
  if (c === 'social') return true;
  if (c) return false;
  return coarseCategory(t) === 'social' && !DM_TYPES.has(t);
}

function isMessagesType(type: string): boolean {
  const c = registryCategory(type);
  if (c === 'messages') return true;
  return DM_TYPES.has((type || '').trim());
}

function isRoomsType(type: string): boolean {
  const c = registryCategory(type);
  if (c === 'rooms') return true;
  const t = (type || '').trim();
  return t.startsWith('room_') || t.startsWith('crew_room') || t === 'crew_invite';
}

function isMentionRoomType(type: string): boolean {
  const t = (type || '').trim();
  return MENTION_ROOM_TYPES.has(t);
}

function isTradesType(type: string): boolean {
  return registryCategory(type) === 'trades' || coarseCategory(type) === 'trades';
}

function isHousingType(type: string): boolean {
  return registryCategory(type) === 'housing' || coarseCategory(type) === 'housing';
}

function isLoadsAlertType(type: string): boolean {
  return (type || '').trim().startsWith('loads_');
}

function isRestScheduleType(type: string): boolean {
  const t = (type || '').trim();
  return t === 'rest_warning' || t === 'schedule_reminder' || t === 'calendar_event';
}

function isCommuteDelayType(type: string): boolean {
  const t = (type || '').trim();
  return t.includes('commute') || t.includes('delay') || t === 'tool_alert';
}

export function inMixedScope(n: NotificationItem): boolean {
  return (
    isSocialFeedType(n.type) ||
    isRoomsType(n.type) ||
    isHousingType(n.type) ||
    isTradesType(n.type)
  );
}

export function inCommsScope(n: NotificationItem): boolean {
  return isMessagesType(n.type) || isRoomsType(n.type) || isMentionRoomType(n.type);
}

export function inToolsScope(n: NotificationItem): boolean {
  const c = registryCategory(n.type);
  return (
    isTradesType(n.type) ||
    isHousingType(n.type) ||
    c === 'alerts' ||
    isLoadsAlertType(n.type) ||
    isRestScheduleType(n.type) ||
    isCommuteDelayType(n.type)
  );
}

/** Slide 1 “mixed priority”: real activity only — social, DMs, rooms, trades, housing, loads/ops, requests. */
function slide1Eligible(n: NotificationItem): boolean {
  const t = (n.type || '').trim();
  if (t === 'message_request') return true;
  return (
    isSocialFeedType(n.type) ||
    isMessagesType(n.type) ||
    isRoomsType(n.type) ||
    isMentionRoomType(n.type) ||
    isTradesType(n.type) ||
    isHousingType(n.type) ||
    isLoadsAlertType(n.type) ||
    isRestScheduleType(n.type) ||
    isCommuteDelayType(n.type)
  );
}

function diversityKey(n: NotificationItem): string {
  const t = (n.type || '').trim();
  if (isMessagesType(n.type) || t === 'message_request') return 'messages';
  if (isRoomsType(n.type) || isMentionRoomType(n.type)) return 'rooms';
  if (isHousingType(n.type)) return 'housing';
  if (isTradesType(n.type)) return 'trades';
  if (isLoadsAlertType(n.type) || isRestScheduleType(n.type) || isCommuteDelayType(n.type)) return 'ops';
  if (isSocialFeedType(n.type)) return 'social';
  return 'other';
}

function mixedSlideLabel(n: NotificationItem): string {
  const t = (n.type || '').trim();
  if (isMessagesType(n.type)) return 'MESSAGES';
  if (t === 'message_request') return 'REQUESTS';
  if (isRoomsType(n.type) || isMentionRoomType(n.type)) return 'CREW ROOMS';
  if (isHousingType(n.type)) return 'HOUSING';
  if (isTradesType(n.type)) return 'SWAPS';
  if (isLoadsAlertType(n.type) || isRestScheduleType(n.type) || isCommuteDelayType(n.type)) return 'OPS';
  if (isSocialFeedType(n.type)) return 'SOCIAL';
  return 'ACTIVITY';
}

const MIXED_NEUTRAL_FILL: ActivityCardModel = {
  id: 'mixed-neutral-fill',
  label: 'ACTIVITY',
  title: 'See all updates',
  subtitle: 'Notifications',
  href: HREF_NOTIFICATIONS,
  markReadIds: [],
};

const MIXED_QUIET_HERO: ActivityCardModel = {
  id: 'mixed-quiet-hero',
  label: 'ACTIVITY',
  title: 'You’re caught up',
  subtitle: 'Pull to refresh for the latest',
  href: HREF_NOTIFICATIONS,
  markReadIds: [],
};

function mixedHeroFromNotification(n: NotificationItem, sorted: NotificationItem[]): ActivityCardModel {
  const label = mixedSlideLabel(n);
  const tradeUnread = countUnread(sorted, (x) => isTradesType(x.type));
  return withCovers(
    {
      id: 'mixed-hero',
      label,
      title: truncate(personalizeSummary(n.summary, n), 90),
      subtitle: undefined,
      timestamp: n.timeLabel,
      detailRoute: extractRouteHint(n) || undefined,
      sparkleCount: tradeUnread > 0 ? Math.min(99, tradeUnread) : undefined,
      href: hrefFrom(n, HREF_NOTIFICATIONS),
      markReadIds: [],
    },
    [n],
  );
}

function mixedMiniFromNotification(n: NotificationItem): ActivityCardModel {
  const label = mixedSlideLabel(n);
  if (isHousingType(n.type)) {
    const housingCard = splitHousingCard(n);
    return withCovers(
      {
        id: `mixed-mini-housing-${n.id}`,
        label: 'HOUSING',
        title: truncate(housingCard.primary, 72),
        subtitle: truncate(housingCard.secondary, 44),
        timestamp: n.timeLabel,
        primaryLine: truncate(housingCard.primary, 72),
        secondaryLine: housingCard.secondary,
        imageUrl: housingCard.image,
        href: hrefFrom(n, HREF_HOUSING),
        markReadIds: [],
      },
      [n],
    );
  }
  if (isTradesType(n.type)) {
    return withCovers(
      {
        id: `mixed-mini-trade-${n.id}`,
        label: 'SWAPS',
        title: truncate(personalizeSummary(n.summary, n), 80),
        subtitle: 'Open tradeboard',
        timestamp: n.timeLabel,
        primaryLine: truncate(personalizeSummary(n.summary, n), 80),
        secondaryLine: 'Review >',
        href: hrefFrom(n, HREF_TRADES),
        markReadIds: [],
      },
      [n],
    );
  }
  if (isMessagesType(n.type) || (n.type || '').trim() === 'message_request') {
    const d = parseNotificationData(n as { data?: unknown }) as Record<string, unknown>;
    const sub = pickStr(d.preview_text, d.body, d.snippet, d.message_preview);
    return withCovers(
      {
        id: `mixed-mini-msg-${n.id}`,
        label: (n.type || '').trim() === 'message_request' ? 'REQUESTS' : 'MESSAGES',
        title: truncate(personalizeSummary(n.summary, n), 72),
        subtitle: sub,
        timestamp: n.timeLabel,
        primaryLine: truncate(personalizeSummary(n.summary, n), 72),
        href: hrefFrom(n, (n.type || '').trim() === 'message_request' ? HREF_MESSAGE_REQUESTS : HREF_MESSAGES),
        markReadIds: [],
      },
      [n],
    );
  }
  if (isRoomsType(n.type) || isMentionRoomType(n.type)) {
    const rl = splitCrewLines(personalizeSummary(n.summary, n), 'Crew rooms');
    return withCovers(
      {
        id: `mixed-mini-room-${n.id}`,
        label: 'CREW ROOMS',
        title: truncate(rl.primary, 72),
        subtitle: truncate(rl.secondary, 44),
        timestamp: n.timeLabel,
        primaryLine: truncate(rl.primary, 72),
        secondaryLine: rl.secondary,
        href: hrefFrom(n, HREF_CREW_ROOMS),
        markReadIds: [],
      },
      [n],
    );
  }
  if (isLoadsAlertType(n.type) || isRestScheduleType(n.type) || isCommuteDelayType(n.type)) {
    return withCovers(
      {
        id: `mixed-mini-ops-${n.id}`,
        label: utilityLabel(n.type),
        title: truncate(personalizeSummary(n.summary, n), 80),
        subtitle: 'Open',
        timestamp: n.timeLabel,
        href: hrefFrom(n, HREF_LOADS),
        markReadIds: [],
      },
      [n],
    );
  }
  return withCovers(
    {
      id: `mixed-mini-social-${n.id}`,
      label: 'SOCIAL',
      title: truncate(personalizeSummary(n.summary, n), 90),
      subtitle: undefined,
      timestamp: n.timeLabel,
      href: hrefFrom(n, HREF_NOTIFICATIONS),
      markReadIds: [],
    },
    [n],
  );
}

function sortNewest(items: NotificationItem[]): NotificationItem[] {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function firstMatch(
  sorted: NotificationItem[],
  pred: (n: NotificationItem) => boolean,
): NotificationItem | undefined {
  return sorted.find(pred);
}

function countUnread(
  items: NotificationItem[],
  pred: (n: NotificationItem) => boolean,
): number {
  return items.filter((n) => pred(n) && isNotificationUnreadRow(n)).length;
}

function pickStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function stripSummary(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function actorNameFromItem(n: NotificationItem | undefined): string | undefined {
  if (!n) return undefined;
  const ext = n as NotificationItem & { actor_display_name?: string };
  if (ext.actor_display_name?.trim()) return ext.actor_display_name.trim();
  const d = parseNotificationData(n as { data?: unknown });
  return pickStr(d.actor_display_name, d.sender_display_name, d.from_display_name);
}

/** Replace generic "Someone" when we have a real display name from enrichment. */
function personalizeSummary(text: string | undefined, n: NotificationItem | undefined): string {
  const t = stripSummary(text || '');
  const name = actorNameFromItem(n);
  if (!name) return t;
  return t.replace(/\bSomeone\b/gi, name);
}

function truncate(s: string, max: number): string {
  const t = stripSummary(s);
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function hrefFrom(n: NotificationItem | undefined, fallback: Href): Href {
  if (!n) return fallback;
  return notificationTargetHref(n as NotificationItem & Notification & { user_id: string });
}

function extractRouteHint(n: NotificationItem | undefined): string | undefined {
  if (!n) return undefined;
  const d = parseNotificationData(n as { data?: unknown });
  const a = pickStr(d.origin, d.from_airport, d.route_start, d.dep, d.departure_airport);
  const b = pickStr(d.destination, d.to_airport, d.route_end, d.arr, d.arrival_airport);
  if (a && b) return `${a} → ${b}`;
  const r = pickStr(d.route_display, d.route_label, d.pairing_label);
  if (r) return r;
  const m = (n.summary || '').match(/\b([A-Z]{3})\s*[→\u2192\-]\s*([A-Z]{3})\b/);
  if (m) return `${m[1]} → ${m[2]}`;
  return undefined;
}

function splitCrewLines(summary: string | undefined, emptyTitle: string) {
  if (!summary) {
    return { primary: emptyTitle, secondary: 'Browse crew rooms', fallback: emptyTitle };
  }
  const s = stripSummary(summary);
  const idx = s.indexOf(':');
  if (idx > 0 && idx < s.length - 1) {
    const rest = s.slice(idx + 1).trim();
    return {
      primary: s.slice(0, idx + 1).trim(),
      secondary: rest.endsWith('>') ? rest : `${rest} >`,
      fallback: s,
    };
  }
  return { primary: s, secondary: 'Open thread >', fallback: s };
}

function splitHousingCard(n: NotificationItem | undefined) {
  if (!n) {
    return {
      primary: 'Crashpad Finder',
      secondary: 'Browse listings near your base',
      image: undefined as string | undefined,
    };
  }
  const d = parseNotificationData(n as { data?: unknown });
  const title = pickStr(d.listing_title, d.title, d.source_label, d.crashpad_label) || 'Housing';
  const primary = title.endsWith(':') ? title : `${title}:`;
  const body = stripSummary(n.summary || '');
  const secondary = body.length > 64 ? `${body.slice(0, 62)}…` : body || 'Open saved searches & replies';
  const image =
    pickStr(d.listing_image_url, d.image_url, d.thumbnail_url, d.preview_url) || n.actor_avatar_url;
  return { primary, secondary, image };
}

function housingImage(n: NotificationItem | undefined): string | undefined {
  if (!n) return undefined;
  const d = parseNotificationData(n as { data?: unknown });
  return pickStr(d.listing_image_url, d.image_url, d.thumbnail_url, d.preview_url) || n.actor_avatar_url;
}

function pickRoomForCommsPanel(sorted: NotificationItem[]): NotificationItem | undefined {
  const preds: ((n: NotificationItem) => boolean)[] = [
    (n) => isMentionRoomType(n.type),
    (n) => (n.type || '').trim() === 'room_post',
    (n) => (n.type || '').trim() === 'crew_room_reply',
    (n) => ['room_invite', 'crew_room_invite', 'room_join_request'].includes((n.type || '').trim()),
    (n) => isRoomsType(n.type) && !isMessagesType(n.type),
  ];
  for (const p of preds) {
    const m = sorted.find(p);
    if (m) return m;
  }
  return undefined;
}

function pickUtilityNotification(sorted: NotificationItem[]): NotificationItem | undefined {
  return (
    firstMatch(sorted, (n) => isLoadsAlertType(n.type)) ??
    firstMatch(sorted, (n) => isRestScheduleType(n.type)) ??
    firstMatch(sorted, (n) => isCommuteDelayType(n.type)) ??
    firstMatch(
      sorted,
      (n) => registryCategory(n.type) === 'alerts' && !isTradesType(n.type) && !isHousingType(n.type),
    )
  );
}

function utilityLabel(type: string): string {
  const t = (type || '').trim();
  if (isLoadsAlertType(t)) return 'LOADS';
  if (isRestScheduleType(t)) return 'CREW REST';
  if (t.includes('delay') || t.includes('commute')) return 'COMMUTE';
  if (t === 'tool_alert') return 'TOOLS';
  return 'OPS';
}

export function buildHomeActivityPanels(items: NotificationItem[]): HomeActivityPanels {
  const sorted = sortNewest(items);

  const mixedUnread = countUnread(sorted, inMixedScope);
  const commsUnread = countUnread(sorted, inCommsScope);
  const toolsUnread = countUnread(sorted, inToolsScope);
  const badgeByPanel: [number, number, number] = [mixedUnread, commsUnread, toolsUnread];

  // —— Mixed ——
  const socialN = firstMatch(sorted, (n) => isSocialFeedType(n.type));
  const crewN = firstMatch(sorted, (n) => isRoomsType(n.type) && !isMentionRoomType(n.type)) ??
    firstMatch(sorted, (n) => isRoomsType(n.type));
  const housingN = firstMatch(sorted, (n) => isHousingType(n.type));
  const tradeN = firstMatch(sorted, (n) => isTradesType(n.type));
  const tradeUnread = countUnread(sorted, (n) => isTradesType(n.type));

  const routeSocial = extractRouteHint(socialN);
  const routeTrade = extractRouteHint(tradeN);
  const detailRoute = routeSocial || routeTrade;
  const sparkleCount =
    tradeUnread > 0 ? Math.min(99, tradeUnread) : undefined;

  const crewLines = splitCrewLines(
    crewN ? personalizeSummary(crewN.summary, crewN) : undefined,
    'Crew rooms',
  );
  const housingCard = splitHousingCard(housingN);

  const featured: ActivityCardModel = {
    id: 'mixed-social',
    label: 'SOCIAL',
    title: socialN ? personalizeSummary(socialN.summary, socialN) : 'Nothing new in your feed yet',
    subtitle: socialN ? undefined : 'Follows, replies, and mentions will show up here.',
    timestamp: socialN?.timeLabel,
    detailRoute: detailRoute || undefined,
    sparkleCount: sparkleCount || undefined,
    href: socialN ? hrefFrom(socialN, HREF_NOTIFICATIONS) : HREF_NOTIFICATIONS,
    markReadIds: socialN && isNotificationUnreadRow(socialN) ? [socialN.id] : [],
  };

  const bottomLeft: ActivityCardModel = {
    id: 'mixed-crew',
    label: 'CREW ROOMS',
    title: crewLines.primary,
    subtitle: crewLines.secondary,
    timestamp: crewN?.timeLabel,
    primaryLine: crewLines.primary,
    secondaryLine: crewLines.secondary,
    href: crewN ? hrefFrom(crewN, HREF_CREW_ROOMS) : HREF_CREW_ROOMS,
    markReadIds: crewN && isNotificationUnreadRow(crewN) ? [crewN.id] : [],
  };

  const bottomRight: ActivityCardModel = {
    id: 'mixed-housing',
    label: 'HOUSING',
    title: housingCard.primary,
    subtitle: housingCard.secondary,
    timestamp: housingN?.timeLabel,
    primaryLine: housingCard.primary,
    secondaryLine: housingCard.secondary,
    imageUrl: housingCard.image,
    href: housingN ? hrefFrom(housingN, HREF_HOUSING) : HREF_HOUSING,
    markReadIds: housingN && isNotificationUnreadRow(housingN) ? [housingN.id] : [],
  };

  // —— Messages / Rooms ——
  const msgDms = sorted.filter((n) => (n.type || '').trim() === 'message');
  const latestDm = msgDms[0];
  const dmUnread = countUnread(sorted, (n) => (n.type || '').trim() === 'message');
  const reqUnread = countUnread(sorted, (n) => (n.type || '').trim() === 'message_request');
  const latestReq = firstMatch(sorted, (n) => (n.type || '').trim() === 'message_request');
  const roomComms = pickRoomForCommsPanel(sorted);

  let messagesTitle: string;
  let messagesSub: string | undefined;
  let messagesHref: Href = HREF_MESSAGES;
  let messagesMark: string[] = [];
  let messagesTs: string | undefined;
  let inlineDm: number | undefined;

  if (dmUnread > 1) {
    messagesTitle = `${dmUnread} new DMs`;
    messagesSub = 'Open your inbox to read them';
    messagesHref = HREF_MESSAGES;
    messagesMark = [];
    messagesTs = msgDms[0]?.timeLabel;
    inlineDm = dmUnread;
  } else if (dmUnread === 1 && latestDm) {
    messagesTitle = truncate(personalizeSummary(latestDm.summary, latestDm), 72);
    const d = parseNotificationData(latestDm as { data?: unknown }) as Record<string, unknown>;
    messagesSub = pickStr(
      d.preview_text,
      d.body,
      d.snippet,
      d.message_preview,
    ) as string | undefined;
    messagesHref = hrefFrom(latestDm, HREF_MESSAGES);
    messagesMark = isNotificationUnreadRow(latestDm) ? [latestDm.id] : [];
    messagesTs = latestDm.timeLabel;
  } else {
    messagesTitle = 'No new direct messages';
    messagesSub =
      msgDms.length > 0 ? 'You’re all caught up in DMs' : 'When someone messages you, it shows here';
    messagesHref = HREF_MESSAGES;
    messagesMark = [];
    messagesTs = msgDms[0]?.timeLabel;
  }

  const commsFeatured: ActivityCardModel = {
    id: 'comms-messages',
    label: 'MESSAGES',
    title: messagesTitle,
    subtitle: messagesSub,
    timestamp: messagesTs,
    href: messagesHref,
    markReadIds: messagesMark,
    inlineCount: inlineDm,
  };

  const requestsTitle =
    reqUnread > 0
      ? `${reqUnread} request${reqUnread > 1 ? 's' : ''} waiting`
      : 'No pending requests';
  const requestsSub = reqUnread > 0 ? 'Tap to review' : 'Message requests will appear here';
  const messageRequests: ActivityCardModel = {
    id: 'comms-requests',
    label: 'MESSAGE REQUESTS',
    title: requestsTitle,
    subtitle: requestsSub,
    timestamp: latestReq?.timeLabel,
    href: HREF_MESSAGE_REQUESTS,
    markReadIds: latestReq && isNotificationUnreadRow(latestReq) ? [latestReq.id] : [],
  };

  const roomLines = roomComms
    ? splitCrewLines(personalizeSummary(roomComms.summary, roomComms), 'Crew rooms')
    : { primary: 'No room activity yet', secondary: 'Replies & mentions show here', fallback: '' };
  const crewRooms: ActivityCardModel = {
    id: 'comms-rooms',
    label: 'CREW ROOMS',
    title: roomLines.primary,
    subtitle: roomLines.secondary,
    timestamp: roomComms?.timeLabel,
    primaryLine: roomLines.primary,
    secondaryLine: roomLines.secondary,
    href: roomComms ? hrefFrom(roomComms, HREF_CREW_ROOMS) : HREF_CREW_ROOMS,
    markReadIds: roomComms && isNotificationUnreadRow(roomComms) ? [roomComms.id] : [],
  };

  // —— Tools / Alerts —— (priority: swap/trade → alerts → housing)
  const featN =
    firstMatch(sorted, (n) => isTradesType(n.type)) ??
    firstMatch(sorted, (n) => registryCategory(n.type) === 'alerts') ??
    firstMatch(sorted, (n) => isHousingType(n.type));
  const housingTool =
    firstMatch(
      sorted,
      (n) => isHousingType(n.type) && (!featN || n.id !== featN.id),
    ) ?? firstMatch(sorted, (n) => isHousingType(n.type));
  const utilN = pickUtilityNotification(sorted);

  const toolsFeatured: ActivityCardModel = {
    id: 'tools-featured',
    label: featN && isTradesType(featN.type) ? 'SWAPS' : 'ALERTS',
    title: featN
      ? personalizeSummary(featN.summary, featN)
      : 'Nothing to review in tools yet',
    subtitle: featN
      ? isTradesType(featN.type)
        ? 'Tradeboard & swap signals'
        : isHousingType(featN.type)
          ? 'Housing & crashpads'
          : 'Operations & reminders'
      : 'Matches, listings, and load watches will appear here.',
    timestamp: featN?.timeLabel,
    detailRoute: extractRouteHint(featN),
    href: featN ? hrefFrom(featN, HREF_CREW_TOOLS) : HREF_CREW_TOOLS,
    markReadIds: featN && isNotificationUnreadRow(featN) ? [featN.id] : [],
  };

  const hLines = splitHousingCard(housingTool);
  const housingPanel: ActivityCardModel = {
    id: 'tools-housing',
    label: 'HOUSING',
    title: housingTool
      ? personalizeSummary(housingTool.summary, housingTool).slice(0, 80)
      : 'Saved searches & listings',
    subtitle: housingTool ? hLines.secondary : 'Replies and new listings show here',
    timestamp: housingTool?.timeLabel,
    primaryLine: hLines.primary,
    secondaryLine: hLines.secondary,
    imageUrl: housingImage(housingTool),
    href: housingTool ? hrefFrom(housingTool, HREF_HOUSING) : HREF_HOUSING,
    markReadIds: housingTool && isNotificationUnreadRow(housingTool) ? [housingTool.id] : [],
  };

  const utilLabel = utilN ? utilityLabel(utilN.type) : 'LOADS / OPS';
  const defaultOpsHref: Href = HREF_LOADS;
  const loadsOps: ActivityCardModel = {
    id: 'tools-ops',
    label: utilLabel,
    title: utilN ? personalizeSummary(utilN.summary, utilN) : 'No schedule or load changes',
    subtitle: utilN ? undefined : 'Staff loads, rest, and commute alerts',
    timestamp: utilN?.timeLabel,
    href: utilN ? hrefFrom(utilN, defaultOpsHref) : HREF_CREW_TOOLS,
    markReadIds: utilN && isNotificationUnreadRow(utilN) ? [utilN.id] : [],
  };

  return {
    mixedPriority: {
      featured,
      bottomLeft,
      bottomRight,
    },
    messageRooms: {
      featured: commsFeatured,
      messageRequests,
      crewRooms,
    },
    toolAlerts: {
      featured: toolsFeatured,
      housing: housingPanel,
      loadsOps,
    },
    badgeByPanel,
  };
}

export type ActivitySlideTriple = {
  hero: ActivityCardModel;
  bottomLeft: ActivityCardModel;
  bottomRight: ActivityCardModel;
};

export type HomeActivityModuleData = {
  chrome: { avatarUris: string[]; badgeCount: number };
  slides: [ActivitySlideTriple, ActivitySlideTriple, ActivitySlideTriple];
};

function withCovers(card: ActivityCardModel, sources: NotificationItem[]): ActivityCardModel {
  const ids = sources.map((s) => s.id);
  const unreadIds = sources.filter((s) => isNotificationUnreadRow(s)).map((s) => s.id);
  return {
    ...card,
    coversNotificationIds: ids,
    markReadIds: unreadIds.length ? unreadIds : card.markReadIds,
  };
}

function pickMixedTriple(sorted: NotificationItem[]): {
  hero?: NotificationItem;
  left?: NotificationItem;
  right?: NotificationItem;
} {
  const pool = sorted.filter((n) => slide1Eligible(n));
  if (!pool.length) return {};

  const scored = [...pool].sort((a, b) => {
    const ur = Number(isNotificationUnreadRow(b)) - Number(isNotificationUnreadRow(a));
    if (ur !== 0) return ur;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const hero = scored[0];
  const used = new Set<string>([hero.id]);
  const k0 = diversityKey(hero);

  let left: NotificationItem | undefined;
  for (const n of scored) {
    if (used.has(n.id)) continue;
    if (diversityKey(n) !== k0) {
      left = n;
      used.add(n.id);
      break;
    }
  }
  if (!left) {
    left = scored.find((n) => !used.has(n.id));
    if (left) used.add(left.id);
  }

  const keysSoFar = new Set([k0, left ? diversityKey(left) : '']);
  let right: NotificationItem | undefined;
  for (const n of scored) {
    if (used.has(n.id)) continue;
    if (!keysSoFar.has(diversityKey(n))) {
      right = n;
      used.add(n.id);
      break;
    }
  }
  if (!right) {
    right = scored.find((n) => !used.has(n.id));
    if (right) used.add(right.id);
  }

  return { hero, left, right };
}

function buildMixedSlideCards(
  sorted: NotificationItem[],
  h?: NotificationItem,
  l?: NotificationItem,
  r?: NotificationItem,
): ActivitySlideTriple {
  if (!h && !l && !r) {
    return {
      hero: MIXED_QUIET_HERO,
      bottomLeft: { ...MIXED_NEUTRAL_FILL, id: 'mixed-neutral-bl' },
      bottomRight: { ...MIXED_NEUTRAL_FILL, id: 'mixed-neutral-br' },
    };
  }

  const featured: ActivityCardModel = h ? mixedHeroFromNotification(h, sorted) : MIXED_QUIET_HERO;

  const bottomLeft: ActivityCardModel = l ? mixedMiniFromNotification(l) : { ...MIXED_NEUTRAL_FILL, id: 'mixed-fill-bl' };

  const bottomRight: ActivityCardModel = r ? mixedMiniFromNotification(r) : l ? { ...MIXED_NEUTRAL_FILL, id: 'mixed-fill-br' } : { ...MIXED_NEUTRAL_FILL, id: 'mixed-fill-br2' };

  return { hero: featured, bottomLeft, bottomRight };
}

function collectIdsFromSlide(slide: ActivitySlideTriple): Set<string> {
  const s = new Set<string>();
  for (const c of [slide.hero, slide.bottomLeft, slide.bottomRight]) {
    for (const id of c.coversNotificationIds ?? []) {
      if (id) s.add(id);
    }
    for (const id of c.markReadIds ?? []) {
      if (id) s.add(id);
    }
  }
  return s;
}

function buildCommsSlideCards(sorted: NotificationItem[], used: Set<string>): ActivitySlideTriple {
  const pool = sorted.filter((n) => inCommsScope(n) && !used.has(n.id));
  const msgDmsAll = sorted.filter((n) => (n.type || '').trim() === 'message');
  const msgDms = msgDmsAll.filter((n) => !used.has(n.id));
  const dmUnread = countUnread(sorted, (n) => (n.type || '').trim() === 'message' && !used.has(n.id));
  const latestDm = msgDms[0];
  const reqUnread = countUnread(sorted, (n) => (n.type || '').trim() === 'message_request' && !used.has(n.id));
  const latestReq = pool.find((n) => (n.type || '').trim() === 'message_request');
  const roomComms = pickRoomForCommsPanel(pool);

  let messagesTitle: string;
  let messagesSub: string | undefined;
  let messagesHref: Href = HREF_MESSAGES;
  let messagesMark: string[] = [];
  let messagesTs: string | undefined;
  let inlineDm: number | undefined;

  const unreadMsgs = msgDms.filter((n) => isNotificationUnreadRow(n));
  if (dmUnread > 1) {
    messagesTitle = `${dmUnread} new messages`;
    messagesSub = 'Tap to open inbox';
    messagesHref = HREF_MESSAGES;
    messagesMark = [];
    messagesTs = msgDms[0]?.timeLabel;
    inlineDm = dmUnread;
  } else if (dmUnread === 1 && latestDm) {
    messagesTitle = truncate(personalizeSummary(latestDm.summary, latestDm), 72);
    const d = parseNotificationData(latestDm as { data?: unknown }) as Record<string, unknown>;
    messagesSub = pickStr(d.preview_text, d.body, d.snippet, d.message_preview) as string | undefined;
    messagesHref = hrefFrom(latestDm, HREF_MESSAGES);
    messagesMark = isNotificationUnreadRow(latestDm) ? [latestDm.id] : [];
    messagesTs = latestDm.timeLabel;
  } else {
    messagesTitle = 'No new direct messages';
    messagesSub = msgDms.length > 0 ? 'You’re caught up' : 'Messages show here';
    messagesHref = HREF_MESSAGES;
    messagesMark = [];
    messagesTs = msgDms[0]?.timeLabel;
  }

  const commsFeaturedBase: ActivityCardModel = {
    id: 'comms-messages',
    label: 'MESSAGES',
    title: messagesTitle,
    subtitle: messagesSub,
    timestamp: messagesTs,
    href: messagesHref,
    markReadIds: messagesMark,
    inlineCount: inlineDm,
  };
  const commsFeatured =
    dmUnread > 1
      ? withCovers(
          { ...commsFeaturedBase, markReadIds: unreadMsgs.map((m) => m.id) },
          unreadMsgs.length ? unreadMsgs : msgDms.slice(0, Math.min(8, msgDms.length)),
        )
      : dmUnread === 1 && latestDm
        ? withCovers(commsFeaturedBase, [latestDm])
        : { ...commsFeaturedBase, coversNotificationIds: [] as string[] };

  const requestsTitle =
    reqUnread > 0 ? `${reqUnread} message request${reqUnread > 1 ? 's' : ''}` : 'No requests';
  const requestsSub = reqUnread > 0 ? 'Review >' : 'Requests show here';
  const messageRequests: ActivityCardModel = latestReq
    ? withCovers(
        {
          id: 'comms-requests',
          label: 'MESSAGE REQUESTS',
          title: truncate(requestsTitle, 72),
          subtitle: requestsSub,
          timestamp: latestReq.timeLabel,
          href: HREF_MESSAGE_REQUESTS,
          markReadIds: [],
        },
        [latestReq],
      )
    : {
        id: 'comms-requests-empty',
        label: 'MESSAGE REQUESTS',
        title: requestsTitle,
        subtitle: requestsSub,
        href: HREF_MESSAGE_REQUESTS,
        markReadIds: [],
      };

  const roomLines = roomComms
    ? splitCrewLines(personalizeSummary(roomComms.summary, roomComms), 'Crew rooms')
    : { primary: 'No room activity', secondary: 'Mentions show here', fallback: '' };
  const crewRooms: ActivityCardModel = roomComms
    ? withCovers(
        {
          id: 'comms-rooms',
          label: 'CREW ROOMS',
          title: truncate(roomLines.primary, 72),
          subtitle: truncate(roomLines.secondary, 44),
          timestamp: roomComms.timeLabel,
          primaryLine: truncate(roomLines.primary, 72),
          secondaryLine: roomLines.secondary,
          href: hrefFrom(roomComms, HREF_CREW_ROOMS),
          markReadIds: [],
        },
        [roomComms],
      )
    : {
        id: 'comms-rooms-empty',
        label: 'CREW ROOMS',
        title: 'No crew room activity',
        subtitle: 'Mentions & replies show here',
        href: HREF_CREW_ROOMS,
        markReadIds: [],
      };

  return {
    hero: commsFeatured,
    bottomLeft: crewRooms,
    bottomRight: messageRequests,
  };
}

function buildToolsSlideCards(sorted: NotificationItem[], used: Set<string>): ActivitySlideTriple {
  const pool = sorted.filter((n) => inToolsScope(n) && !used.has(n.id));
  const featN =
    firstMatch(pool, (n) => isTradesType(n.type)) ??
    firstMatch(pool, (n) => registryCategory(n.type) === 'alerts') ??
    firstMatch(pool, (n) => isHousingType(n.type));
  const housingTool =
    firstMatch(pool, (n) => isHousingType(n.type) && (!featN || n.id !== featN.id)) ??
    firstMatch(pool, (n) => isHousingType(n.type));
  const utilN = pickUtilityNotification(pool);

  const toolsFeatured: ActivityCardModel = featN
    ? withCovers(
        {
          id: 'tools-featured',
          label: featN && isTradesType(featN.type) ? 'SWAPS' : 'ALERTS',
          title: truncate(personalizeSummary(featN.summary, featN), 88),
          subtitle: truncate(
            isTradesType(featN.type)
              ? 'Review match >'
              : isHousingType(featN.type)
                ? 'Housing alert'
                : 'Open details >',
            40,
          ),
          timestamp: featN.timeLabel,
          detailRoute: extractRouteHint(featN),
          href: featN ? hrefFrom(featN, HREF_CREW_TOOLS) : HREF_CREW_TOOLS,
          markReadIds: [],
        },
        [featN],
      )
    : {
        id: 'tools-empty-hero',
        label: 'ALERTS',
        title: 'No tool alerts right now',
        subtitle: 'Swaps, loads & housing',
        href: HREF_CREW_TOOLS,
        markReadIds: [],
      };

  const hLines = housingTool ? splitHousingCard(housingTool) : null;
  const housingPanel: ActivityCardModel = housingTool
    ? withCovers(
        {
          id: 'tools-housing',
          label: 'HOUSING',
          title: truncate(hLines!.primary, 72),
          subtitle: truncate(hLines!.secondary, 44),
          timestamp: housingTool.timeLabel,
          primaryLine: truncate(hLines!.primary, 72),
          secondaryLine: hLines!.secondary,
          imageUrl: housingImage(housingTool),
          href: hrefFrom(housingTool, HREF_HOUSING),
          markReadIds: [],
        },
        [housingTool],
      )
    : {
        id: 'tools-housing-empty',
        label: 'HOUSING',
        title: 'No new listings',
        subtitle: 'Crashpads & alerts',
        href: HREF_HOUSING,
        markReadIds: [],
      };

  const utilLabel = utilN ? utilityLabel(utilN.type) : 'LOADS';
  const loadsOps: ActivityCardModel = utilN
    ? withCovers(
        {
          id: 'tools-ops',
          label: utilLabel,
          title: truncate(personalizeSummary(utilN.summary, utilN), 80),
          subtitle: 'Open loads >',
          timestamp: utilN.timeLabel,
          href: hrefFrom(utilN, HREF_LOADS),
          markReadIds: [],
        },
        [utilN],
      )
    : {
        id: 'tools-ops-empty',
        label: 'LOADS',
        title: 'No load updates',
        subtitle: 'Staff loads & non-rev',
        href: HREF_LOADS,
        markReadIds: [],
      };

  return {
    hero: toolsFeatured,
    bottomLeft: housingPanel,
    bottomRight: loadsOps,
  };
}

/**
 * Builds chrome (single avatar strip + total badge) and three deduped slides.
 * Slide order: mixed → comms → tools. Same notification id never appears twice.
 */
export function buildHomeActivityModuleData(items: NotificationItem[]): HomeActivityModuleData {
  const sorted = sortNewest(items);
  const totalUnread = sorted.filter((n) => isNotificationUnreadRow(n)).length;
  const badgeCount = Math.min(99, totalUnread);
  const avatarUris = collectDistinctAvatarUris(sorted, (n) => isNotificationUnreadRow(n), 4);

  const { hero: h, left: l, right: r } = pickMixedTriple(sorted);
  const slide1 = buildMixedSlideCards(sorted, h, l, r);
  const used = collectIdsFromSlide(slide1);

  const slide2 = buildCommsSlideCards(sorted, used);
  for (const id of collectIdsFromSlide(slide2)) used.add(id);

  const slide3 = buildToolsSlideCards(sorted, used);

  return {
    chrome: { avatarUris, badgeCount },
    slides: [slide1, slide2, slide3],
  };
}
