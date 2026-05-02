import type { CrewScheduleTrip } from './types';
import { pairingNavigationSessionKey, warmPairingDetailSnapshot } from './scheduleStableSnapshots';

type StashEntry = { trip: CrewScheduleTrip; snapshotKey: string };

const stashByTripId = new Map<string, StashEntry>();

function deepCloneTrip(t: CrewScheduleTrip): CrewScheduleTrip {
  return JSON.parse(JSON.stringify(t)) as CrewScheduleTrip;
}

/** Trip snapshot for Trip Detail: list tap → navigate without blocking on fetch. */
export function stashTripForDetailNavigation(trip: CrewScheduleTrip): void {
  const snapshotKey = pairingNavigationSessionKey(trip);
  const cloned = deepCloneTrip(trip);
  stashByTripId.set(trip.id, { trip: cloned, snapshotKey });
  warmPairingDetailSnapshot(cloned);
}

/** Read stashed trip without removing (instant detail paint). */
export function peekStashedTripForDetail(tripId: string): CrewScheduleTrip | undefined {
  const e = stashByTripId.get(tripId);
  return e ? deepCloneTrip(e.trip) : undefined;
}

export function peekStashedPairingSnapshotKey(tripId: string): string | undefined {
  return stashByTripId.get(tripId)?.snapshotKey;
}

/** Returns and removes the stashed trip for this id, if any. */
export function consumeStashedTripForDetail(tripId: string): CrewScheduleTrip | undefined {
  const e = stashByTripId.get(tripId);
  if (!e) return undefined;
  stashByTripId.delete(tripId);
  return deepCloneTrip(e.trip);
}
