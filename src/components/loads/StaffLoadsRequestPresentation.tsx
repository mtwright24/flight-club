import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { colors } from '../../styles/theme';
import type { StaffLoadRequestRow } from '../../lib/supabase/staffLoads';

/** Visual tokens — accent strip + load-level semantics (Flight Club branded, not ST clone). */
export const STAFF_LOADS_VISUAL = {
  strip: {
    favorable: '#22c55e',
    caution: '#d97706',
    risk: '#dc2626',
    /** Lock / someone actively answering */
    waiting: '#3b82f6',
    /** Open request, no answer yet — cool neutral (not a load quality signal). */
    awaitingNeutral: '#94a3b8',
    inactive: '#94a3b8',
    neutral: '#cbd5e1',
  },
  chip: {
    bgOpen: '#eff6ff',
    fgOpen: '#1d4ed8',
    bgAnswered: '#ecfdf5',
    fgAnswered: '#15803d',
    bgStale: '#f1f5f9',
    fgStale: '#475569',
    bgPriority: '#fffbeb',
    fgPriority: '#b45309',
    bgLock: '#fff7ed',
    fgLock: '#9a3412',
    bgRefresh: '#fffbeb',
    fgRefresh: '#b45309',
    bgMine: 'rgba(181,22,30,0.1)',
    fgMine: colors.headerRed,
    bgHeavy: '#fef2f2',
    fgHeavy: '#b91c1c',
    bgMedium: '#fffbeb',
    fgMedium: '#b45309',
    bgLight: '#ecfdf5',
    fgLight: '#166534',
  },
} as const;

export type LoadLevelKind = 'light' | 'medium' | 'heavy' | 'unknown';

export function normalizeStaffLoadLevel(raw: string | null | undefined): LoadLevelKind {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (/(heavy|full|oversold|high|bad|tight)/.test(s)) return 'heavy';
  if (/(light|easy|low|open|good|green)/.test(s)) return 'light';
  if (/(medium|mod|avg|moderate|ok|fair)/.test(s)) return 'medium';
  if (s === 'l') return 'light';
  if (s === 'm') return 'medium';
  if (s === 'h') return 'heavy';
  return 'unknown';
}

export function loadLevelHeadline(kind: LoadLevelKind): string {
  switch (kind) {
    case 'light':
      return 'Light';
    case 'medium':
      return 'Medium';
    case 'heavy':
      return 'Heavy';
    default:
      return 'Loads';
  }
}

export function loadLevelStripColor(kind: LoadLevelKind): string {
  switch (kind) {
    case 'light':
      return STAFF_LOADS_VISUAL.strip.favorable;
    case 'medium':
      return STAFF_LOADS_VISUAL.strip.caution;
    case 'heavy':
      return STAFF_LOADS_VISUAL.strip.risk;
    default:
      return STAFF_LOADS_VISUAL.strip.neutral;
  }
}

export function loadLevelChipColors(kind: LoadLevelKind): { bg: string; fg: string } {
  switch (kind) {
    case 'light':
      return { bg: STAFF_LOADS_VISUAL.chip.bgLight, fg: STAFF_LOADS_VISUAL.chip.fgLight };
    case 'medium':
      return { bg: STAFF_LOADS_VISUAL.chip.bgMedium, fg: STAFF_LOADS_VISUAL.chip.fgMedium };
    case 'heavy':
      return { bg: STAFF_LOADS_VISUAL.chip.bgHeavy, fg: STAFF_LOADS_VISUAL.chip.fgHeavy };
    default:
      return { bg: '#f1f5f9', fg: '#475569' };
  }
}

function lockActive(row: StaffLoadRequestRow, now: number): boolean {
  if (!row.locked_by || !row.lock_expires_at) return false;
  return new Date(row.lock_expires_at).getTime() > now;
}

/**
 * Side-edge color for answered loads from numeric snapshot (primary signal when present).
 *
 * Let O = open seats (from `open_seats_total`, or sum of `open_seats_by_cabin` on the server join).
 * Let N = listed non-rev count (`nonrev_listed_total`, treated as 0 when null but O is known).
 *
 * RED:  O ≤ 2 OR N ≥ O (non-rev meets or exceeds open seats)
 * GREEN: O > 10 AND N < 0.35 × O AND (O − N) ≥ 5 (strong open + healthy margin)
 * ORANGE: all other answered cases with valid O (tight/medium/limited headroom)
 * Fallback when O is unknown: use load-level keywords (light/medium/heavy) as before.
 */
export function staffLoadsPreviewStripColorFromSeatCounts(
  openSeats: number | null | undefined,
  listedNonrev: number | null | undefined
): string | null {
  if (openSeats == null || Number.isNaN(Number(openSeats))) return null;
  const O = Math.max(0, Math.floor(Number(openSeats)));
  const N = listedNonrev == null || Number.isNaN(Number(listedNonrev)) ? 0 : Math.max(0, Math.floor(Number(listedNonrev)));
  if (O <= 2) return STAFF_LOADS_VISUAL.strip.risk;
  if (N >= O) return STAFF_LOADS_VISUAL.strip.risk;
  const margin = O - N;
  if (O > 10 && N < O * 0.35 && margin >= 5) return STAFF_LOADS_VISUAL.strip.favorable;
  if (O > 10) return STAFF_LOADS_VISUAL.strip.caution;
  return STAFF_LOADS_VISUAL.strip.caution;
}

