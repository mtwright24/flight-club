/**
 * Persist JetBlue FLICA structured parse → schedule_pairings + schedule_pairing_legs.
 * Pairing list in review is canonical (no duplicate candidate rows mirroring each pairing).
 */

import { supabase } from '../../lib/supabaseClient';
import { parseJetBlueFlicaMonthlyScreenshot } from '../schedule-import/parser/jetblueFlicaStructuredParser';
import type { JetBluePairingParsed } from '../schedule-import/parser/jetblueFlicaStructuredParser';
import { fetchBatchesForScheduleImport } from './jetblueFlicaImport';

function hhmmToBlockNumeric(hhmm: string | null | undefined): number | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h + m / 60;
}

async function insertLegsForParsedPairing(pairingUuid: string, p: JetBluePairingParsed): Promise<void> {
  for (const dd of p.dutyDays) {
    const n = dd.segments.length;
    for (let i = 0; i < n; i++) {
      const seg = dd.segments[i];
      const isLast = i === n - 1;
      const { error: legErr } = await supabase.from('schedule_pairing_legs').insert({
        pairing_id: pairingUuid,
        duty_date: dd.dutyDateIso,
        flight_number: seg.flightNumber,
        segment_type: seg.isDeadhead ? 'deadhead' : 'operating_flight',
        departure_station: seg.departureStation,
        arrival_station: seg.arrivalStation,
        scheduled_departure_local: seg.departureTimeLocal,
        scheduled_arrival_local: seg.arrivalTimeLocal,
        aircraft_position_code: seg.equipmentCode,
        is_deadhead: seg.isDeadhead,
        requires_review: seg.confidence < 0.55,
        raw_text: seg.rawLine.slice(0, 4000),
        row_confidence: seg.confidence,
        block_time: hhmmToBlockNumeric(seg.blockTimeLocal),
        release_time_local: isLast ? dd.dEndLocal : null,
        layover_city: isLast ? dd.layoverCityCode : null,
        normalized_json: {
          segment_confidence: seg.confidence,
          block_time_local: seg.blockTimeLocal,
          duty_day_index: i,
          is_last_leg_of_duty_day: isLast,
          duty_day: isLast
            ? {
                d_end_local: dd.dEndLocal,
                next_report_local: dd.nextReportLocal,
                layover_city_code: dd.layoverCityCode,
                layover_rest_display: dd.layoverRestDisplay,
                hotel_note: dd.hotelNote,
                raw_d_end_line: dd.dEndNotes,
              }
            : {
                position_in_day: i + 1,
              },
        },
      });
      if (legErr) throw legErr;
    }
  }
}

export async function clearJetBlueCandidateRowsForImport(importId: string): Promise<void> {
  const batches = await fetchBatchesForScheduleImport(importId);
  for (const b of batches) {
    await supabase.from('schedule_import_candidates').delete().eq('batch_id', b.id);
  }
}

/**
 * Generic schedule import (no guided `schedule_imports` row): pairings keyed by `import_id` = batch id.
 * Clears generic OCR candidates for this batch so review is not line-by-line.
 */
