import type { CrewScheduleTrip } from './types';

const stashByTripId = new Map<string, CrewScheduleTrip>();

/** One-shot trip snapshot for Trip Detail: list tap → navigate without blocking on fetch. */
export function stashTripForDetailNavigation(trip: CrewScheduleTrip): void {
  stashByTripId.set(trip.id, trip);
}

/** Returns and removes the stashed trip for this id, if any. */
export function consumeStashedTripForDetail(tripId: string): CrewScheduleTrip | undefined {
  const t = stashByTripId.get(tripId);
  if (t) stashByTripId.delete(tripId);
  return t;
}
