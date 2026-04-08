import type { CrewBundle, CrewTool } from './types';

/** Master list — used for search and id lookup */
export const CREW_TOOL_CATALOG: CrewTool[] = [
  {
    id: 'commute-assist',
    title: 'Commute Assist',
    subtitle: '11 min to JFK',
    icon: 'car-outline',
    access: 'pro',
    route: '/utility',
    cta: 'open',
    categories: ['commute', 'transit', 'base'],
  },
  {
    id: 'crew-calendar',
    title: 'Crew Calendar',
    subtitle: 'Week 16',
    icon: 'calendar-outline',
    access: 'included',
    route: '/crew-schedule',
    cta: 'open',
    categories: ['schedule', 'calendar'],
  },
  {
    id: 'qr-flight-room',
    title: 'QR Flight Room',
    subtitle: 'Quick join crew spaces',
    icon: 'qr-code-outline',
    access: 'free',
    route: '/(tabs)/crew-rooms',
    cta: 'open',
    categories: ['rooms', 'chat'],
  },
  {
    id: 'crashpad-search',
    title: 'Crashpad Search',
    subtitle: 'Near-base housing',
    icon: 'home-outline',
    access: 'free',
    route: '/(screens)/crashpads',
    cta: 'open',
    categories: ['housing', 'crashpad'],
  },
  {
    id: 'contract-policy',
    title: 'Contract & Policy Assist',
    subtitle: 'Plain-language answers',
    icon: 'document-text-outline',
    access: 'pro',
    cta: 'unlock',
    categories: ['contract', 'union', 'policy'],
  },
  {
    id: 'fc-language',
    title: 'FC Language Assist',
    subtitle: 'Phrase cards & audio',
    icon: 'language-outline',
    access: 'pro',
    cta: 'unlock',
    categories: ['language', 'international'],
  },
  {
    id: 'calendar-notes',
    title: 'Calendar Notes',
    subtitle: 'Trip annotations',
    icon: 'calendar-number-outline',
    access: 'free',
    route: '/crew-schedule',
    cta: 'open',
    categories: ['schedule', 'notes'],
  },
  {
    id: 'layover-intel',
    title: 'Layover Intel',
    subtitle: 'San Diego Intl',
    icon: 'location-outline',
    access: 'free',
    cta: 'add',
    rating: 4.8,
    reviewCount: 214,
    roleHint: 'Great for commuters',
    categories: ['layover', 'local'],
  },
  {
    id: 'crew-calendar-pro',
    title: 'Crew Calendar',
    subtitle: 'Queens, NY',
    icon: 'chatbubble-ellipses-outline',
    access: 'pro',
    cta: 'unlock',
    categories: ['schedule'],
  },
  {
    id: 'kcm-quick-help',
    title: 'KCM Quick Help',
    subtitle: 'Lane tips & reminders',
    icon: 'shield-checkmark-outline',
    access: 'free',
    cta: 'add',
    categories: ['security', 'kcm'],
  },
  {
    id: 'flight-tracker',
    title: 'Flight Tracker',
    subtitle: 'Live boards & delays',
    icon: 'airplane-outline',
    access: 'included',
    route: '/flight-tracker',
    cta: 'open',
    categories: ['ops', 'delays'],
  },
  {
    id: 'duty-guard',
    title: 'Duty Guard',
    subtitle: 'Duty & rest awareness',
    icon: 'shield-outline',
    access: 'pro',
    cta: 'unlock',
    categories: ['duty', 'rest', 'legal'],
  },
  {
    id: 'airline-hub',
    title: 'Airline Hub',
    subtitle: 'Company links & news',
    icon: 'business-outline',
    access: 'free',
    cta: 'add',
    categories: ['airline', 'company'],
  },
  {
    id: 'wake-report',
    title: 'Wake Me for Report',
    subtitle: 'Smart alerts before report',
    icon: 'alarm-outline',
    access: 'addon',
    cta: 'unlock',
    categories: ['alerts', 'reserve'],
  },
  {
    id: 'crew-reset',
    title: 'Crew Reset',
    subtitle: 'Wind-down & sleep tips',
    icon: 'moon-outline',
    access: 'free',
    cta: 'add',
    categories: ['wellness'],
  },
  {
    id: 'commute-transit',
    title: 'Commute & Transit',
    subtitle: 'Bundle · Transit + parking',
    icon: 'train-outline',
    access: 'bundle',
    cta: 'view_bundle',
    categories: ['commute', 'bundle'],
  },
  {
    id: 'aviation-now',
    title: 'Aviation Now',
    subtitle: 'Industry brief',
    icon: 'newspaper-outline',
    access: 'free',
    cta: 'add',
    categories: ['news'],
  },
  {
    id: 'family-share',
    title: 'Family Share',
    subtitle: 'Share trip status privately',
    icon: 'people-outline',
    access: 'pro',
    cta: 'unlock',
    categories: ['family'],
  },
  {
    id: 'crew-watch',
    title: 'Crew Watch',
    subtitle: 'Trip buddy awareness',
    icon: 'eye-outline',
    access: 'beta',
    cta: 'add',
    categories: ['safety', 'buddy'],
  },
  {
    id: 'non-rev-loads',
    title: 'Non-Rev / Staff Loads',
    subtitle: 'Community loads',
    icon: 'airplane-outline',
    access: 'included',
    route: '/loads',
    cta: 'open',
    categories: ['travel', 'non-rev'],
  },
  {
    id: 'crew-rest-calculator',
    title: 'Crew Rest Calculator',
    subtitle: 'Legal rest windows',
    icon: 'time-outline',
    access: 'free',
    route: '/crew-rest-calculator',
    cta: 'open',
    categories: ['rest', 'duty'],
  },
];

