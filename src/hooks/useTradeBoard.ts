/**
 * useTradeBoard - Fetch and manage trades for a specific board
 * Auto-fetches on board change, handles filters and sorting
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabaseClient';
import type { TradeBoard, TradeFilter, TradePost, TradeSort, SortDirection } from '../types/trades';

export function useTradeBoard(board: TradeBoard | null) {
  const [posts, setPosts] = useState<TradePost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!board) {
      setPosts([]);
      return;
    }

    const fetchPosts = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('trade_posts')
          .select(
            `
            id,
            board_id,
            user_id,
            type,
            pairing_date,
            end_date,
            report_time,
            route_from,
            route_to,
            trip_number,
            credit_minutes,
            block_minutes,
            duty_minutes,
            tafb_minutes,
            notes,
            has_screenshot,
            screenshot_url,
            has_incentive,
            incentive_amount,
            incentive_note,
            status,
            interest_count,
            created_at,
            updated_at,
            user:user_id (id, handle, display_name, avatar_url)
          `
          )
          .eq('board_id', board.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;

        const normalized = (data || []).map((item: any) => ({
          ...item,
          user: Array.isArray(item.user) ? item.user[0] : item.user,
        })) as TradePost[];
        setPosts(normalized);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch trades';
        setError(message);
        console.error('Error fetching trades:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [board?.id]);

  return { posts, loading, error };
}

/**
 * useTradeBoards - Fetch all available boards for user's profile
 * Matches user's airline, base, and role
 */

