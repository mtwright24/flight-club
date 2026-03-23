import { Ionicons } from '@expo/vector-icons';

// Simple description of an internal Flight Club tool/utility
export type ToolEntry = {
  id: string;
  title: string;
  /** Short label for Home shortcut chips (avoids awkward splits of full titles). */
  shortcutChipLabel?: string;
  keywords: string[];
  description: string;
  route: string; // Expo Router route string
  iconName?: React.ComponentProps<typeof Ionicons>['name'] | string; // allow emoji fallback
};

export function toolShortcutChipLabel(entry: ToolEntry): string {
  return (entry.shortcutChipLabel ?? entry.title).trim();
}

export const toolsRegistry: ToolEntry[] = [
  {
    id: 'crew-exchange',
    title: 'Crew Exchange / Schedule Swap',
    shortcutChipLabel: 'Schedule swap',
    keywords: ['crew', 'exchange', 'swap', 'trades', 'schedule'],
    description: 'Post and browse trip trades with other crew members.',
    route: '/crew-exchange',
    iconName: 'swap-horizontal',
  },
  {
    id: 'crew-rest-calculator',
    title: 'Crew Rest Calculator',
    shortcutChipLabel: 'Rest calculator',
    keywords: ['rest', 'calculator', 'duty', 'legal', 'augmented'],
    description: 'Quickly calculate legal crew rest windows and duty limits.',
    route: '/crew-rest-calculator',
    iconName: 'time-outline',
  },
  {
    id: 'non-rev-loads',
    title: 'Non-Rev / Staff Loads',
    shortcutChipLabel: 'Staff loads',
    keywords: ['nonrev', 'non-rev', 'loads', 'staff', 'standby'],
    description: 'Check community-reported non-rev and staff loads.',
    route: '/loads',
    iconName: 'airplane-outline',
  },
  {
    id: 'crashpads',
    title: 'Crashpads & Housing',
    shortcutChipLabel: 'Crashpads',
    keywords: ['crashpad', 'housing', 'stay', 'roommate', 'base'],
    description: 'Find and share crashpads near your base.',
    route: '/(screens)/crashpads',
    iconName: 'home-outline',
  },
  {
    id: 'utility-hub',
    title: 'Utility Hub',
    shortcutChipLabel: 'Utility',
    keywords: ['utility', 'utilities', 'hub', 'quick', 'shortcuts'],
    description: 'Home quick-access placeholder (separate from the Crew Tools tab).',
    route: '/(screens)/utility',
    iconName: 'grid-outline',
  },
  {
    id: 'crew-tools',
    title: 'Crew Tools',
    shortcutChipLabel: 'Crew Tools',
    keywords: ['tools', 'crew tools', 'ecosystem', 'catalog', 'utilities'],
    description: 'Open the Crew Tools tab — main tools pillar in the bottom navigation.',
    route: '/(tabs)/crew-tools',
    iconName: 'apps-outline',
  },
  {
    id: 'crew-rooms',
    title: 'Crew Rooms',
    shortcutChipLabel: 'Crew Rooms',
    keywords: ['crew', 'rooms', 'chat', 'groups', 'hangar'],
    description: 'Drop into live crew rooms and base chats.',
    route: '/(tabs)/crew-rooms',
    iconName: 'chatbubbles-outline',
  },
  {
    id: 'social-feed',
    title: 'Social Feed',
    shortcutChipLabel: 'Social feed',
    keywords: ['feed', 'social', 'posts', 'crew', 'community'],
    description: 'Browse posts and updates from the crew community.',
    route: '/(tabs)/feed',
    iconName: 'people-outline',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    shortcutChipLabel: 'Notifications',
    keywords: ['alerts', 'notifications', 'activity'],
    description: 'Review your latest mentions, likes, comments, and follows.',
    route: '/notifications',
    iconName: 'notifications-outline',
  },
  {
    id: 'messages',
    title: 'Messages',
    shortcutChipLabel: 'Messages',
    keywords: ['messages', 'dm', 'chat', 'inbox'],
    description: 'Open your Flight Club direct messages inbox.',
    route: '/messages-inbox',
    iconName: 'chatbubble-ellipses-outline',
  },
];
