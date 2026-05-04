/**
 * Parse FLICA multi-month HTML (Mar/Apr/May) and upsert into Supabase `crew_schedule`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { FlicaScheduleMonthResult } from '../dev/flicaPoCScheduleHttp';
import { parseFlicaScheduleHtml } from './flicaScheduleHtmlParser';

export type CrewScheduleRow = {
  id: string;
  user_id: string;
  airline: string;
  month_key: string;
  pairings: unknown;
  stats: unknown;
  raw_html: string | null;
  imported_at: string;
  updated_at: string;
};

/** BlockDate from FLICA e.g. `0326` → `2026-03`. */
export function flicaBlockDateToMonthKey(blockDate: string): string {
  const d = (blockDate ?? '').trim();
  if (d.length < 4) return '';
  const mm = d.slice(0, 2);
  const yy = d.slice(2, 4);
  const year = 2000 + parseInt(yy, 10);
  if (!Number.isFinite(year) || !/^\d{2}$/.test(mm)) return '';
  return `${year}-${mm}`;
}

export async function persistFlicaMultiMonthToCrewSchedule(
  supabase: SupabaseClient,
  userId: string,
  multiMonth: FlicaScheduleMonthResult[],
  airline: string = 'jetblue'
): Promise<{ error: Error | null }> {
  try {
    for (const row of multiMonth) {
      const monthKey = flicaBlockDateToMonthKey(row.blockDate);
      if (!monthKey || !row.html) continue;

      const parsed = parseFlicaScheduleHtml(row.html, monthKey);

      const statsPayload = {
        block: parsed.stats.block,
        credit: parsed.stats.credit,
        tafb: parsed.stats.tafb,
        ytd: parsed.stats.ytd,
        daysOff: parsed.stats.daysOff,
      };

      const { error } = await supabase.from('crew_schedule').upsert(
        {
          user_id: userId,
          airline,
          month_key: monthKey,
          pairings: parsed.pairings as unknown[],
          stats: statsPayload,
          raw_html: row.html,
          imported_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,airline,month_key' }
      );

      if (error) {
        return { error: new Error(error.message) };
      }
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