export async function persistJetBlueFlicaStructuredParseForGenericBatch(params: {
  batchId: string;
  monthKey: string;
  ocrText?: string | null;
}): Promise<'ok' | 'skipped_no_text' | 'skipped_no_pairings'> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');
  const uid = u.user.id;

  let text = (params.ocrText ?? '').trim();
  if (!text) {
    const { data: row } = await supabase
      .from('schedule_import_batches')
      .select('raw_extracted_text')
      .eq('id', params.batchId)
      .maybeSingle();
    text = (row?.raw_extracted_text ?? '').trim();
  }
  if (!text) return 'skipped_no_text';

  const parsed = parseJetBlueFlicaMonthlyScreenshot(text, params.monthKey);
  const meaningful = parsed.pairings.filter((p) => p.pairingCode !== 'UNKNOWN');
  if (meaningful.length === 0) {
    return 'skipped_no_pairings';
  }

  await supabase.from('schedule_import_candidates').delete().eq('batch_id', params.batchId);
  await supabase.from('schedule_pairings').delete().eq('import_id', params.batchId);

  for (const p of meaningful) {
    if (p.pairingCode === 'UNKNOWN') continue;
    const { data: ins, error } = await supabase
      .from('schedule_pairings')
      .insert({
        user_id: uid,
        import_id: params.batchId,
        schedule_import_id: null,
        pairing_id: p.pairingCode,
        pairing_start_date: p.pairingStartIso,
        operate_start_date: p.pairingStartIso,
        operate_end_date: p.operateEndIso,
        report_time_local: p.baseReportTime,
        pairing_report_time: p.baseReportTime,
        base_code: p.baseCode,
        equipment_code: p.equipmentSummary,
        pairing_confidence: p.confidence,
        needs_review: p.needsReview,
        pairing_requires_review: p.needsReview,
        raw_text: p.rawBlock.slice(0, 20000),
        normalized_json: {
          parser: parsed.parserVersion,
          meta: parsed.meta,
          monthlyTotals: parsed.monthlyTotals,
          operatePatternText: p.operatePatternText,
          operateWindowText: p.operateWindowText,
          routeSummary: p.routeSummary,
          layoverStations: p.layoverStations,
          pairing_last_duty_date: p.lastDutyDateIso,
          dutyDaysSummary: p.dutyDays.map((d) => ({
            dutyDateIso: d.dutyDateIso,
            dEndLocal: d.dEndLocal,
            nextReportLocal: d.nextReportLocal,
            layoverCityCode: d.layoverCityCode,
            layoverRestDisplay: d.layoverRestDisplay,
            legCount: d.segments.length,
          })),
          parseDebug: parsed.debug,
          generic_batch: true,
        },
      })
      .select('id')
      .single();
    if (error) throw error;
    const pairingUuid = ins.id as string;
    await insertLegsForParsedPairing(pairingUuid, p);
  }

  const pairReview = meaningful.filter((x) => x.needsReview).length;
  await supabase
    .from('schedule_import_batches')
    .update({
      row_count: meaningful.length,
      warning_count: pairReview,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.batchId);

  return 'ok';
}

export async function persistJetBlueFlicaStructuredParse(params: {
  importId: string;
  monthKey: string;
  ocrText: string;
  primaryBatchId: string | null;
}): Promise<'ok' | 'skipped_no_batch'> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');
  const uid = u.user.id;
  if (!params.primaryBatchId) return 'skipped_no_batch';

  const parsed = parseJetBlueFlicaMonthlyScreenshot(params.ocrText, params.monthKey);
  const meaningfulGuided = parsed.pairings.filter((p) => p.pairingCode !== 'UNKNOWN');

  await supabase.from('schedule_import_candidates').delete().eq('batch_id', params.primaryBatchId);
  await supabase.from('schedule_pairings').delete().eq('schedule_import_id', params.importId);

  for (const p of parsed.pairings) {
    if (p.pairingCode === 'UNKNOWN') continue;
    const { data: ins, error } = await supabase
      .from('schedule_pairings')
      .insert({
        user_id: uid,
        import_id: params.primaryBatchId,
        schedule_import_id: params.importId,
        pairing_id: p.pairingCode,
        pairing_start_date: p.pairingStartIso,
        operate_start_date: p.pairingStartIso,
        operate_end_date: p.operateEndIso,
        report_time_local: p.baseReportTime,
        pairing_report_time: p.baseReportTime,
        base_code: p.baseCode,
        equipment_code: p.equipmentSummary,
        pairing_confidence: p.confidence,
        needs_review: p.needsReview,
        pairing_requires_review: p.needsReview,
        raw_text: p.rawBlock.slice(0, 20000),
        normalized_json: {
          parser: parsed.parserVersion,
          meta: parsed.meta,
          monthlyTotals: parsed.monthlyTotals,
          operatePatternText: p.operatePatternText,
          operateWindowText: p.operateWindowText,
          routeSummary: p.routeSummary,
          layoverStations: p.layoverStations,
          pairing_last_duty_date: p.lastDutyDateIso,
          dutyDaysSummary: p.dutyDays.map((d) => ({
            dutyDateIso: d.dutyDateIso,
            dEndLocal: d.dEndLocal,
            nextReportLocal: d.nextReportLocal,
            layoverCityCode: d.layoverCityCode,
            layoverRestDisplay: d.layoverRestDisplay,
            legCount: d.segments.length,
          })),
          parseDebug: parsed.debug,
        },
      })
      .select('id')
      .single();
    if (error) throw error;
    const pairingUuid = ins.id as string;
    await insertLegsForParsedPairing(pairingUuid, p);
  }

  const guidedReview = meaningfulGuided.filter((x) => x.needsReview).length;
  await supabase
    .from('schedule_import_batches')
    .update({
      row_count: meaningfulGuided.length,
      warning_count: guidedReview,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.primaryBatchId);

  return 'ok';
}
