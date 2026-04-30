/**
 * Premium spotlight banners for the FLICA sync flow (one per screen).
 * Edit copy, routes, or icons here — no import-engine changes required.
 */

export type FlicaSyncPromoId =
  | 'crewswap'
  | 'alerts'
  | 'fuelerlinx'
  | 'nonrev'
  | 'crashpads'
  | 'utility';

export type FlicaSyncPromoItem = {
  id: FlicaSyncPromoId;
  title: string;
  subtitle: string;
  /** Ionicons glyph name (e.g. airplane-outline) */
  icon: string;
  /**
   * Optional full-width art: `require('../../../assets/...png')` module id.
   * When set, banner can render image-led layout (see `FlicaSyncPromoBanner`).
   */
  bannerImage?: number;
  /** Optional Expo Router path — if set, banner can navigate on press */
  route?: string;
  /** Small uppercase label (e.g. FEATURED, NEW TOOL) */
  badge?: string;
  /** CTA treatment — outline matches CrewSwap mockup pill */
  ctaVariant?: 'chevron' | 'outline';
  ctaLabel?: string;
  /** Slim banner background */
  surface?: 'default' | 'cream';
};

/** Compact spotlight tiles on import screen (mockup-style row of three). */
export type FlicaSyncImportSpotlightItem = {
  id: string;
  title: string;
  chip: string;
  icon: string;
  route?: string;
};

export const FLICA_SYNC_IMPORT_SPOTLIGHTS: FlicaSyncImportSpotlightItem[] = [
  {
    id: 'nonrev',
    title: 'Non-Rev / Staff Loads',
    chip: 'Travel',
    icon: 'airplane',
    route: '/loads',
  },
  {
    id: 'crashpads',
    title: 'Crashpads / Housing',
    chip: 'Home',
    icon: 'home',
    route: '/crashpads',
  },
  {
    id: 'utility',
    title: 'Utility Hub',
    chip: 'Tools',
    icon: 'grid-outline',
    route: '/menu',
  },
];

/** Screen 1 — under secure verification card (mockup: CrewSwap Tradeboard + NEW TOOL). */
export const FLICA_SYNC_BANNER_VERIFY: FlicaSyncPromoItem = {
  id: 'crewswap',
  title: 'CrewSwap Tradeboard',
  subtitle: 'Trade, pick up, and drop trips with ease.',
  icon: 'swap-horizontal',
  route: '/crew-schedule/(tabs)/tradeboard',
  badge: 'NEW TOOL',
  ctaVariant: 'outline',
  ctaLabel: 'Explore Tradeboard',
};

/** Screen 3 — during schedule import. */
export const FLICA_SYNC_BANNER_IMPORT: FlicaSyncPromoItem = {
  id: 'nonrev',
  title: 'Non-Rev · Staff Loads',
  subtitle: 'Check loads and space-available options when you travel.',
  icon: 'airplane-outline',
  route: '/loads',
  badge: 'New tool',
  ctaVariant: 'outline',
  ctaLabel: 'View loads',
};

/** Screen 2 — verification in progress (mockup: FuelerLinx featured). */
export const FLICA_SYNC_BANNER_VERIFY_PROGRESS: FlicaSyncPromoItem = {
  id: 'fuelerlinx',
  title: 'FuelerLinx',
  subtitle: 'Exclusive fuel discounts for Flight Club members.',
  icon: 'navigate-outline',
  route: '/flight-tracker',
  badge: 'FEATURED',
  ctaVariant: 'outline',
  ctaLabel: 'Learn more',
};

/** Screen 4 — slim follow-up under success. */
export const FLICA_SYNC_BANNER_SUCCESS: FlicaSyncPromoItem = {
  id: 'alerts',
  title: 'Stay in the Loop',
  subtitle: 'Turn on alerts so you never miss pairing changes or schedule updates.',
  icon: 'notifications-outline',
  route: '/crew-schedule/(tabs)/alerts',
  badge: 'Recommended',
  surface: 'cream',
  ctaVariant: 'outline',
  ctaLabel: 'Turn on alerts',
};

/** Import-phase rotating banners (informational during sync — routes ignored on press in sync mode). */
export const FLICA_SYNC_IMPORT_ROTATING_PROMOS: FlicaSyncPromoItem[] = [
  FLICA_SYNC_BANNER_IMPORT,
  FLICA_SYNC_BANNER_VERIFY_PROGRESS,
  FLICA_SYNC_BANNER_VERIFY,
];
