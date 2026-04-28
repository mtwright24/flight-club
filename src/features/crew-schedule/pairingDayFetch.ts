/**
 * Load `schedule_pairings` + `schedule_pairing_legs` for import batch ids (from `schedule_entries.source_batch_id`)
 * and build {@link PairingCalendarBlock}s — canonical duty days for the classic ledger.
 */
import { supabase } from '../../lib/supabaseClient';
import { addIsoDays } from './ledgerContext';
import type { SchedulePairingRow } from './jetblueFlicaImport';
import {
  buildPairingCalendarBlockFromDb,
  calendarMonthBoundsIso,
  type PairingCalendarBlock,
  normPairingCode,
} from './pairingDayModel';

type RawLeg = Record<string, unknown>;

type MergedSource = { pairing: SchedulePairingRow; legs: RawLeg[] };

function mergeContiguousSamePairingId(sources: MergedSource[]): MergedSource[] {
  if (sources.length === 0) return [];
  const byCode = new Map<string, MergedSource[]>();
  for (const s of sources) {
    const k = String(s.pairing.pairing_id ?? '')
      .trim()
      .toUpperCase();
    if (!k) continue;
    if (!byCode.has(k)) byCode.set(k, []);
    byCode.get(k)!.push(s);
  }
  const out: MergedSource[] = [];
  for (const group of byCode.values()) {
    group.sort((a, b) =>
      String(a.pairing.operate_start_date ?? '').localeCompare(String(b.pairing.operate_start_date ?? '')),
    );
    let cur: MergedSource | null = null;
    for (const r of group) {
      if (!cur) {
        cur = { pairing: { ...r.pairing }, legs: [...r.legs] };
        continue;
      }
      const aEnd = String(cur.pairing.operate_end_date ?? '').slice(0, 10);
      const bStart = String(r.pairing.operate_start_date ?? '').slice(0, 10);
      if (aEnd && bStart && addIsoDays(aEnd, 1) === bStart) {
        cur = {
          pairing: {
            ...r.pairing,
            id: cur.pairing.id,
            schedule_import_id: cur.pairing.schedule_import_id,
            operate_start_date: cur.pairing.operate_start_date,
            operate_end_date: r.pairing.operate_end_date,
            report_time_local: cur.pairing.report_time_local ?? r.pairing.report_time_local,
          } as SchedulePairingRow,
          legs: [...cur.legs, ...r.legs],
        };
      } else {
        out.push(cur);
        cur = { pairing: { ...r.pairing }, legs: [...r.legs] };
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/**
 * FLICA leg-backed calendar blocks for all pairings stored under the given import `batch_id`s.
 */
export async function fetchPairingCalendarBlocksForBatchIds(
  userId: string,
  batchIds: string[],
  viewYear: number,
  viewMonth: number,
): Promise<PairingCalendarBlock[]> {
  const ids = [...new Set(batchIds.filter((x): x is string => typeof x === 'string' && x.length > 0))];
  if (!ids.length) return [];

  const { data: pairings, error: pErr } = await supabase
    .from('schedule_pairings')
    .select(
      'id, user_id, import_id, schedule_import_id, pairing_id, operate_start_date, operate_end_date, report_time_local, base_code',
    )
    .eq('user_id', userId)
    .in('import_id', ids);

  if (pErr) throw pErr;
  const pl = (pairings ?? []) as unknown as SchedulePairingRow[];
  if (pl.length === 0) return [];

  const pairingUuids = pl.map((p) => p.id);
  const { data: legRows, error: lErr } = await supabase
    .from('schedule_pairing_legs')
    .select('*')
    .in('pairing_id', pairingUuids);
  if (lErr) throw lErr;

  const byPair = new Map<string, RawLeg[]>();
  for (const row of legRows ?? []) {
    const pid = (row as { pairing_id: string }).pairing_id;
    if (!pid) continue;
    const arr = byPair.get(pid) ?? [];
    arr.push(row as RawLeg);
    byPair.set(pid, arr);
  }

  const sources: MergedSource[] = pl.map((p) => ({
    pairing: p,
    legs: byPair.get(p.id) ?? [],
  })).filter((s) => s.legs.length > 0);

  const merged = mergeContiguousSamePairingId(sources);
  const blocks: PairingCalendarBlock[] = [];
  for (const m of merged) {
    const b = buildPairingCalendarBlockFromDb(m.pairing, m.legs, viewYear, viewMonth);
    if (b) blocks.push(b);
  }
  return blocks;
}

function pairingOverlapsViewMonth(
  p: Pick<SchedulePairingRow, 'operate_start_date' | 'operate_end_date'>,
  mStart: string,
  mEnd: string,
): boolean {
  const a = String(p.operate_start_date ?? '')
    .trim()
    .slice(0, 10);
  const b = String(p.operate_end_date ?? '')
    .trim()
    .slice(0, 10);
  if (!a && !b) return true;
  const lo = a || b;
  const hi = b || a;
  return !(lo > mEnd || hi < mStart);
}

function blockLegCount(b: PairingCalendarBlock): number {
  let n = 0;
  for (const d of Object.values(b.daysByDate)) {
    n += d.segments?.length ?? 0;
  }
  return n;
}

/** When the same pairing is found via `import_id` and via FLICA `pairing_id` string, keep the richer block. */
export function mergePairingBlockLists(
  fromBatch: PairingCalendarBlock[],
  fromPairingIds: PairingCalendarBlock[],
): PairingCalendarBlock[] {
  const by = new Map<string, PairingCalendarBlock>();
  for (const b of fromBatch) {
    by.set(normPairingCode(b.pairingCode), b);
  }
  for (const b of fromPairingIds) {
    const k = normPairingCode(b.pairingCode);
    const cur = by.get(k);
    if (!cur || blockLegCount(b) > blockLegCount(cur)) {
      by.set(k, b);
    }
  }
  return [...by.values()];
}

/**
 * Resolves `schedule_pairings` by FLICA `pairing_id` (e.g. J3H95) for months where `source_batch_id` on
 * `schedule_entries` is missing so batch-based fetch would not run.
 */
export async function fetchPairingCalendarBlocksByPairingIdsForUserMonth(
  userId: string,
  pairingCodes: string[],
  viewYear: number,
  viewMonth: number,
): Promise<PairingCalendarBlock[]> {
  const { mStart, mEnd } = calendarMonthBoundsIso(viewYear, viewMonth);
  const codes = [
    ...new Set(
      pairingCodes
        .map((c) => String(c ?? '').trim().toUpperCase())
        .filter((c) => c && c !== 'PTO' && c !== 'PTV' && c !== 'CONT' && c !== '—' && c !== 'RSV'),
    ),
  ];
  if (!codes.length) return [];

  const { data, error } = await supabase
    .from('schedule_pairings')
    .select(
      'id, user_id, import_id, schedule_import_id, pairing_id, operate_start_date, operate_end_date, report_time_local, base_code, updated_at',
    )
    .eq('user_id', userId)
    .in('pairing_id', codes);

  if (error) throw error;
  const rows = (data ?? []) as unknown as (SchedulePairingRow & { updated_at?: string })[];
  const bestByCode = new Map<string, SchedulePairingRow & { updated_at?: string }>();
  for (const r of rows) {
    const code = String(r.pairing_id ?? '')
      .trim()
      .toUpperCase();
    if (!code) continue;
    if (!pairingOverlapsViewMonth(r, mStart, mEnd)) continue;
    const cur = bestByCode.get(code);
    if (!cur) {
      bestByCode.set(code, r);
      continue;
    }
    const tNew = r.updated_at ?? '';
    const tOld = cur.updated_at ?? '';
    if (tNew > tOld) bestByCode.set(code, r);
  }

  if (bestByCode.size === 0) return [];

  const pairingUuids = [...bestByCode.values()].map((p) => p.id);
  const { data: legRows, error: lErr } = await supabase
    .from('schedule_pairing_legs')
    .select('*')
    .in('pairing_id', pairingUuids);
  if (lErr) throw lErr;

  const byPair = new Map<string, RawLeg[]>();
  for (const row of legRows ?? []) {
    const pid = (row as { pairing_id: string }).pairing_id;
    if (!pid) continue;
    const arr = byPair.get(pid) ?? [];
    arr.push(row as RawLeg);
    byPair.set(pid, arr);
  }

  const blocks: PairingCalendarBlock[] = [];
  for (const pairing of bestByCode.values()) {
    const legs = byPair.get(pairing.id) ?? [];
    if (!legs.length) continue;
    const b = buildPairingCalendarBlockFromDb(pairing, legs, viewYear, viewMonth);
    if (b) blocks.push(b);
  }
  return blocks;
}

export function uniqueBatchIdsFromEntryRows(
  sets: { source_batch_id: string | null }[][],
): string[] {
  const s = new Set<string>();
  for (const part of sets) {
    for (const r of part) {
      if (r.source_batch_id) s.add(r.source_batch_id);
    }
  }
  return [...s];
}
