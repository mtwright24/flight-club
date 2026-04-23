/**
 * FLICA direct HTTP (scheduledetail HTML) → schedule_pairings + schedule_pairing_legs
 * and calendar apply rows (schedule_entries) for the existing schedule tab.
 */

import { supabase } from '../../lib/supabaseClient';
import {
  parseFlicaScheduleHtml,
  type FlicaLeg,
  type FlicaPairing,
} from '../../services/flicaScheduleHtmlParser';
import { buildApplyRowsFromPairingBatch, applyReplaceMonth, type ApplyRow } from './scheduleApi';
import { createScheduleImport } from './jetblueFlicaImport';

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

function dutyDateIso(pairing: FlicaPairing, leg: FlicaLeg, monthKey: string): string {
  const y = monthKey.slice(0, 4);
  const m = monthKey.slice(5, 7);
  const d = String(leg.date).padStart(2, '0');
  const startDay = parseInt(pairing.startDate.slice(8, 10), 10);
  if (Number.isFinite(startDay) && leg.date < startDay) {
    const mi = parseInt(m, 10) + 1;
    if (mi > 12) {
      return `${parseInt(y, 10) + 1}-01-${d}`;
    }
    return `${y}-${String(mi).padStart(2, '0')}-${d}`;
  }
  return `${y}-${m}-${d}`;
}

function routeEndpoints(route: string): { dep: string; arr: string } {
  const p = (route ?? '').split('-').map((s) => s.trim()).filter(Boolean);
  if (p.length < 2) {
    return { dep: p[0] ?? '', arr: p[1] ?? '' };
  }
  return { dep: p[0] ?? '', arr: p[p.length - 1] ?? '' };
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

      const { data: pIns, error: pErr } = await supabase
        .from('schedule_pairings')
        .upsert(
          {
            user_id: uid,
            import_id: batchId,
            schedule_import_id: importId,
            pairing_id: pairing.id,
            pairing_start_date: pairing.startDate,
            operate_start_date: pairing.startDate,
            operate_end_date: pairing.endDate,
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

      for (const leg of pairing.legs) {
        const duty = dutyDateIso(pairing, leg, cfg.monthKey);
        const { dep, arr } = routeEndpoints(leg.route);
        const blk = flicaHhmmToDecimal(leg.blockTime);
        const { error: lErr } = await supabase.from('schedule_pairing_legs').insert({
          pairing_id: pairingUuid,
          duty_date: duty,
          flight_number: leg.flightNumber,
          segment_type: leg.isDeadhead ? 'deadhead' : 'operating_flight',
          departure_station: dep || null,
          arrival_station: arr || null,
          scheduled_departure_local: leg.departLocal,
          scheduled_arrival_local: leg.arriveLocal,
          block_time: blk,
          layover_city: leg.layoverCity?.trim() ? leg.layoverCity.trim() : null,
          hotel_name: leg.hotel?.trim() ? leg.hotel.trim() : null,
          is_deadhead: leg.isDeadhead,
          aircraft_position_code: leg.equipment,
          row_confidence: 1.0,
          requires_review: false,
          raw_text: null,
          normalized_json: { flica_direct: true },
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
  }
}
