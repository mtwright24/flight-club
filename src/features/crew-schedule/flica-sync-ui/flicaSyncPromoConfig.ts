/**
 * Premium spotlight banners for the FLICA sync flow (one per screen).
 * Sync mode uses static PNG art from `assets/images/brand/flica-sync/` (non-interactive).
 */

export const FLICA_SYNC_PNG_CREWSWAP_TRADEBOARD = require('../../../../assets/images/brand/flica-sync/add-one.PNG');
export const FLICA_SYNC_PNG_CRASHPADS = require('../../../../assets/images/brand/flica-sync/add-two.PNG');
export const FLICA_SYNC_PNG_FUELERLINX = require('../../../../assets/images/brand/flica-sync/add-three.PNG');
export const FLICA_SYNC_PNG_UTILITY_HUB = require('../../../../assets/images/brand/flica-sync/add-four.PNG');
export const FLICA_SYNC_PNG_STAY_IN_LOOP = require('../../../../assets/images/brand/flica-sync/add-five.PNG');
export const FLICA_SYNC_PNG_NONREV_LOADS = require('../../../../assets/images/brand/flica-sync/add-six.PNG');

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
   * Optional full-width art: `require('../../../../assets/...png')` module id.
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

/** Screen 1 — primary promo under secure verification card (PNG art). */
export const FLICA_SYNC_BANNER_VERIFY: FlicaSyncPromoItem = {
  id: 'crewswap',
  title: 'CrewSwap Tradeboard',
  subtitle: 'Trade, pick up, and drop trips with ease.',
  icon: 'swap-horizontal',
  bannerImage: FLICA_SYNC_PNG_CREWSWAP_TRADEBOARD,
  route: '/crew-schedule/(tabs)/tradeboard',
  badge: 'NEW TOOL',
  ctaVariant: 'outline',
  ctaLabel: 'Explore Tradeboard',
};

/** Import step — featured banner (PNG add-six). */
export const FLICA_SYNC_BANNER_IMPORT: FlicaSyncPromoItem = {
  id: 'nonrev',
  title: 'Non-Rev · Staff Loads',
  subtitle: 'Check loads and space-available options when you travel.',
  icon: 'airplane-outline',
  bannerImage: FLICA_SYNC_PNG_NONREV_LOADS,
  route: '/loads',
  badge: 'New tool',
  ctaVariant: 'outline',
  ctaLabel: 'View loads',
};

/** Verification in progress — FuelerLinx PNG. */
export const FLICA_SYNC_BANNER_VERIFY_PROGRESS: FlicaSyncPromoItem = {
  id: 'fuelerlinx',
  title: 'FuelerLinx',
  subtitle: 'Exclusive fuel discounts for Flight Club members.',
  icon: 'navigate-outline',
  bannerImage: FLICA_SYNC_PNG_FUELERLINX,
  route: '/flight-tracker',
  badge: 'FEATURED',
  ctaVariant: 'outline',
  ctaLabel: 'Learn more',
};

/** Success beat — slim Stay in the Loop PNG. */
export const FLICA_SYNC_BANNER_SUCCESS: FlicaSyncPromoItem = {
  id: 'alerts',
  title: 'Stay in the Loop',
  subtitle: 'Turn on alerts so you never miss pairing changes or schedule updates.',
  icon: 'notifications-outline',
  bannerImage: FLICA_SYNC_PNG_STAY_IN_LOOP,
  route: '/crew-schedule/(tabs)/alerts',
  badge: 'Recommended',
  surface: 'cream',
  ctaVariant: 'outline',
  ctaLabel: 'Turn on alerts',
};

/** Compact editorial strip below verify banner (PNG add-two — non-interactive in sync mode). */
export const FLICA_SYNC_STRIP_VERIFY: FlicaSyncPromoItem = {
  id: 'crashpads',
  title: 'While you sync',
  subtitle: 'Premium crew tools unlock right after verification.',
  icon: 'home',
  bannerImage: FLICA_SYNC_PNG_CRASHPADS,
  badge: 'Did you know',
};

/** Verification-in-progress companion strip (add-four). */
export const FLICA_SYNC_STRIP_VERIFY_PROGRESS: FlicaSyncPromoItem = {
  id: 'utility',
  title: 'Helpful feature',
  subtitle: 'Your schedule hub refreshes whenever FLICA confirms this step.',
  icon: 'grid-outline',
  bannerImage: FLICA_SYNC_PNG_UTILITY_HUB,
  badge: 'Tip',
};

/** Import-phase companion strip (add-four reused — editorial only). */
export const FLICA_SYNC_STRIP_IMPORT: FlicaSyncPromoItem = {
  id: 'utility',
  title: 'While we import',
  subtitle: 'We match pairings and duty rows from your airline snapshot.',
  icon: 'grid-outline',
  bannerImage: FLICA_SYNC_PNG_UTILITY_HUB,
  badge: 'Tip',
};
