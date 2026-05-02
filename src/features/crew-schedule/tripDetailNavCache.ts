import type { CrewScheduleTrip } from './types';
import { devLogCarryoverOrInternationalCheck, resolveFullPairingForHandoff, validateFullPairingHandoff } from './pairingHandoff';
import { pairingNavigationSessionKey, warmPairingDetailSnapshot } from './scheduleStableSnapshots';

type StashEntry = { trip: CrewScheduleTrip; snapshotKey: string; handoffValid: boolean };

const stashByTripId = new Map<string, StashEntry>();

function deepCloneTrip(t: CrewScheduleTrip): CrewScheduleTrip {
  return JSON.parse(JSON.stringify(t)) as CrewScheduleTrip;
}

/**
 * Tap handoff: resolve richest trip from `monthTrips`, validate, deep-clone stash (immutable).
 * `monthTrips` = merged month source of truth (same as calendar/classic list).
 */
export function stashTripForDetailNavigation(selected: CrewScheduleTrip, monthTrips: CrewScheduleTrip[]): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[PAIRING_HANDOFF_ROW_SELECTED]', {
      id: selected.id,
      code: selected.pairingCode,
      session: pairingNavigationSessionKey(selected),
    });
    console.log('[PAIRING_FULL_SNAPSHOT_RESOLVE_START]', { monthTripsCount: monthTrips.length });
  }
  const full = resolveFullPairingForHandoff(selected, monthTrips);
  const validity = validateFullPairingHandoff(full);
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    if (validity.ok) {
      console.log('[PAIRING_FULL_SNAPSHOT_VALID]', { id: full.id, code: full.pairingCode });
    } else {
      console.log('[PAIRING_FULL_SNAPSHOT_INVALID_REJECTED]', { id: full.id, reason: validity.reason });
    }
  }
  if (validity.ok) {
    devLogCarryoverOrInternationalCheck(full, 'nav_stash');
  }
  const snapshotKey = pairingNavigationSessionKey(full);
  const cloned = deepCloneTrip(full);
  stashByTripId.set(cloned.id, { trip: cloned, snapshotKey, handoffValid: validity.ok });
  warmPairingDetailSnapshot(cloned);
}

/** Read stashed trip without removing (instant detail paint if `handoffValid`). */
export function peekStashedTripForDetail(tripId: string): CrewScheduleTrip | undefined {
  const e = stashByTripId.get(tripId);
  return e ? deepCloneTrip(e.trip) : undefined;
}

export function peekStashedHandoffValid(tripId: string): boolean {
  return stashByTripId.get(tripId)?.handoffValid ?? false;
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
