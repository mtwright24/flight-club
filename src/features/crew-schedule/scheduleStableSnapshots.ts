/**
 * In-memory committed snapshots for crew schedule month + pairing surfaces.
 * Atomic replace only — no in-place mutation of cached objects.
 */
import {
    logTripsForJ4195FakeMay29,
    tripHasJ4195StaleMay292026,
    tripListHasJ4195StaleMay292026,
} from "./j4195FakeMay29Audit";
import { monthCalendarKey } from "./scheduleMonthCache";
import type { CrewScheduleTrip, ScheduleMonthMetrics } from "./types";

export function simpleDataSignature(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/** Stable row/list identity: pairing uuid (or placeholder), trip group id, span, code. */
export function pairingSnapshotKey(trip: CrewScheduleTrip): string {
  const uuid = String(trip.schedulePairingId ?? "")
    .trim()
    .toUpperCase();
  const gid = String(trip.id ?? "").trim();
  const code = String(trip.pairingCode ?? "")
    .trim()
    .toUpperCase();
  const a = String(trip.startDate ?? "").slice(0, 10);
  const b = String(trip.endDate ?? "").slice(0, 10);
  return `${uuid || "no-uuid"}|${gid}|${a}|${b}|${code}`;
}

export function pairingSnapshotKeysMatch(
  a: CrewScheduleTrip,
  b: CrewScheduleTrip,
): boolean {
  return pairingSnapshotKey(a) === pairingSnapshotKey(b);
}

/** Row/trip identity for detail refresh guards: trip_group id + span + pairing code (stable before/after DB UUID resolution). */
export function pairingNavigationSessionKey(trip: CrewScheduleTrip): string {
  const gid = String(trip.id ?? "").trim();
  const a = String(trip.startDate ?? "").slice(0, 10);
  const b = String(trip.endDate ?? "").slice(0, 10);
  const code = String(trip.pairingCode ?? "")
    .trim()
    .toUpperCase();
  return `${gid}|${a}|${b}|${code}`;
}

function cloneTrip(t: CrewScheduleTrip): CrewScheduleTrip {
  return JSON.parse(JSON.stringify(t)) as CrewScheduleTrip;
}

function cloneTrips(trips: CrewScheduleTrip[]): CrewScheduleTrip[] {
  return JSON.parse(JSON.stringify(trips)) as CrewScheduleTrip[];
}

function cloneMetrics(
  m: ScheduleMonthMetrics | null,
): ScheduleMonthMetrics | null {
  if (!m) return null;
  return JSON.parse(JSON.stringify(m)) as ScheduleMonthMetrics;
}

/**
 * Month snapshot identity: user + home base (first trip) + role bucket + calendar month + metrics revision + trips signature.
 * `month_key` / import revision is approximated by `schedule_month_metrics.updated_at` plus trip id set.
 */
export function computeStableMonthIdentityKey(params: {
  userId: string;
  year: number;
  month: number;
  trips: CrewScheduleTrip[];
  monthMetrics: ScheduleMonthMetrics | null;
}): string {
  const mk = monthCalendarKey(params.year, params.month);
  const base = params.trips[0]?.base?.trim().toUpperCase() ?? "—";
  const role = "crew";
  const rev =
    params.monthMetrics?.updatedAt ?? params.monthMetrics?.monthKey ?? "nom";
  const tripSig = params.trips
    .map(
      (t) =>
        `${t.id}|${String(t.schedulePairingId ?? "")}|${t.startDate}|${t.endDate}|${String(t.pairingCode).toUpperCase()}`,
    )
    .sort()
    .join(";");
  const sig = simpleDataSignature(tripSig);
  return `${params.userId}|${base}|${role}|${mk}|${rev}|${params.trips.length}:${sig}`;
}

export type ScheduleCommittedMonthSnapshot = {
  monthCalendarKey: string;
  userId: string;
  identityKey: string;
  trips: CrewScheduleTrip[];
  monthMetrics: ScheduleMonthMetrics | null;
  committedAt: number;
};

const committedMonths = new Map<string, ScheduleCommittedMonthSnapshot>();

export function readCommittedMonthSnapshot(
  monthCalendarKey: string,
): ScheduleCommittedMonthSnapshot | undefined {
  const v = committedMonths.get(monthCalendarKey);
  if (!v) return undefined;
  if (tripListHasJ4195StaleMay292026(v.trips)) {
    logTripsForJ4195FakeMay29(
      v.trips,
      "scheduleStableSnapshots.committedMonths.evict_on_read",
      "local_cache_only",
    );
    committedMonths.delete(monthCalendarKey);
    return undefined;
  }
  return v;
}

/** Replace atomically with deep-cloned payloads. */
export function commitMonthSnapshotAtomic(
  snap: Omit<ScheduleCommittedMonthSnapshot, "committedAt"> & {
    committedAt?: number;
  },
): void {
  const row: ScheduleCommittedMonthSnapshot = {
    monthCalendarKey: snap.monthCalendarKey,
    userId: snap.userId,
    identityKey: snap.identityKey,
    trips: cloneTrips(snap.trips),
    monthMetrics: cloneMetrics(snap.monthMetrics),
    committedAt: snap.committedAt ?? Date.now(),
  };
  committedMonths.set(row.monthCalendarKey, row);
}

export function clearCommittedMonthSnapshot(monthCalendarKey: string): void {
  committedMonths.delete(monthCalendarKey);
}

/** Invalidate committed snapshots for month keys (e.g. after import invalidation). */
export function invalidateCommittedMonthSnapshotsForKeys(keys: string[]): void {
  for (const k of keys) committedMonths.delete(k);
}

export function purgeJ4195FakeMay292026CommittedAndWarm(): void {
  for (const [k, v] of [...committedMonths.entries()]) {
    if (tripListHasJ4195StaleMay292026(v.trips)) {
      logTripsForJ4195FakeMay29(
        v.trips,
        "scheduleStableSnapshots.committedMonths.purge",
        "local_cache_only",
      );
      committedMonths.delete(k);
    }
  }
  for (const [k, t] of [...pairingDetailWarm.entries()]) {
    if (tripHasJ4195StaleMay292026(t)) {
      logTripsForJ4195FakeMay29(
        [t],
        "scheduleStableSnapshots.pairingDetailWarm.purge",
        "local_cache_only",
      );
      pairingDetailWarm.delete(k);
    }
  }
}

const pairingDetailWarm = new Map<string, CrewScheduleTrip>();

export function warmPairingDetailSnapshot(trip: CrewScheduleTrip): void {
  if (tripHasJ4195StaleMay292026(trip)) {
    return;
  }
  pairingDetailWarm.set(pairingSnapshotKey(trip), cloneTrip(trip));
}

export function readPairingDetailSnapshot(
  key: string,
): CrewScheduleTrip | undefined {
  const v = pairingDetailWarm.get(key);
  if (!v) return undefined;
  if (tripHasJ4195StaleMay292026(v)) {
    pairingDetailWarm.delete(key);
    logTripsForJ4195FakeMay29(
      [v],
      "scheduleStableSnapshots.pairingDetailWarm.evict_on_read",
      "local_cache_only",
    );
    return undefined;
  }
  return cloneTrip(v);
}
