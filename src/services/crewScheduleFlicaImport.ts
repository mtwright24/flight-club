/**
 * Parse FLICA multi-month HTML (Mar/Apr/May) and upsert into Supabase `crew_schedule`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { fcDevMirrorScheduleLogToFile } from "../dev/fcDevFileLogger";
import type { FlicaScheduleMonthResult } from "../dev/flicaPoCScheduleHttp";
import { runFlicaRawParseAuditIfEnabled } from "../dev/flicaRawParseAudit";
import {
  parseFlicaScheduleHtml,
  type FlicaMonthStats,
  type FlicaPairing,
} from "./flicaScheduleHtmlParser";

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

export type CrewScheduleFlicaParsedSnapshot = {
  pairings: FlicaPairing[];
  stats: FlicaMonthStats;
};

/**
 * Upserts `crew_schedule` for FLICA HTML (direct or test multi-month path).
 * Logs capture → save → read-back for schedule-tab `raw_html` debugging.
 */
export async function upsertCrewScheduleFlicaHtmlSnapshot(
  supabase: SupabaseClient,
  userId: string,
  monthKey: string,
  html: string,
  parsed: CrewScheduleFlicaParsedSnapshot,
  airline: string = "jetblue",
): Promise<{ error: Error | null }> {
  const htmlTrim = html ?? "";
  const hasTable1 = /<table[^>]+name=['"]table1['"]/i.test(htmlTrim);
  const hasTable2 = /<table[^>]+name=['"]table2['"]/i.test(htmlTrim);
  const startsWithHtml = htmlTrim
    .trimStart()
    .toLowerCase()
    .startsWith("<html");
  const captured = {
    monthKey,
    rawHtmlLength: htmlTrim.length,
    hasTable1,
    hasTable2,
    startsWithHtml,
  };
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[FC_RAW_HTML_IMPORT_CAPTURED]", captured);
  }
  fcDevMirrorScheduleLogToFile("FC_RAW_HTML_IMPORT_CAPTURED", captured);

  const statsPayload = {
    block: parsed.stats.block,
    credit: parsed.stats.credit,
    tafb: parsed.stats.tafb,
    ytd: parsed.stats.ytd,
    daysOff: parsed.stats.daysOff,
  };

  const { data: upsertRow, error } = await supabase
    .from("crew_schedule")
    .upsert(
      {
        user_id: userId,
        airline,
        month_key: monthKey,
        pairings: parsed.pairings as unknown[],
        stats: statsPayload,
        raw_html: htmlTrim,
        imported_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,airline,month_key" },
    )
    .select("id")
    .single();

  const rowId = upsertRow?.id ?? null;
  const savePayload = {
    monthKey,
    saved: !error,
    rawHtmlLength: htmlTrim.length,
    rowId,
    userId,
    profileId: userId,
    error: error?.message ?? null,
  };
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[FC_RAW_HTML_SAVE_CHECK]", savePayload);
  }
  fcDevMirrorScheduleLogToFile("FC_RAW_HTML_SAVE_CHECK", savePayload);

  if (error) {
    return { error: new Error(error.message) };
  }

  const { data: rb, error: rbErr } = await supabase
    .from("crew_schedule")
    .select("id, raw_html, month_key")
    .eq("user_id", userId)
    .eq("airline", airline)
    .eq("month_key", monthKey)
    .maybeSingle();

  const readback = {
    monthKey,
    found: Boolean(rb) && !rbErr,
    rawHtmlLength: rb?.raw_html?.length ?? 0,
    rowId: rb?.id ?? rowId,
    userId,
    profileId: userId,
    error: rbErr?.message ?? null,
  };
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[FC_RAW_HTML_READBACK_CHECK]", readback);
  }
  fcDevMirrorScheduleLogToFile("FC_RAW_HTML_READBACK_CHECK", readback);

  if (rbErr) {
    return { error: new Error(rbErr.message) };
  }
  if (!rb) {
    return {
      error: new Error(
        "crew_schedule read-back returned no row after upsert",
      ),
    };
  }
  return { error: null };
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
      runFlicaRawParseAuditIfEnabled(row.html, monthKey, parsed);

      const { error } = await upsertCrewScheduleFlicaHtmlSnapshot(
        supabase,
        userId,
        monthKey,
        row.html,
        { pairings: parsed.pairings, stats: parsed.stats },
        airline,
      );
      if (error) return { error };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
