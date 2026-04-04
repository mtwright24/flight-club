/**
 * Dev-only: schedule local notifications whose `data` mirrors remote Expo push payloads
 * so routing + tap handling can be exercised without the backend.
 */
import { Platform } from 'react-native';

import {
  AndroidImportance,
  AndroidNotificationVisibility,
  scheduleNotificationAsync,
  SchedulableTriggerInputTypes,
  setNotificationChannelAsync,
} from '../push/expoNotificationsApi';

const ANDROID_CH = 'default';

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await setNotificationChannelAsync(ANDROID_CH, {
    name: 'Default',
    importance: AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
  });
}

/** Placeholder UUIDs — routes open real screens; targets may 404 if ids are not in DB. */
const ID1 = '00000000-0000-4000-8000-000000000001';
const ID2 = '00000000-0000-4000-8000-000000000002';
const ID3 = '00000000-0000-4000-8000-000000000003';
const ID4 = '00000000-0000-4000-8000-000000000004';
const ID5 = '00000000-0000-4000-8000-000000000005';
const ID6 = '00000000-0000-4000-8000-000000000006';

export type DevSimKind =
  | 'dm'
  | 'comment'
  | 'room_reply'
  | 'trade'
  | 'housing'
  | 'system';

export async function scheduleDevSimulatedPushPayload(kind: DevSimKind, delaySec = 3): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  await ensureChannel();

  const baseData: Record<string, unknown> = {
    notification_id: ID1,
  };

  let title = 'Flight Club';
  let body = 'Simulated push';
  let data: Record<string, unknown> = { ...baseData };

  switch (kind) {
    case 'dm':
      title = 'New message';
      body = 'Simulated DM (dev)';
      data = {
        ...baseData,
        route: `/dm-thread?conversationId=${ID1}`,
        type: 'message',
        entity_type: 'conversation',
        entity_id: ID1,
      };
      break;
    case 'comment':
      title = 'New comment';
      body = 'Simulated comment on your post';
      data = {
        ...baseData,
        route: `/post/${ID2}`,
        type: 'comment_post',
        entity_type: 'post',
        entity_id: ID2,
      };
      break;
    case 'room_reply':
      title = 'Crew room';
      body = 'Simulated reply in a room thread';
      data = {
        ...baseData,
        route: `/room-post-detail?postId=${ID3}`,
        type: 'crew_room_reply',
        entity_type: 'room_post',
        entity_id: ID3,
      };
      break;
    case 'trade':
      title = 'Trade interest';
      body = 'Simulated tradeboard interest';
      data = {
        ...baseData,
        route: `/crew-exchange/${ID4}`,
        type: 'trade_interest',
        entity_type: 'trade',
        entity_id: ID4,
      };
      break;
    case 'housing':
      title = 'Housing';
      body = 'Simulated housing alert';
      data = {
        ...baseData,
        route: `/(screens)/crashpads-detail?id=${encodeURIComponent(ID5)}`,
        type: 'housing_reply',
        entity_type: 'listing',
        entity_id: ID5,
      };
      break;
    case 'system':
      title = 'Flight Club';
      body = 'Simulated system announcement';
      data = {
        ...baseData,
        route: '/notifications',
        type: 'system_announcement',
        entity_type: 'unknown',
        entity_id: ID6,
      };
      break;
    default:
      break;
  }

  try {
    return await scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CH } : {}),
      },
      trigger: {
        type: SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, delaySec),
        repeats: false,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CH } : {}),
      },
    });
  } catch (e) {
    console.warn('[DevSim] schedule failed', e);
    return null;
  }
}