/** Left strip on answered summary tiles — same semantics as list preview (seats first, then load-level words). */
export function staffLoadsAnsweredAccentStripFromSnapshot(args: {
  openSeats: number | null | undefined;
  listedNonrev: number | null | undefined;
  loadLevel: string | null | undefined;
}): string {
  const fromSeats = staffLoadsPreviewStripColorFromSeatCounts(args.openSeats, args.listedNonrev);
  if (fromSeats) return fromSeats;
  const kind = normalizeStaffLoadLevel(args.loadLevel);
  if (kind !== 'unknown') return loadLevelStripColor(kind);
  return STAFF_LOADS_VISUAL.strip.favorable;
}

/** Open-seats “highlighter” box on load summary — matches tile strip / HE–Cole green · amber · red rule. */
export function staffLoadsOpenSeatsHighlightBox(
  openSeats: number | null | undefined,
  listedNonrev: number | null | undefined,
  loadLevel: string | null | undefined
): { bg: string; fg: string; labelFg: string; borderColor: string } {
  const strip = staffLoadsPreviewStripColorFromSeatCounts(openSeats, listedNonrev);
  const fromStrip = (s: string | null) => {
    if (!s) return null;
    if (s === STAFF_LOADS_VISUAL.strip.favorable) return loadLevelChipColors('light');
    if (s === STAFF_LOADS_VISUAL.strip.risk) return loadLevelChipColors('heavy');
    if (s === STAFF_LOADS_VISUAL.strip.caution) return loadLevelChipColors('medium');
    return null;
  };
  const chipFromStrip = fromStrip(strip);
  if (chipFromStrip) {
    const border =
      strip === STAFF_LOADS_VISUAL.strip.favorable
        ? 'rgba(22, 101, 52, 0.22)'
        : strip === STAFF_LOADS_VISUAL.strip.risk
          ? 'rgba(185, 28, 28, 0.25)'
          : 'rgba(180, 83, 9, 0.28)';
    return {
      bg: chipFromStrip.bg,
      fg: chipFromStrip.fg,
      labelFg: chipFromStrip.fg,
      borderColor: border,
    };
  }
  const kind = normalizeStaffLoadLevel(loadLevel);
  if (kind !== 'unknown') {
    const c = loadLevelChipColors(kind);
    return { bg: c.bg, fg: c.fg, labelFg: c.fg, borderColor: 'rgba(100, 116, 139, 0.22)' };
  }
  return {
    bg: '#f1f5f9',
    fg: '#475569',
    labelFg: '#64748b',
    borderColor: '#e2e8f0',
  };
}

export function formatAnswerLoadPreviewLine(
  openSeats: number | null | undefined,
  listedNonrev: number | null | undefined
): string | null {
  if (openSeats == null && listedNonrev == null) return null;
  const o =
    openSeats == null || Number.isNaN(Number(openSeats)) ? '—' : String(Math.max(0, Math.floor(Number(openSeats))));
  const n =
    listedNonrev == null || Number.isNaN(Number(listedNonrev))
      ? '—'
      : String(Math.max(0, Math.floor(Number(listedNonrev))));
  return `${o} open · ${n} listed`;
}

/** Loads tab “your requests” preview: same semantics as list strips (lock, answer load level) + dev demo slots. */
export function staffLoadsMyPreviewAccentStrip(
  p: {
    status: StaffLoadRequestRow['status'];
    refresh_requested_at?: string | null;
    locked_by?: string | null;
    lock_expires_at?: string | null;
    latest_answer_load_level?: string | null;
    latest_answer_open_seats_total?: number | null;
    latest_answer_nonrev_listed_total?: number | null;
    airline_code?: string;
    flight_number?: string | null;
    options?: unknown;
  },
  now: number = Date.now()
): string {
  const code = (p.airline_code || '').toUpperCase();
  const opt = p.options && typeof p.options === 'object' ? (p.options as Record<string, unknown>) : null;
  if (opt?.staff_loads_demo === true && code === 'B6') {
    const slot = opt.demo_slot;
    /** Demo tiles: no “fake” green/red on unanswered — match production grey rule. */
    if (slot === 'open') return STAFF_LOADS_VISUAL.strip.neutral;
    if (slot === 'locked') return STAFF_LOADS_VISUAL.strip.risk;
    if (slot === 'answered') return STAFF_LOADS_VISUAL.strip.caution;
  }

  if (p.status === 'stale') return STAFF_LOADS_VISUAL.strip.inactive;
  /** Until a loads answer exists, edge stays neutral grey (not refresh/lock workflow colors). */
  if (p.status !== 'answered') {
    if (p.locked_by && p.lock_expires_at && new Date(p.lock_expires_at).getTime() > now)
      return STAFF_LOADS_VISUAL.strip.awaitingNeutral;
    return STAFF_LOADS_VISUAL.strip.neutral;
  }
  if (p.refresh_requested_at) return STAFF_LOADS_VISUAL.strip.caution;
  const fromSeats = staffLoadsPreviewStripColorFromSeatCounts(
    p.latest_answer_open_seats_total,
    p.latest_answer_nonrev_listed_total
  );
  if (fromSeats) return fromSeats;
  const kind = normalizeStaffLoadLevel(p.latest_answer_load_level);
  if (kind !== 'unknown') return loadLevelStripColor(kind);
  return STAFF_LOADS_VISUAL.strip.favorable;
}