export function useTradeBoards() {
  const { session } = useAuth();
  const [boards, setBoards] = useState<TradeBoard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setBoards([]);
      return;
    }

    const fetchBoards = async () => {
      setLoading(true);
      setError(null);

      try {
        // First, get user's profile to get airline, base, role
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('airline, base, role')
          .eq('id', userId)
          .single();

        if (profileError) throw profileError;

        if (!profile?.airline || !profile?.base || !profile?.role) {
          setError('Please complete your profile to access crew exchange');
          return;
        }

        // Now fetch boards matching their profile
        const { data: boardsData, error: boardsError } = await supabase
          .from('trade_boards')
          .select('*')
          .eq('airline', profile.airline)
          .eq('base', profile.base)
          .eq('role', profile.role)
          .eq('is_active', true)
          .order('fleet', { ascending: true });

        if (boardsError) throw boardsError;

        setBoards(boardsData || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch boards';
        setError(message);
        console.error('Error fetching boards:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBoards();
  }, [session?.user?.id]);

  return { boards, loading, error };
}

/**
 * useTradeFilter - Manage filter state and apply to posts
 */

export function useTradeFilter(posts: TradePost[], initialFilters?: TradeFilter) {
  const [filters, setFilters] = useState<TradeFilter>(initialFilters || {});

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // Type filter
      if (filters.types && filters.types.length > 0 && !filters.types.includes(post.type)) {
        return false;
      }

      const effectiveDateRange = getDateRange(filters);
      if (effectiveDateRange.from && post.pairing_date < effectiveDateRange.from) {
        return false;
      }
      if (effectiveDateRange.to && post.pairing_date > effectiveDateRange.to) {
        return false;
      }

      // Report time window
      if ((filters.report_start_time || filters.report_end_time) && post.report_time) {
        const timeMinutes = toMinutes(post.report_time);
        const startMinutes = filters.report_start_time ? toMinutes(filters.report_start_time) : null;
        const endMinutes = filters.report_end_time ? toMinutes(filters.report_end_time) : null;

        if (startMinutes !== null && endMinutes !== null) {
          if (startMinutes <= endMinutes) {
            if (timeMinutes < startMinutes || timeMinutes > endMinutes) return false;
          } else {
            if (timeMinutes < startMinutes && timeMinutes > endMinutes) return false;
          }
        } else if (startMinutes !== null && timeMinutes < startMinutes) {
          return false;
        } else if (endMinutes !== null && timeMinutes > endMinutes) {
          return false;
        }
      } else if (filters.report_start_time || filters.report_end_time) {
        return false;
      }

      // Day part filter (AM/PM/overnight)
      if (filters.day_parts && filters.day_parts.length > 0 && post.report_time) {
        const hour = parseInt(post.report_time.split(':')[0], 10);
        let dayPart: 'AM' | 'PM' | 'overnight' = 'AM';
        if (hour >= 12 && hour < 20) dayPart = 'PM';
        if (hour >= 20 || hour < 6) dayPart = 'overnight';
        if (!filters.day_parts.includes(dayPart)) {
          return false;
        }
      }

      // Incentive filter
      if (filters.has_incentive_only && !post.has_incentive) {
        return false;
      }
      if (filters.min_incentive && (!post.incentive_amount || post.incentive_amount < filters.min_incentive)) {
        return false;
      }

      // Screenshot filter
      if (filters.has_screenshot_only && !post.has_screenshot) {
        return false;
      }

      // Route filters
      if (filters.route_from && post.route_from !== filters.route_from) {
        return false;
      }
      if (filters.route_to && post.route_to !== filters.route_to) {
        return false;
      }

      // Contains / exclude airports
      if (filters.contains_airports && filters.contains_airports.length > 0) {
        const contains = filters.contains_airports.some((code) => code === post.route_from || code === post.route_to);
        if (!contains) return false;
      }
      if (filters.exclude_airports && filters.exclude_airports.length > 0) {
        const excluded = filters.exclude_airports.some((code) => code === post.route_from || code === post.route_to);
        if (excluded) return false;
      }

      // Trip length filter
      if (filters.trip_length) {
        const startDate = new Date(post.pairing_date);
        const endDate = post.end_date ? new Date(post.end_date) : startDate;
        const length = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        if (filters.trip_length === 1 && length !== 1) return false;
        if (filters.trip_length === 2 && length !== 2) return false;
        if (filters.trip_length === 3 && length < 3) return false;
      }

      // Credit minutes range
      if (filters.min_credit_minutes && (!post.credit_minutes || post.credit_minutes < filters.min_credit_minutes)) {
        return false;
      }
      if (filters.max_credit_minutes && (!post.credit_minutes || post.credit_minutes > filters.max_credit_minutes)) {
        return false;
      }

      // Block minutes range
      if (filters.min_block_minutes && (!post.block_minutes || post.block_minutes < filters.min_block_minutes)) {
        return false;
      }
      if (filters.max_block_minutes && (!post.block_minutes || post.block_minutes > filters.max_block_minutes)) {
        return false;
      }

      // Duty minutes range
      if (filters.min_duty_minutes && (!post.duty_minutes || post.duty_minutes < filters.min_duty_minutes)) {
        return false;
      }
      if (filters.max_duty_minutes && (!post.duty_minutes || post.duty_minutes > filters.max_duty_minutes)) {
        return false;
      }

      // Search in notes
      if (filters.search_notes) {
        const searchLower = filters.search_notes.toLowerCase();
        if (!post.notes?.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      return true;
    });
  }, [posts, filters]);

  const updateFilters = (newFilters: Partial<TradeFilter>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  return {
    filters,
    setFilters,
    updateFilters,
    clearFilters,
    filteredPosts,
  };
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDateRange(filters: TradeFilter): { from?: string; to?: string } {
  if (filters.date_from || filters.date_to) {
    return { from: filters.date_from, to: filters.date_to };
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  switch (filters.date_range) {
    case 'today':
      return { from: formatDateOnly(startOfToday), to: formatDateOnly(startOfToday) };
    case 'tomorrow': {
      const tomorrow = new Date(startOfToday);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { from: formatDateOnly(tomorrow), to: formatDateOnly(tomorrow) };
    }
    case 'next7': {
      const end = new Date(startOfToday);
      end.setDate(end.getDate() + 6);
      return { from: formatDateOnly(startOfToday), to: formatDateOnly(end) };
    }
    case 'next14': {
      const end = new Date(startOfToday);
      end.setDate(end.getDate() + 13);
      return { from: formatDateOnly(startOfToday), to: formatDateOnly(end) };
    }
    case 'weekend': {
      const day = startOfToday.getDay(); // 0 Sun, 6 Sat
      const saturday = new Date(startOfToday);
      const sunday = new Date(startOfToday);
      if (day === 6) {
        sunday.setDate(sunday.getDate() + 1);
        return { from: formatDateOnly(saturday), to: formatDateOnly(sunday) };
      }
      if (day === 0) {
        return { from: formatDateOnly(sunday), to: formatDateOnly(sunday) };
      }
      const daysUntilSaturday = (6 - day + 7) % 7;
      saturday.setDate(saturday.getDate() + daysUntilSaturday);
      sunday.setDate(saturday.getDate() + 1);
      return { from: formatDateOnly(saturday), to: formatDateOnly(sunday) };
    }
    default:
      return {};
  }
}

/**
 * useTradeSort - Manage Sort1 + Sort2 (FLiCA-style)
 */

export function useTradeSort(posts: TradePost[], initialSort?: TradeSort) {
  const [sort, setSort] = useState<TradeSort>(
    initialSort || {
      sort1_field: 'pairing_date',
      sort1_direction: 'asc',
    }
  );

  const sortedPosts = useMemo(() => {
    let sorted = [...posts];

    // Apply Sort2 first (lower priority)
    if (sort.sort2_field) {
      sorted.sort((a, b) => {
        const aVal = a[sort.sort2_field as keyof TradePost];
        const bVal = b[sort.sort2_field as keyof TradePost];
        return compareValues(aVal, bVal, sort.sort2_direction || 'asc');
      });
    }

    // Apply Sort1 (higher priority)
    sorted.sort((a, b) => {
      const aVal = a[sort.sort1_field as keyof TradePost];
      const bVal = b[sort.sort1_field as keyof TradePost];
      return compareValues(aVal, bVal, sort.sort1_direction);
    });

    return sorted;
  }, [posts, sort]);

  const updateSort = (newSort: Partial<TradeSort>) => {
    setSort((prev) => ({ ...prev, ...newSort }));
  };

  const resetSort = () => {
    setSort({
      sort1_field: 'pairing_date',
      sort1_direction: 'asc',
    });
  };

  return { sort, setSort, updateSort, resetSort, sortedPosts };
}

/**
 * Helper function to compare sort values
 */
function compareValues(a: any, b: any, direction: SortDirection): number {
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;

  let comparison = 0;
  if (typeof a === 'string') {
    comparison = a.localeCompare(b);
  } else if (typeof a === 'number') {
    comparison = a - b;
  } else {
    comparison = String(a).localeCompare(String(b));
  }

  return direction === 'asc' ? comparison : -comparison;
}

/**
 * useSavedAlerts - Fetch and manage user's saved alerts
 */
export function useSavedAlerts(boardId?: string) {
  const { session } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || !boardId) return;

    const fetchAlerts = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('saved_alerts')
          .select('*')
          .eq('user_id', userId)
          .eq('board_id', boardId);

        setAlerts(data || []);
      } catch (err) {
        console.error('Error fetching alerts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
  }, [session?.user?.id, boardId]);

  return { alerts, loading };
}
