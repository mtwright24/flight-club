import { monthCalendarKey } from './scheduleMonthCache';
import type { CrewScheduleTrip } from './types';
import { canSealPairingSurface, isDetailReadyPairing } from './pairingDetailReadiness';

type CacheRow = { trip: CrewScheduleTrip; identityKey: string };

const store = new Map<string, CacheRow>();

let activeFrozenDetailTripId: string | null = null;

export function pairingDetailRegisterFrozenSurface(tripId: string | null): void {
  activeFrozenDetailTripId = tripId?.trim() ? tripId : null;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function cacheKey(monthKey: string, tripId: string, anchor: string): string {
  return `${monthKey}::${anchor}::${tripId}`;
}

function cloneTrip(t: CrewScheduleTrip): CrewScheduleTrip {
  return JSON.parse(JSON.stringify(t)) as CrewScheduleTrip;
}

function monthKeysTouchingTripSpan(trip: CrewScheduleTrip): string[] {
  const sd = String(trip.startDate ?? '').slice(0, 10);
  const ed = String(trip.endDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sd) || !/^\d{4}-\d{2}-\d{2}$/.test(ed)) return [];
  const out = new Set<string>();
  const s = new Date(`${sd}T12:00:00`);
  const e = new Date(`${ed}T12:00:00`);
  for (let ms = s.getTime(); ms <= e.getTime(); ms += 86400000) {
    const cur = new Date(ms);
    out.add(monthCalendarKey(cur.getFullYear(), cur.getMonth() + 1));
  }
  return [...out];
}

function isoDaysInSpanForMonth(trip: CrewScheduleTrip, monthKey: string): string[] {
  const parts = monthKey.split('-');
  const y = parseInt(parts[0] ?? '', 10);
  const mo = parseInt(parts[1] ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return [];
  const last = new Date(y, mo, 0).getDate();
  const sd = String(trip.startDate ?? '').slice(0, 10);
  const ed = String(trip.endDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sd) || !/^\d{4}-\d{2}-\d{2}$/.test(ed)) return [];
  const out: string[] = [];
  for (let d = 1; d <= last; d += 1) {
    const iso = `${y}-${pad2(mo)}-${pad2(d)}`;
    if (iso >= sd && iso <= ed) out.push(iso);
  }
  return out;
}

/**
 * Persist only DB/import-enriched detail-ready trips for instant replay.
 * Thin schedule rows must not populate this cache.
 */
export function storeDetailReadyPairingInMonthCaches(
  trip: CrewScheduleTrip,
  identityKey: string,
  stashMonthKey?: string | null,
): void {
  const id = String(trip.id ?? '').trim();
  if (!id) return;
  if (!canSealPairingSurface(trip)) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[PAIRING_CACHE_THIN_REJECTED]', {
        reason: 'not_detail_ready_for_store',
        tripId: id,
        pairingCode: trip.pairingCode,
      });
    }
    return;
  }

  const payload = cloneTrip(trip);
  const months = new Set<string>(monthKeysTouchingTripSpan(trip));
  if (stashMonthKey) months.add(stashMonthKey);
  let carryoverMultiMonth = months.size > 1;

  for (const mk of months) {
    store.set(cacheKey(mk, id, '*'), { trip: cloneTrip(payload), identityKey });
    for (const iso of isoDaysInSpanForMonth(trip, mk)) {
      store.set(cacheKey(mk, id, iso), { trip: cloneTrip(payload), identityKey });
    }
  }

  if (
    carryoverMultiMonth &&
    typeof __DEV__ !== 'undefined' &&
    __DEV__
  ) {
    console.log('[CARRYOVER_FULL_PAIRING_RESTORED]', {
      tripId: id,
      pairingCode: trip.pairingCode,
      startDate: trip.startDate,
      endDate: trip.endDate,
      months: [...months].sort(),
    });
  }

  if (
    activeFrozenDetailTripId &&
    id === activeFrozenDetailTripId &&
    typeof __DEV__ !== 'undefined' &&
    __DEV__
  ) {
    console.log('[PAIRING_BACKGROUND_REFRESH_STORED_FOR_NEXT_OPEN]', {
      tripId: id,
      identityKey,
      months: [...months].sort(),
    });
  }
}

function readInternal(monthKey: string, id: string, anchor: string): CrewScheduleTrip | undefined {
  const row = store.get(cacheKey(monthKey, id, anchor));
  if (!row) return undefined;
  if (!isDetailReadyPairing(row.trip)) {
    store.delete(cacheKey(monthKey, id, anchor));
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[PAIRING_CACHE_THIN_REJECTED]', {
        reason: 'stale_non_ready_entry',
        tripId: id,
        monthKey,
        anchor,
      });
    }
    return undefined;
  }
  return cloneTrip(row.trip);
}

export function readPairingDetailFromMonthCache(
  tripId: string,
  monthKey: string,
  rowDateIso: string | null | undefined,
): CrewScheduleTrip | undefined {
  const id = String(tripId ?? '').trim();
  if (!id || !monthKey) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[PAIRING_CACHE_DETAIL_READY_MISS]', { tripId, monthKey, reason: 'bad_key' });
    }
    return undefined;
  }
  const d =
    rowDateIso && /^\d{4}-\d{2}-\d{2}$/.test(String(rowDateIso).slice(0, 10))
      ? String(rowDateIso).slice(0, 10)
      : null;
  if (d) {
    const hit = readInternal(monthKey, id, d);
    if (hit) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[PAIRING_CACHE_DETAIL_READY_HIT]', { tripId: id, monthKey, rowDateIso: d });
      }
      return hit;
    }
  }
  const wild = readInternal(monthKey, id, '*');
  if (wild) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[PAIRING_CACHE_DETAIL_READY_HIT]', { tripId: id, monthKey, rowDateIso: rowDateIso ?? null, wildcard: true });
    }
    return wild;
  }
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[PAIRING_CACHE_DETAIL_READY_MISS]', { tripId: id, monthKey, rowDateIso: d });
  }
  return undefined;
}
