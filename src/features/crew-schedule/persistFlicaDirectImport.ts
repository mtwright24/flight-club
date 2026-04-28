/**
 * FLICA direct HTTP (scheduledetail HTML) → schedule_pairings + schedule_pairing_legs
 * and calendar apply rows (schedule_entries) for the existing schedule tab.
 */

import { supabase } from '../../lib/supabaseClient';
import {
  parseFlicaScheduleHtml,
  type FlicaLeg,
  type FlicaPairing,
  type FlicaMonthStats,
} from '../../services/flicaScheduleHtmlParser';
import { buildApplyRowsFromPairingBatch, applyReplaceMonth, type ApplyRow } from './scheduleApi';
import { createScheduleImport } from './jetblueFlicaImport';
import { extractLayoverRestFourDigits } from './scheduleTime';
import { normalizeFlicaParsedPairing } from './scheduleNormalizer';

const YEAR = 2026;

const MONTH_CONFIG = [
  { month: 3, monthKey: '2026-03' as const, htmlIndex: 0 as const },
  { month: 4, monthKey: '2026-04' as const, htmlIndex: 1 as const },
  { month: 5, monthKey: '2026-05' as const, htmlIndex: 2 as const },
] as const;

function flicaHhmmToDecimal(hhmm: string | null | undefined): number | null {
  if (hhmm == null || !/^\d{4}$/.test(String(hhmm).trim())) return null;
  const s = String(hhmm).trim();
  const h = parseInt(s.slice(0, 2), 10);
  const m = parseInt(s.slice(2), 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h + m / 60;
}

function flicaHhmmToMinutes(hhmm: string | null | undefined): number | null {
  if (hhmm == null || !/^\d{4}$/.test(String(hhmm).trim())) return null;
  const s = String(hhmm).trim();
  const h = parseInt(s.slice(0, 2), 10);
  const m = parseInt(s.slice(2), 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** YYYY-MM-DD in local calendar, or null if day invalid for that month. */
function calendarIsoInMonth(year: number, month1to12: number, day: number): string | null {
  const d = new Date(year, month1to12 - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month1to12 - 1 || d.getDate() !== day) {
    return null;
  }
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Resolves a leg’s `duty_date` from the **DD** of the D-END duty period when
 * {@link FlicaLeg.dutyPeriodDate} is set (&gt; 0), else {@link FlicaLeg.date} (FLICA leg row).
 * `dutyPeriodDay` matches that calendar day’s DY when present; we do not shift by local departure time.
 *
 * 1) Prefer **YYYY-MM-DD = schedule file’s month** + the effective day-of-month when that date is in
 *    `[pairing.startDate, pairing.endDate]`.
 * 2) If not (e.g. carry-in/carry-out), use the same DOM in adacent months (file month ±1) in range, then
 *    disambiguate with `prevResolvedIso` so legs stay in order.
 * 3) No heuristics that push the effective DOM to the *next* calendar month because it &lt; start’s DOM.
 */
function dutyDateIso(
  pairing: FlicaPairing,
  leg: FlicaLeg,
  monthKey: string,
  prevResolvedIso: string | null
): string {
  const y = parseInt(monthKey.slice(0, 4), 10);
  const fileM = parseInt(monthKey.slice(5, 7), 10);
  const dom = leg.dutyPeriodDate > 0 ? leg.dutyPeriodDate : leg.date;
  const d = String(dom).padStart(2, '0');
  const start = pairing.startDate;
  const end = pairing.endDate;
  const mStr = String(fileM).padStart(2, '0');
  const yStr = String(y);
  if (!Number.isFinite(y) || !Number.isFinite(fileM) || !start || !end) {
    return `${monthKey.slice(0, 4)}-${monthKey.slice(5, 7)}-${d}`;
  }

  const inFileMonth = calendarIsoInMonth(y, fileM, dom);
  if (inFileMonth && inFileMonth >= start && inFileMonth <= end) {
    return inFileMonth;
  }

  const inRange: string[] = [];
  for (const delta of [-1, 0, 1] as const) {
    const dt = new Date(y, fileM - 1 + delta, 1);
    const cy = dt.getFullYear();
    const cm = dt.getMonth() + 1;
    const iso = calendarIsoInMonth(cy, cm, dom);
    if (iso && iso >= start && iso <= end) {
      inRange.push(iso);
    }
  }
  inRange.sort();
  if (inRange.length > 0) {
    if (prevResolvedIso == null) return inRange[0]!;
    const after = inRange.find((iso) => iso > prevResolvedIso);
    if (after) return after;
    const sameOrAfter = inRange.find((iso) => iso >= prevResolvedIso);
    if (sameOrAfter) return sameOrAfter;
    return inRange[0]!;
  }
  return `${yStr}-${mStr}-${d}`;
}

/**
 * FLICA "DPS-ARS" route cell can use hyphen, en dash, or odd splits; a naive split on "-"
 * can turn `JFK-LAS` into J / FK / LAS and produce bogus dep/arr. Prefer a single IATA–IATA match first.
 */
function flicaRouteToAirports(route: string): { dep: string; arr: string } {
  const raw = (route ?? '').trim();
  if (!raw) return { dep: '', arr: '' };
  const n = raw.replace(/[–—−]/g, '-').replace(/\s+/g, '');
  const pair = n.match(/^([A-Z]{3,4})-([A-Z]{3,4})$/i);
  if (pair) {
    return { dep: pair[1].toUpperCase(), arr: pair[2].toUpperCase() };
  }
  const parts = n.split('-').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      dep: (parts[0] ?? '').toUpperCase(),
      arr: (parts[parts.length - 1] ?? '').toUpperCase(),
    };
  }
  if (parts.length === 1 && /^[A-Z]{6}$/i.test(parts[0]!)) {
    const p0 = parts[0]!.toUpperCase();
    return { dep: p0.slice(0, 3), arr: p0.slice(3, 6) };
  }
  return { dep: (parts[0] ?? '').toUpperCase(), arr: (parts[1] ?? '').toUpperCase() };
}

