/**
 * IAP Product Catalog
 * Central definition of all in-app purchase products and their metadata
 */

export type IapSku =
  // Loads packages
  | 'fc_loads_daypass_10'
  | 'fc_loads_basic_month'
  | 'fc_loads_pro_month'
  // Credits packs
  | 'fc_credits_1'
  | 'fc_credits_5'
  | 'fc_credits_10'
  | 'fc_credits_30'
  | 'fc_credits_50'
  | 'fc_credits_100';

export type ProductKind = 'LOADS' | 'CREDITS';

export type EntitlementType =
  | 'LOADS_DAY_PASS'
  | 'LOADS_BASIC'
  | 'LOADS_PRO'
  | 'CREDITS';

export interface IapProduct {
  kind: ProductKind;
  title: string;
  description: string;
  entitlementType?: EntitlementType;
  creditsAmount?: number;
}

export const IAP_CATALOG: Record<IapSku, IapProduct> = {
  // Loads Packages
  fc_loads_daypass_10: {
    kind: 'LOADS',
    title: 'Loads Day Pass',
    description: '10 requests • 24 hours',
    entitlementType: 'LOADS_DAY_PASS',
  },
  fc_loads_basic_month: {
    kind: 'LOADS',
    title: 'Loads Basic',
    description: 'Unlimited requests • 30 days',
    entitlementType: 'LOADS_BASIC',
  },
  fc_loads_pro_month: {
    kind: 'LOADS',
    title: 'Loads Pro',
    description: 'Unlimited + Priority-ready • 30 days',
    entitlementType: 'LOADS_PRO',
  },

  // Credits Packs
  fc_credits_1: {
    kind: 'CREDITS',
    title: '1 Credit',
    description: 'Pay per request',
    entitlementType: 'CREDITS',
    creditsAmount: 1,
  },
  fc_credits_5: {
    kind: 'CREDITS',
    title: '5 Credits',
    description: 'Save vs single',
    entitlementType: 'CREDITS',
    creditsAmount: 5,
  },
  fc_credits_10: {
    kind: 'CREDITS',
    title: '10 Credits',
    description: 'Best starter',
    entitlementType: 'CREDITS',
    creditsAmount: 10,
  },
  fc_credits_30: {
    kind: 'CREDITS',
    title: '30 Credits',
    description: 'Power user',
    entitlementType: 'CREDITS',
    creditsAmount: 30,
  },
  fc_credits_50: {
    kind: 'CREDITS',
    title: '50 Credits',
    description: 'Heavy use',
    entitlementType: 'CREDITS',
    creditsAmount: 50,
  },
  fc_credits_100: {
    kind: 'CREDITS',
    title: '100 Credits',
    description: 'Max value',
    entitlementType: 'CREDITS',
    creditsAmount: 100,
  },
};

export const LOADS_SKUS: IapSku[] = [
  'fc_loads_daypass_10',
  'fc_loads_basic_month',
  'fc_loads_pro_month',
];

export const CREDITS_SKUS: IapSku[] = [
  'fc_credits_1',
  'fc_credits_5',
  'fc_credits_10',
  'fc_credits_30',
  'fc_credits_50',
  'fc_credits_100',
];

export const ALL_SKUS = [...LOADS_SKUS, ...CREDITS_SKUS];
