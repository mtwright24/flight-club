import { Ionicons } from '@expo/vector-icons';

// Simple description of an internal Flight Club tool/utility
export type ToolEntry = {
  id: string;
  title: string;
  keywords: string[];
  description: string;
  route: string; // Expo Router route string
  iconName?: React.ComponentProps<typeof Ionicons>['name'] | string; // allow emoji fallback
};

export const toolsRegistry: ToolEntry[] = [
  {
    id: 'crew-exchange',
    title: 'Crew Exchange / Schedule Swap',
    keywords: ['crew', 'exchange', 'swap', 'trades', 'schedule'],
    description: 'Post and browse trip trades with other crew members.',
    route: '/crew-exchange',
    iconName: 'swap-horizontal',
  },
  {
    id: 'crew-rest-calculator',
    title: 'Crew Rest Calculator',
    keywords: ['rest', 'calculator', 'duty', 'legal', 'augmented'],
    description: 'Quickly calculate legal crew rest windows and duty limits.',
    route: '/crew-rest-calculator',
    iconName: 'time-outline',
  },
  {
    id: 'non-rev-loads',
    title: 'Non-Rev / Staff Loads',
    keywords: ['nonrev', 'non-rev', 'loads', 'staff', 'standby'],
    description: 'Check community-reported non-rev and staff loads.',
    route: '/non-rev-loads',
    iconName: 'airplane-outline',
  },
  {
    id: 'crashpads',
    title: 'Crashpads & Housing',
    keywords: ['crashpad', 'housing', 'stay', 'roommate', 'base'],
    description: 'Find and share crashpads near your base.',
    route: '/crashpads',
    iconName: 'home-outline',
  },
  {
    id: 'utility-hub',
    title: 'Utility Hub',
    keywords: ['tools', 'utilities', 'hub', 'quick', 'shortcuts'],
    description: 'Jump into Flight Club’s collection of crew tools.',
    route: '/utility',
    iconName: 'grid-outline',
  },
  {
    id: 'crew-rooms',
    title: 'Crew Rooms',
    keywords: ['crew', 'rooms', 'chat', 'groups', 'hangar'],
    description: 'Drop into live crew rooms and base chats.',
    route: '/crew-rooms',
    iconName: 'chatbubbles-outline',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    keywords: ['alerts', 'notifications', 'activity'],
    description: 'Review your latest mentions, likes, comments, and follows.',
    route: '/notifications',
    iconName: 'notifications-outline',
  },
  {
    id: 'messages',
    title: 'Messages',
    keywords: ['messages', 'dm', 'chat', 'inbox'],
    description: 'Open your Flight Club direct messages inbox.',
    route: '/messages-inbox',
    iconName: 'chatbubble-ellipses-outline',
  },
];
