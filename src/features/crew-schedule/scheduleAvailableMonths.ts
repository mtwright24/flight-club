/**
 * Schedule tab month navigation: only months that actually have imported/stored data.
 */
import { distinctUserScheduleMonthKeys } from './scheduleApi';
import { supabase } from '../../lib/supabaseClient';

export type ScheduleYearMonth = { year: number; month: number };

function parseMonthKey(mk: string): ScheduleYearMonth | null {
  const s = String(mk ?? '')
    .trim()
    .slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  const y = parseInt(s.slice(0, 4), 10);
  const m = parseInt(s.slice(5, 7), 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function ord(y: number, m: number): number {
  return y * 12 + (m - 1);
}

/** Distinct YYYY-MM from `schedule_entries.date` (captures carryover legs dated in month M while `month_key` differs). */
async function distinctCalendarMonthsFromEntryDates(): Promise<string[]> {
  const { data: au } = await supabase.auth.getUser();
  const uid = au.user?.id;
  if (!uid) return [];
  const set = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data } = await supabase
      .from('schedule_entries')
      .select('date')
      .eq('user_id', uid)
      .range(from, from + pageSize - 1);
    if (!data?.length) break;
    for (const r of data) {
      const d = String((r as { date?: string }).date ?? '')
        .trim()
        .slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(d)) set.add(d);
    }
    if (data.length < pageSize) break;
  }
  return [...set].sort();
}

/**
 * Union of batch/month_key/metrics keys and calendar `date` months — source of truth for navigable months.
 */
export async function getAvailableImportedScheduleMonths(): Promise<ScheduleYearMonth[]> {
  const [fromMeta, fromDates] = await Promise.all([
    distinctUserScheduleMonthKeys().catch(() => [] as string[]),
    distinctCalendarMonthsFromEntryDates().catch(() => [] as string[]),
  ]);
  const set = new Set<string>();
  for (const k of [...fromMeta, ...fromDates]) {
    const t = String(k).trim().slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(t)) set.add(t);
  }
  const out: ScheduleYearMonth[] = [];
  for (const k of set) {
    const p = parseMonthKey(k);
    if (p) out.push(p);
  }
  out.sort((a, b) => ord(a.year, a.month) - ord(b.year, b.month));
  return out;
}

export function clampYearMonthToImportedScheduleMonths(
  year: number,
  month: number,
  available: ScheduleYearMonth[],
): ScheduleYearMonth | null {
  if (!available.length) return null;
  if (available.some((x) => x.year === year && x.month === month)) {
    return { year, month };
  }
  const o = ord(year, month);
  let best = available[0]!;
  let bestDist = Infinity;
  for (const m of available) {
    const d = Math.abs(ord(m.year, m.month) - o);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

export function tryStepImportedScheduleMonth(
  year: number,
  month: number,
  delta: -1 | 1,
  available: ScheduleYearMonth[],
): ScheduleYearMonth | null {
  if (!available.length) return null;
  const sorted = [...available].sort((a, b) => ord(a.year, a.month) - ord(b.year, b.month));
  const idx = sorted.findIndex((x) => x.year === year && x.month === month);
  if (idx < 0) return null;
  const nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= sorted.length) return null;
  return sorted[nextIdx]!;
}

export function canGoToPreviousImportedMonth(
  year: number,
  month: number,
  available: ScheduleYearMonth[],
): boolean {
  return tryStepImportedScheduleMonth(year, month, -1, available) != null;
}

export function canGoToNextImportedMonth(
  year: number,
  month: number,
  available: ScheduleYearMonth[],
): boolean {
  return tryStepImportedScheduleMonth(year, month, 1, available) != null;
}
