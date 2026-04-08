export type CrewToolsMode = 'my' | 'explore' | 'bundles' | 'saved';

export type ToolAccess =
  | 'free'
  | 'pro'
  | 'included'
  | 'addon'
  | 'bundle'
  | 'owned'
  | 'beta'
  | 'new';

export type ToolCta = 'open' | 'add' | 'unlock' | 'included' | 'view_bundle' | 'owned' | 'saved';

export type CrewTool = {
  id: string;
  title: string;
  subtitle?: string;
  /** Ionicons glyph name */
  icon: string;
  access: ToolAccess;
  /** Expo Router path when the tool is wired in-app */
  route?: string;
  rating?: number;
  reviewCount?: number;
  cta: ToolCta;
  roleHint?: string;
  categories?: string[];
};

export type CrewBundle = {
  id: string;
  title: string;
  blurb: string;
  toolCount: number;
  priceLabel: string;
  cta: 'view' | 'unlock';
  accent: 'red' | 'navy' | 'gold';
};
