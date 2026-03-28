import type { Href } from 'expo-router';
import type { ActivityCardModel } from './homeActivityPanels';

const HREF_NOTIFICATIONS = '/notifications' as Href;
const HREF_MESSAGES = '/messages-inbox' as Href;
const HREF_MESSAGE_REQUESTS = '/notifications/sublist/message-requests' as Href;
const HREF_CREW_ROOMS = '/(tabs)/crew-rooms' as Href;
const HREF_HOUSING = '/(screens)/crashpads' as Href;
const HREF_EXCHANGE = '/exchange' as Href;
const HREF_LOADS = '/loads' as Href;

export type ActivitySlideCards = {
  hero: ActivityCardModel;
  bottomLeft: ActivityCardModel;
  bottomRight: ActivityCardModel;
};

/** Canonical demo content when there are no notifications — matches product spec copy. */
export const HOME_ACTIVITY_SEED_SLIDES: ActivitySlideCards[] = [
  {
    hero: {
      id: 'seed-mixed-hero',
      label: 'SOCIAL',
      title: 'Jasmine replied to your post',
      subtitle: 'BOS → LAX',
      timestamp: '8m ago',
      detailRoute: 'BOS → LAX',
      href: HREF_NOTIFICATIONS,
      markReadIds: [],
    },
    bottomLeft: {
      id: 'seed-mixed-crew',
      label: 'CREW ROOMS',
      title: 'ORD FAs Chat: 3 new messages',
      primaryLine: 'ORD FAs Chat: 3 new messages',
      secondaryLine: 'Open thread >',
      href: HREF_CREW_ROOMS,
      markReadIds: [],
    },
    bottomRight: {
      id: 'seed-mixed-housing',
      label: 'HOUSING',
      title: 'Crashpad Finder: New standby bed in LIC',
      primaryLine: 'Crashpad Finder: New standby bed in LIC',
      href: HREF_HOUSING,
      markReadIds: [],
      imageUrl: undefined,
    },
  },
  {
    hero: {
      id: 'seed-comms-hero',
      label: 'MESSAGES',
      title: '2 new DMs',
      subtitle: 'Robert and Monica',
      timestamp: '14m ago',
      href: HREF_MESSAGES,
      markReadIds: [],
      inlineCount: 2,
    },
    bottomLeft: {
      id: 'seed-comms-rooms',
      label: 'CREW ROOMS',
      title: 'JFK Crew Talk: 2 mentions',
      primaryLine: 'JFK Crew Talk: 2 mentions',
      secondaryLine: 'Open thread >',
      href: HREF_CREW_ROOMS,
      markReadIds: [],
    },
    bottomRight: {
      id: 'seed-comms-req',
      label: 'MESSAGE REQUESTS',
      title: '1 message request',
      primaryLine: '1 message request',
      href: HREF_MESSAGE_REQUESTS,
      markReadIds: [],
    },
  },
  {
    hero: {
      id: 'seed-tools-hero',
      label: 'SWAPS',
      title: 'Swap match found for BOS → LAX',
      subtitle: 'Review match >',
      timestamp: '22m ago',
      detailRoute: 'BOS → LAX',
      href: HREF_EXCHANGE,
      markReadIds: [],
    },
    bottomLeft: {
      id: 'seed-tools-housing',
      label: 'HOUSING',
      title: '2 new BOS listings',
      primaryLine: '2 new BOS listings',
      secondaryLine: 'Browse listings >',
      href: HREF_HOUSING,
      markReadIds: [],
    },
    bottomRight: {
      id: 'seed-tools-loads',
      label: 'STAFF LOADS',
      title: 'JFK-LAX loads changed',
      primaryLine: 'JFK-LAX loads changed',
      secondaryLine: 'Open loads >',
      href: HREF_LOADS,
      markReadIds: [],
    },
  },
];

/** Placeholder avatars for seed slides (distinct faces). */
export const HOME_ACTIVITY_SEED_AVATARS = [
  'https://i.pravatar.cc/96?img=12',
  'https://i.pravatar.cc/96?img=33',
  'https://i.pravatar.cc/96?img=47',
  'https://i.pravatar.cc/96?img=52',
];