export function toolById(id: string): CrewTool | undefined {
  return CREW_TOOL_CATALOG.find((t) => t.id === id);
}

export function toolsByIds(ids: string[]): CrewTool[] {
  return ids.map((id) => toolById(id)).filter((t): t is CrewTool => Boolean(t));
}

export const MY_FAVORITES_IDS = ['commute-assist', 'crew-calendar'];
export const MY_RECENT_IDS = ['qr-flight-room', 'crashpad-search', 'contract-policy'];
export const MY_INCLUDED_IDS = ['fc-language', 'calendar-notes', 'non-rev-loads'];
export const MY_SUGGESTED_IDS = ['layover-intel', 'crew-calendar-pro', 'duty-guard', 'kcm-quick-help'];

export const EXPLORE_FEATURED_IDS = ['commute-assist', 'duty-guard', 'fc-language', 'layover-intel', 'kcm-quick-help', 'flight-tracker', 'contract-policy'];
export const EXPLORE_GRID_IDS = ['layover-intel', 'crashpad-search', 'commute-transit', 'airline-hub', 'crew-watch'];
export const TOP_FREE_IDS = ['kcm-quick-help', 'crashpad-search', 'crew-reset', 'aviation-now', 'calendar-notes'];
export const TOP_PREMIUM_IDS = ['duty-guard', 'fc-language', 'contract-policy', 'wake-report', 'family-share'];
export const TRENDING_IDS = ['layover-intel', 'crew-watch', 'qr-flight-room'];
export const NEW_TOOLS_IDS = ['crew-watch', 'family-share', 'wake-report'];
export const BEST_COMMUTERS_IDS = ['commute-assist', 'commute-transit', 'layover-intel'];
export const BEST_INFLIGHT_IDS = ['crew-reset', 'crew-watch', 'fc-language'];
export const BEST_PILOTS_IDS = ['duty-guard', 'flight-tracker', 'contract-policy'];

export const CREW_BUNDLES: CrewBundle[] = [
  {
    id: 'commuter-bundle',
    title: 'Commuter Bundle',
    blurb: 'Commute Assist, transit alerts, and parking helpers.',
    toolCount: 4,
    priceLabel: 'Pro add-on',
    cta: 'unlock',
    accent: 'red',
  },
  {
    id: 'duty-protection',
    title: 'Duty & Protection Bundle',
    blurb: 'Duty Guard, rest calculator, and policy assist together.',
    toolCount: 5,
    priceLabel: 'Included in Pro',
    cta: 'view',
    accent: 'navy',
  },
  {
    id: 'career-growth',
    title: 'Career Growth Bundle',
    blurb: 'Contract assist, airline hub, and training reminders.',
    toolCount: 3,
    priceLabel: '$3.99/mo',
    cta: 'unlock',
    accent: 'gold',
  },
  {
    id: 'housing-layover',
    title: 'Housing & Layover Bundle',
    blurb: 'Crashpad search, layover intel, and local tips.',
    toolCount: 4,
    priceLabel: 'Pro',
    cta: 'view',
    accent: 'red',
  },
  {
    id: 'language-bundle',
    title: 'Language Bundle',
    blurb: 'FC Language Assist plus phrase packs.',
    toolCount: 2,
    priceLabel: 'Add-on',
    cta: 'unlock',
    accent: 'red',
  },
];

export const SAVED_TOOL_IDS = ['layover-intel', 'crew-reset', 'flight-tracker'];
export const SAVED_BUNDLE_IDS = ['commuter-bundle', 'duty-protection'];
export const TRY_LATER_IDS = ['family-share', 'wake-report'];