/** List cards: left strip = workflow + (when answered) load quality from latest answer. */
export function staffLoadsListAccentStrip(row: StaffLoadRequestRow, now: number): string {
  if (row.status === 'stale') return STAFF_LOADS_VISUAL.strip.inactive;
  if (row.status !== 'answered') {
    if (lockActive(row, now)) return STAFF_LOADS_VISUAL.strip.awaitingNeutral;
    return STAFF_LOADS_VISUAL.strip.neutral;
  }
  if (row.refresh_requested_at) return STAFF_LOADS_VISUAL.strip.caution;
  const fromSeats = staffLoadsPreviewStripColorFromSeatCounts(
    row.latest_answer_open_seats_total,
    row.latest_answer_nonrev_listed_total
  );
  if (fromSeats) return fromSeats;
  const kind = normalizeStaffLoadLevel(row.latest_answer_load_level);
  if (kind !== 'unknown') return loadLevelStripColor(kind);
  return STAFF_LOADS_VISUAL.strip.favorable;
}

/** Detail header / summary card: prefer load snapshot when present. */
export function staffLoadsDetailAccentStrip(args: {
  status: StaffLoadRequestRow['status'];
  loadLevel: string | null | undefined;
  refreshRequested: boolean;
  lockActive: boolean;
  latestFlagged?: boolean;
}): string {
  if (args.status === 'stale') return STAFF_LOADS_VISUAL.strip.inactive;
  if (args.refreshRequested || args.latestFlagged) return STAFF_LOADS_VISUAL.strip.caution;
  if (args.lockActive) return STAFF_LOADS_VISUAL.strip.awaitingNeutral;
  const kind = normalizeStaffLoadLevel(args.loadLevel || undefined);
  if (args.loadLevel && kind !== 'unknown') return loadLevelStripColor(kind);
  if (args.status === 'answered') return STAFF_LOADS_VISUAL.strip.favorable;
  if (args.status === 'open') return STAFF_LOADS_VISUAL.strip.awaitingNeutral;
  return STAFF_LOADS_VISUAL.strip.neutral;
}

export function formatTravelDateShort(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatLocalHm(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type ChipSize = 'sm' | 'md';

export function StaffChip({
  label,
  backgroundColor,
  color,
  size = 'sm',
  style,
  textStyle,
}: {
  label: string;
  backgroundColor: string;
  color: string;
  size?: ChipSize;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const pad = size === 'sm' ? { px: 8, py: 3 } : { px: 10, py: 5 };
  return (
    <View style={[styles.chip, { backgroundColor, paddingHorizontal: pad.px, paddingVertical: pad.py }, style]}>
      <Text style={[size === 'sm' ? styles.chipTxSm : styles.chipTxMd, { color }, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function AirlineMonogram({ code }: { code: string }) {
  const c = (code || '?').slice(0, 3).toUpperCase();
  return (
    <View style={styles.monoOuter}>
      <Text style={styles.monoTx}>{c}</Text>
    </View>
  );
}

export function StaffLoadsCardShell({
  accentColor,
  children,
  style,
  compact,
}: {
  accentColor: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Tighter padding for list tiles (Loads home + search). */
  compact?: boolean;
}) {
  return (
    <View style={[styles.shell, style]}>
      <View style={[styles.shellAccent, { backgroundColor: accentColor }]} />
      <View style={[styles.shellBody, compact && styles.shellBodyCompact]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1dae6',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  shellAccent: { width: 5 },
  shellBody: { flex: 1, padding: 16 },
  /** Loads tiles (active + search): shared rhythm — matches StaffLoadsTileInner spacing */
  /** Slightly tighter horizontal padding so tile text (esp. left column) has room without clipping. */
  shellBodyCompact: { paddingVertical: 7, paddingHorizontal: 8, paddingRight: 8 },
  chip: {
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  chipTxSm: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  chipTxMd: { fontSize: 12, fontWeight: '800', letterSpacing: 0.15 },
  monoOuter: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monoTx: { fontSize: 12, fontWeight: '800', color: '#0f172a', letterSpacing: -0.2 },
});
