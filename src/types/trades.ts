/**
 * Crew Exchange (Trade Board) Types
 * Defines all interfaces and types for the modern tradeboard system
 */

export type TradeType = 'swap' | 'drop' | 'pickup';
export type SortDirection = 'asc' | 'desc';

/**
 * TradeBoard - Represents a specific board for a crew base
 * Separated by airline, base, role, and optionally fleet
 */
export interface TradeBoard {
  id: string;
  airline: string;
  base: string;
  role: string;
  fleet?: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * TradePost - Individual trade/swap/drop listing
 * Compact row format: 2 lines max in feed view
 */
export interface TradePost {
  id: string;
  board_id: string;
  user_id: string;
  
  // Trade type and timing
  type: TradeType;
  pairing_date: string; // YYYY-MM-DD
  end_date?: string; // For multi-day trades
  report_time?: string; // HH:MM format
  
  // Route info
  route_from?: string;
  route_to?: string;
  trip_number?: string;
  
  // Metrics (in minutes, for easy calculation)
  credit_minutes?: number;
  block_minutes?: number;
  duty_minutes?: number;
  tafb_minutes?: number;
  
  // Notes
  notes?: string;
  
  // Screenshot
  has_screenshot: boolean;
  screenshot_url?: string;
  
  // Incentive (payment offer)
  has_incentive: boolean;
  incentive_amount?: number; // in dollars
  incentive_note?: string;
  
  // Metadata
  created_at: string;
  updated_at: string;
  status?: 'active' | 'completed' | 'cancelled';
  
  // User info (denormalized for display)
  user?: {
    id: string;
    display_name?: string;
    handle?: string;
    avatar_url?: string;
  };
  
  // Engagement
  interest_count?: number;
  user_interested?: boolean;
}

/**
 * SavedAlert - Store filter + sort preferences for later
 * MVP: Scaffolding for future premium alert features
 */
export interface SavedAlert {
  id: string;
  user_id: string;
  board_id: string;
  
  name: string;
  filter_json: TradeFilter & TradeSort;
  is_enabled: boolean;
  
  // Future: notification settings
  notify_email?: boolean;
  notify_push?: boolean;
  
  created_at: string;
  updated_at: string;
}

/**
 * TradeFilter - All available filters for tradeboard
 * Used for quick chips and advanced filter sheet
 */
export interface TradeFilter {
  // Type filters (quick chips)
  types?: TradeType[]; // 'swap', 'drop', 'pickup'

  // Time window filters (quick chips)
  date_range?: 'today' | 'tomorrow' | 'weekend' | 'next7' | 'next14' | 'custom';
  date_from?: string; // YYYY-MM-DD
  date_to?: string; // YYYY-MM-DD

  // Report time window
  report_start_time?: string; // HH:MM
  report_end_time?: string; // HH:MM

  // Day part (quick chips)
  day_parts?: ('AM' | 'PM' | 'overnight')[];

  // Incentive filter (quick chip)
  has_incentive_only?: boolean;
  min_incentive?: number;

  // Screenshot filter (quick chip)
  has_screenshot_only?: boolean;

  // Advanced filters
  route_from?: string;
  route_to?: string;
  contains_airports?: string[];
  exclude_airports?: string[];

  // Trip length
  trip_length?: 1 | 2 | 3; // 3 = 3+ days

  // Credit minutes range
  min_credit_minutes?: number;
  max_credit_minutes?: number;

  // Block minutes range
  min_block_minutes?: number;
  max_block_minutes?: number;

  // Duty minutes range
  min_duty_minutes?: number;
  max_duty_minutes?: number;

  // Search in notes
  search_notes?: string;
}

/**
 * TradeSort - FLiCA-style sorting (Sort1 required, Sort2 optional)
 * Defines how the feed is ordered
 */
export interface TradeSort {
  // Primary sort (required)
  sort1_field: 'pairing_date' | 'credit_minutes' | 'incentive_amount' | 'created_at';
  sort1_direction: SortDirection;
  
  // Secondary sort (optional)
  sort2_field?: 'pairing_date' | 'credit_minutes' | 'incentive_amount' | 'created_at';
  sort2_direction?: SortDirection;
}

/**
 * TradeInterest - Track user interest/reactions to trades
 * MVP: Simple "interested" count, future: messaging/negotiation
 */
export interface TradeInterest {
  id: string;
  trade_id: string;
  user_id: string;
  interested_at: string;
}

/**
 * TradeRowData - Compact 2-line display for feed
 * Line 1: Route (AAA→BBB) • Trip • Type [$ incentive] [📷 screenshot]
 * Line 2: Date • Time • Credit mins (right-aligned: interested count)
 */
export interface TradeRowData extends TradePost {
  // Computed display fields
  display_route?: string; // "LAX→JFK" or "LAX→? (pickup)"
  display_minutes?: string; // "245cr/300bl" or "245 CR"
  display_time?: string; // "12:30p" or "--:--"
  display_date?: string; // "Jan 15" or "Tomorrow"
}

/**
 * CrewExchangeState - Global state for the exchange feature
 */
export interface CrewExchangeState {
  // Current board
  selected_board?: TradeBoard;
  
  // Posts on board
  posts: TradePost[];
  posts_loading: boolean;
  posts_error?: string;
  
  // Filter state
  active_filters: TradeFilter;
  filter_dirty: boolean; // User has unsaved filter changes
  
  // Sort state
  sort: TradeSort;
  
  // UI state
  show_advanced_filters: boolean;
  show_sort_picker: boolean;
  
  // Saved alerts (MVP)
  saved_alerts: SavedAlert[];
  alerts_loading: boolean;
}

/**
 * PostTradeFormData - Form for creating a new trade
 */
export interface PostTradeFormData {
  type: TradeType;
  pairing_date: string;
  end_date?: string;
  report_time?: string;
  
  route_from?: string;
  route_to?: string;
  trip_number?: string;
  
  credit_minutes?: number;
  block_minutes?: number;
  duty_minutes?: number;
  tafb_minutes?: number;
  
  notes?: string;
  
  screenshot_uri?: string; // Local file URI before upload
  has_incentive: boolean;
  incentive_amount?: number;
  incentive_note?: string;
}