/** FLICA time token e.g. 0600L, 1413L → 4-digit string. */
function flicaTimeTokenToDigits(s: string | null | undefined): string | null {
  if (s == null || !String(s).trim()) return null;
  const d = String(s).replace(/\D/g, '');
  if (d.length >= 4) return d.slice(0, 4);
  return null;
}

function parseStatNumber(raw: string | null | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const n = parseFloat(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

/** Next calendar day for YYYY-MM-DD (local date math). */
function addOneDay(yyyyMmDd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!m) return yyyyMmDd;
  const y = parseInt(m[1]!, 10);
  const mo = parseInt(m[2]!, 10);
  const d = parseInt(m[3]!, 10);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** FLICA-style local time → comparable integer (e.g. 0600, 1413, 1:00 → 100). */
function localTimeToNumber(raw: string | null | undefined): number | null {
  const s = String(raw ?? '').replace(/\D/g, '');
  if (s.length < 4) return null;
  const n = parseInt(s.slice(0, 4), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Trip calendar end from last duty’s last leg times only (not FLICA pairing end, not isOvernightDuty flag).
 * If arrival local &lt; departure local, leg crosses midnight → trip end is dutyDate + 1.
 */
function tripEndDateIsoFromNormalizedDutyDays(
  dutyDays: ReturnType<typeof normalizeFlicaParsedPairing>['dutyDays'],
  startDateFallback: string
): string {
  const lastDay = dutyDays[dutyDays.length - 1];
  if (!lastDay) return startDateFallback;
  const lastLeg = lastDay.legs[lastDay.legs.length - 1];
  if (!lastLeg) return lastDay.dutyDateIso;
  const dep = localTimeToNumber(lastLeg.depTimeLocal);
  const arr = localTimeToNumber(lastLeg.arrTimeLocal);
  if (dep == null || arr == null) {
    return lastDay.dutyDateIso;
  }
  if (arr < dep) {
    return addOneDay(lastDay.dutyDateIso);
  }
  return lastDay.dutyDateIso;
}

function flicaStatsToMonthMetricsRow(stats: FlicaMonthStats) {
  return {
    block_hours: parseStatNumber(stats.block),
    credit_hours: parseStatNumber(stats.credit),
    monthly_tafb_hours: parseStatNumber(stats.tafb),
    ytd_credit_hours: parseStatNumber(stats.ytd),
    days_off: stats.daysOff > 0 ? stats.daysOff : null,
  };
}

async function findOrCreateFlicaDirectImportId(userId: string, importMonth: number): Promise<string> {
  const { data: ex, error: exErr } = await supabase
    .from('schedule_imports')
    .select('id')
    .eq('user_id', userId)
    .eq('import_year', YEAR)
    .eq('import_month', importMonth)
    .eq('source_type', 'flica_direct')
    .maybeSingle();
  if (exErr) throw exErr;
  if (ex?.id) return ex.id as string;

  const id = await createScheduleImport({ importMonth, importYear: YEAR });
  const { error: up } = await supabase
    .from('schedule_imports')
    .update({
      source_type: 'flica_direct',
      status: 'saved',
      needs_review: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (up) throw up;
  return id;
}

async function ensureBatchForImport(
  userId: string,
  importId: string,
  monthKey: string
): Promise<string> {
  const { data: existing, error: fErr } = await supabase
    .from('schedule_import_batches')
    .select('id')
    .eq('schedule_import_id', importId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fErr) throw fErr;
  if (existing?.id) return existing.id as string;

  const { data: ins, error } = await supabase
    .from('schedule_import_batches')
    .insert({
      user_id: userId,
      month_key: monthKey,
      source_type: 'flica_direct',
      source_file_path: 'flica-direct-http',
      parse_status: 'saved',
      row_count: 0,
      warning_count: 0,
      schedule_import_id: importId,
    })
    .select('id')
    .single();
  if (error || !ins) throw error ?? new Error('batch insert failed');
  return ins.id as string;
}

function applyRowsSatisfied(rows: ApplyRow[], monthKey: string): boolean {
  if (!rows.length) return true;
  const prefix = monthKey.slice(0, 7);
  return rows.some((r) => r.date && r.date.startsWith(prefix));
}

export async function persistFlicaDirectImport(
  marchHtml: string,
  aprilHtml: string,
  mayHtml: string
): Promise<void> {
  const htmls = [marchHtml, aprilHtml, mayHtml] as const;

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) throw new Error('Not signed in');
  const uid = u.user.id;

  for (const cfg of MONTH_CONFIG) {
    const rawHtml = htmls[cfg.htmlIndex];
    const parsed = parseFlicaScheduleHtml(rawHtml, cfg.monthKey);
    const importId = await findOrCreateFlicaDirectImportId(uid, cfg.month);
    const batchId = await ensureBatchForImport(uid, importId, cfg.monthKey);

    const { error: delP } = await supabase.from('schedule_pairings').delete().eq('schedule_import_id', importId);
    if (delP) throw delP;

    for (const pairing of parsed.pairings) {
      const pBlock = flicaHhmmToDecimal(pairing.totalBlock);
      const pCredit = flicaHhmmToDecimal(pairing.totalCredit);
      const pTafbMin = flicaHhmmToMinutes(pairing.tafb);

      const normalized = normalizeFlicaParsedPairing(pairing);
      const tripEndDateIso = tripEndDateIsoFromNormalizedDutyDays(
        normalized.dutyDays,
        pairing.startDate
      );

      const { data: pIns, error: pErr } = await supabase
        .from('schedule_pairings')
        .upsert(
          {
            user_id: uid,
            import_id: batchId,
            schedule_import_id: importId,
            pairing_id: pairing.id,
            pairing_start_date: pairing.startDate,
            pairing_end_date: tripEndDateIso,
            operate_start_date: pairing.startDate,
            operate_end_date: tripEndDateIso,
            report_time_local: pairing.baseReport,
            pairing_report_time: pairing.baseReport,
            base_code: 'JFK',
            equipment_code: pairing.equipment,
            pairing_total_tafb: pTafbMin,
            pairing_total_block: pBlock,
            pairing_total_credit: pCredit,
            pairing_confidence: 1.0,
            needs_review: false,
            pairing_requires_review: false,
            raw_text: '',
            normalized_json: { flica_direct: true, month: cfg.monthKey },
          },
          { onConflict: 'user_id,import_id,pairing_id' }
        )
        .select('id')
        .single();
      if (pErr || !pIns) throw pErr ?? new Error('pairing insert failed');
      const pairingUuid = pIns.id as string;

      const { error: delDutiesForPairing } = await supabase
        .from('schedule_duties')
        .delete()
        .eq('user_id', uid)
        .eq('pairing_id', pairing.id);
      if (delDutiesForPairing) throw delDutiesForPairing;

      for (const normalizedDutyDay of normalized.dutyDays) {
        const { error: dErr } = await supabase.from('schedule_duties').insert({
          user_id: uid,
          import_id: batchId,
          pairing_id: pairing.id,
          duty_date: normalizedDutyDay.dutyDateIso,
          report_time: normalizedDutyDay.reportTime,
          duty_off_time: normalizedDutyDay.dutyOffTime,
          next_report_time: normalizedDutyDay.nextReportTime,
          layover_city: normalizedDutyDay.layoverCity,
          layover_time: normalizedDutyDay.layoverTime,
          hotel_name: normalizedDutyDay.hotelName,
          is_continuation: normalizedDutyDay.isContinuation,
          is_overnight_duty: normalizedDutyDay.isOvernightDuty,
        });
        if (dErr) throw dErr;
      }

      let prevLegDutyIso: string | null = null;
      for (const leg of pairing.legs) {
        const duty = dutyDateIso(pairing, leg, cfg.monthKey, prevLegDutyIso);
        prevLegDutyIso = duty;
        const { dep, arr } = flicaRouteToAirports(leg.route);
        const blk = flicaHhmmToDecimal(leg.blockTime);
        const dEndLocal = flicaTimeTokenToDigits(leg.dEndLocal);
        const reptLocal = flicaTimeTokenToDigits(leg.nextReportTime);
        const lot = (leg.layoverTime ?? '').trim();
        const layoverRest = extractLayoverRestFourDigits(lot) ?? (/^\d{4}$/.test(lot) ? lot : undefined);
        const storedDep = leg.departLocal;
        console.log(
          '[PERSIST LEG]',
          'pairing:',
          pairing.id,
          'flicaDay:',
          leg.dayOfWeek,
          'flicaDate:',
          leg.date,
          'route:',
          leg.route,
          'dep:',
          leg.departLocal,
          'resolvedDate:',
          duty,
          'storedDep:',
          storedDep,
        );
        const { error: lErr } = await supabase.from('schedule_pairing_legs').insert({
          pairing_id: pairingUuid,
          duty_date: duty,
          flight_number: leg.flightNumber,
          segment_type: leg.isDeadhead ? 'deadhead' : 'operating_flight',
          departure_station: dep || null,
          arrival_station: arr || null,
          scheduled_departure_local: storedDep,
          scheduled_arrival_local: leg.arriveLocal,
          release_time_local: dEndLocal,
          block_time: blk,
          layover_city: leg.layoverCity?.trim() ? leg.layoverCity.trim() : null,
          hotel_name: leg.hotel?.trim() ? leg.hotel.trim() : null,
          is_deadhead: leg.isDeadhead,
          aircraft_position_code: leg.equipment,
          row_confidence: 1.0,
          requires_review: false,
          raw_text: null,
          normalized_json: {
            flica_direct: true,
            flica_route: leg.route?.trim() || undefined,
            layover_rest_display: layoverRest,
            flica_rept_local: reptLocal,
            flica_d_end_local: dEndLocal,
          },
        });
        if (lErr) throw lErr;
      }
    }

    const { error: bUp } = await supabase
      .from('schedule_import_batches')
      .update({
        row_count: parsed.pairings.length,
        warning_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    if (bUp) throw bUp;

    let applyRows: ApplyRow[] = await buildApplyRowsFromPairingBatch(batchId, cfg.monthKey);
    if (!applyRowsSatisfied(applyRows, cfg.monthKey)) {
      applyRows = await buildApplyRowsFromPairingBatch(batchId, null);
    }
    if (applyRows.length) {
      await applyReplaceMonth(cfg.monthKey, batchId, applyRows);
    }

    const mRow = flicaStatsToMonthMetricsRow(parsed.stats);
    const hasMonthMetrics =
      mRow.block_hours != null ||
      mRow.credit_hours != null ||
      mRow.monthly_tafb_hours != null ||
      mRow.ytd_credit_hours != null ||
      mRow.days_off != null;
    if (hasMonthMetrics) {
      const { error: mmErr } = await supabase.from('schedule_month_metrics').upsert(
        {
          user_id: uid,
          month_key: cfg.monthKey,
          block_hours: mRow.block_hours,
          credit_hours: mRow.credit_hours,
          monthly_tafb_hours: mRow.monthly_tafb_hours,
          ytd_credit_hours: mRow.ytd_credit_hours,
          days_off: mRow.days_off,
          source: 'flica_direct',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,month_key' }
      );
      if (mmErr) throw mmErr;
    }
  }
}
