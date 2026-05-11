/**
 * Modern Calendar List only: layout for the vertical pairing rail (UI).
 * Grouping uses full-sequence dates from `ModernRowDayMeta` (raw pairing detail or trip span).
 */

import type { ModernRowDayMeta } from "./modernListPairingSequence";

/** Minimal list segment shape from Modern list rendering (week headers + rows). */
export type ModernListSegForRail =
  | { kind: "week" }
  | { kind: "row"; row: { id: string; dateIso: string } };

/** Must match `weekLabel` vertical footprint in ModernClassicListView. */
export const MODERN_LIST_WEEK_HEADER_VERTICAL = 6 + 3 + 12;

/** Same-pairing Modern rows collapse tile margins, so rail bridges only cover intervening week headers. */
export const MODERN_LIST_PAIRING_ROW_WRAP_MARGIN = 0;

export type ModernPairingRailPosition = NonNullable<
  ModernRowDayMeta["railSegmentPosition"]
>;

export type ModernPairingRailLayoutEntry = {
  railPosition: ModernPairingRailPosition | null;
  bridgeAbove: number;
  bridgeBelow: number;
  collapseGapAbove: boolean;
  collapseGapBelow: boolean;
  suppressTopCap: boolean;
  suppressBottomCap: boolean;
  centerBottomCapInGap: boolean;
  linkedTripId: string | null;
  prevRowLinkedTripId: string | null;
  nextRowLinkedTripId: string | null;
};

/** Rail grouping: canonical sequence id only (full duty list is identical for all rows in the run). */
function modernRailGroupId(meta: ModernRowDayMeta): string | null {
  return meta.canonicalSequenceId;
}

function tripIdForRail(meta: ModernRowDayMeta): string | null {
  if (!meta.renderAsPairingCard || !meta.linkedTrip) return null;
  const id = meta.linkedTrip.id;
  return id != null && String(id) !== "" ? String(id) : null;
}

function railDatesForMeta(meta: ModernRowDayMeta): string[] {
  return meta.orderedTripDates.length
    ? meta.orderedTripDates
    : meta.tripSpanDates;
}

function measureBridgeBetweenRowIndices(
  listData: readonly ModernListSegForRail[],
  fromRowListIndex: number,
  toRowListIndex: number,
): number {
  let total = MODERN_LIST_PAIRING_ROW_WRAP_MARGIN;
  for (let j = fromRowListIndex + 1; j < toRowListIndex; j += 1) {
    const seg = listData[j];
    if (seg?.kind === "week") {
      total += MODERN_LIST_WEEK_HEADER_VERTICAL;
    }
  }
  total += MODERN_LIST_PAIRING_ROW_WRAP_MARGIN;
  return total;
}

function prevRowListIndex(
  listData: readonly ModernListSegForRail[],
  i: number,
): number {
  for (let j = i - 1; j >= 0; j -= 1) {
    const seg = listData[j];
    if (seg?.kind === "row") return j;
  }
  return -1;
}

function nextRowListIndex(
  listData: readonly ModernListSegForRail[],
  i: number,
): number {
  for (let j = i + 1; j < listData.length; j += 1) {
    const seg = listData[j];
    if (seg?.kind === "row") return j;
  }
  return -1;
}

/**
 * Per row id: rail segment position (from full duty sequence) and bridges when the visible
 * list contains the adjacent duty day for the same rail group.
 */
export function computeModernPairingRailLayout(
  listData: readonly ModernListSegForRail[],
  metaByRowId: Map<string, ModernRowDayMeta>,
): Map<string, ModernPairingRailLayoutEntry> {
  const out = new Map<string, ModernPairingRailLayoutEntry>();

  for (let i = 0; i < listData.length; i += 1) {
    const seg = listData[i];
    if (seg?.kind !== "row") continue;

    const rowId = seg.row.id;
    const meta = metaByRowId.get(rowId);
    if (!meta) continue;

    const iso = seg.row.dateIso.slice(0, 10);
    const gid = modernRailGroupId(meta);
    const railPosition = meta.railSegmentPosition;

    const prevRI = prevRowListIndex(listData, i);
    const nextRI = nextRowListIndex(listData, i);

    const prevSeg = prevRI >= 0 ? listData[prevRI] : null;
    const nextSeg = nextRI >= 0 ? listData[nextRI] : null;

    const prevMeta =
      prevSeg?.kind === "row" ? metaByRowId.get(prevSeg.row.id) : null;
    const nextMeta =
      nextSeg?.kind === "row" ? metaByRowId.get(nextSeg.row.id) : null;

    const prevRowLinkedTripId = prevMeta ? tripIdForRail(prevMeta) : null;
    const nextRowLinkedTripId = nextMeta ? tripIdForRail(nextMeta) : null;

    let bridgeAbove = 0;
    let bridgeBelow = 0;
    let collapseGapAbove = false;
    let collapseGapBelow = false;
    let samePrev = false;
    let sameNext = false;

    if (gid && railPosition && railDatesForMeta(meta).length) {
      const dates = railDatesForMeta(meta);
      const idx = dates.indexOf(iso);
      const prevDuty = idx > 0 ? dates[idx - 1]! : null;
      const nextDuty =
        idx >= 0 && idx < dates.length - 1 ? dates[idx + 1]! : null;

      if (prevRI >= 0 && prevDuty && prevMeta) {
        const pr = listData[prevRI]!;
        if (pr.kind === "row") {
          const pIso = pr.row.dateIso.slice(0, 10);
          samePrev =
            modernRailGroupId(prevMeta) === gid && pIso === prevDuty;
        }
      }

      if (nextRI >= 0 && nextDuty && nextMeta) {
        const nr = listData[nextRI]!;
        if (nr.kind === "row") {
          const nIso = nr.row.dateIso.slice(0, 10);
          sameNext =
            modernRailGroupId(nextMeta) === gid && nIso === nextDuty;
        }
      }

      if (sameNext)
        bridgeBelow = measureBridgeBetweenRowIndices(listData, i, nextRI);
      if (samePrev)
        bridgeAbove = measureBridgeBetweenRowIndices(listData, prevRI, i);
      collapseGapBelow = sameNext;
      collapseGapAbove = samePrev;
    }

    const differentPairingPrev =
      Boolean(gid && prevMeta?.canonicalSequenceId) &&
      modernRailGroupId(prevMeta!) !== gid;
    const suppressTopCap =
      railPosition === "start" &&
      differentPairingPrev &&
      prevMeta?.railSegmentPosition === "end";
    const suppressBottomCap = false;
    const differentPairingNext =
      Boolean(gid && nextMeta?.canonicalSequenceId) &&
      modernRailGroupId(nextMeta!) !== gid;
    const centerBottomCapInGap =
      railPosition === "end" &&
      differentPairingNext &&
      nextMeta?.railSegmentPosition === "start";

    out.set(rowId, {
      railPosition: railPosition ?? null,
      bridgeAbove,
      bridgeBelow,
      collapseGapAbove,
      collapseGapBelow,
      suppressTopCap,
      suppressBottomCap,
      centerBottomCapInGap,
      linkedTripId: tripIdForRail(meta),
      prevRowLinkedTripId,
      nextRowLinkedTripId,
    });
  }

  return out;
}
