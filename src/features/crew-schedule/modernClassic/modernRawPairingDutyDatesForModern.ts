/**
 * Modern Calendar List only: enumerate raw pairing-detail blocks from
 * `FlicaRawPairingDetailIndex` (same HTML as mini-calendar / hybrid).
 */

import type { FlicaRawPairingDetailIndex } from "../flicaRawPairingDetailIndex";

type IndexEntry = FlicaRawPairingDetailIndex["entries"][number];

export type ModernRawPairingBlockForCanonical = {
  pairingCodeNorm: string;
  pairingStartIso: string;
  scheduleLabel: string | null;
  orderedDates: string[];
  totalCreditMinutes: number | null;
};

/**
 * Every raw pairing-detail block. Stable block boundaries from the index only (no per-row scoring).
 */
export function enumerateRawPairingBlocksForModern(
  index: FlicaRawPairingDetailIndex | null | undefined,
): ModernRawPairingBlockForCanonical[] {
  if (!index?.entries?.length) return [];

  const blockKey = (e: IndexEntry) =>
    `${e.pairingCodeNorm}\u0000${e.pairingStartIso}\u0000${e.scheduleLabel ?? ""}`;

  const groups = new Map<string, IndexEntry[]>();
  for (const e of index.entries) {
    const k = blockKey(e);
    const arr = groups.get(k) ?? [];
    arr.push(e);
    groups.set(k, arr);
  }

  const out: ModernRawPairingBlockForCanonical[] = [];
  for (const arr of groups.values()) {
    if (!arr.length) continue;
    const head = arr[0]!;
    const orderedDates = [...new Set(arr.map((e) => e.dutyIso))].sort();
    if (!orderedDates.length) continue;
    out.push({
      pairingCodeNorm: head.pairingCodeNorm,
      pairingStartIso: head.pairingStartIso,
      scheduleLabel: head.scheduleLabel ?? null,
      orderedDates,
      totalCreditMinutes: head.totalCreditMinutes ?? null,
    });
  }
  return out;
}
