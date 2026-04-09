import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NormalizedBoardRow } from '../types';
import { colors, radius, shadow, spacing } from '../../../styles/theme';
import type { TrackedFlightItem } from '../../../lib/supabase/flightTracker';

/** Flight Tracker hub — matches approved dashboard mockup */
export const ftHub = {
  screenBg: '#F9FAFB',
  /** Visible on white / gray — mockup “thin red outline” */
  quickTileBorder: '#FCA5A5',
  quickIcon: '#EF4444',
  quickRadius: 12 as const,
  /** Min height so each row lines up; interior is icon | text (mockup) */
  quickTileMinHeight: 96,
  quickTileGap: 10,
  contentPaddingH: 16,
  sectionRadius: 14 as const,
  sectionBorder: '#E8ECF1',
  /** Hairline under section title row (mockup) */
  dashDivider: '#E8ECF0',
};

/**
 * Pixel width for each quick-action tile (2 columns + gap inside padded content).
 * Do NOT enforce a minimum width: if min were too large vs. the row, flexWrap would put
 * one tile per row → a false “single column” list (common on phones & narrow web panes).
 */
export function getFlightTrackerQuickTileWidth(screenWidth: number, contentPaddingH = ftHub.contentPaddingH, gap = ftHub.quickTileGap) {
  const inner = Math.max(0, screenWidth - 2 * contentPaddingH);
  const w = Math.floor((inner - gap) / 2);
  return Math.max(1, w);
}

export function formatFlightTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function statusProgress(status: string | undefined): number {
  const s = String(status || '').toLowerCase();
  if (s.includes('land') || s === 'landed') return 100;
  if (s.includes('en_route') || s.includes('airborne')) return 72;
  if (s.includes('depart') || s === 'departed') return 48;
  if (s.includes('board')) return 28;
  if (s.includes('delay')) return 40;
  if (s.includes('cancel')) return 100;
  return 18;
}

/**
 * Single quick-action tile: white card, red outline. Mockup: icon upper-left, title to the
 * right of the icon, subtitle under the title.
 */
export function QuickActionTile(props: {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tileWidth: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.qaTile,
        { width: props.tileWidth, minHeight: ftHub.quickTileMinHeight },
        pressed && styles.qaTilePressed,
      ]}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${props.title}. ${props.subtitle}`}
    >
      <View style={styles.qaInnerRow}>
        <View style={styles.qaIconWrap}>
          <Ionicons name={props.icon} size={22} color={ftHub.quickIcon} />
        </View>
        <View style={styles.qaTextCol}>
          <Text style={styles.qaTitle} numberOfLines={2}>
            {props.title}
          </Text>
          <Text style={styles.qaSubtitle} numberOfLines={3}>
            {props.subtitle}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** @deprecated Prefer `QuickActionTile` — kept for any stale imports */
export const QuickActionCard = QuickActionTile;

export function SectionHeader(props: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{props.title}</Text>
      {props.right}
    </View>
  );
}

/**
 * Mockup: title + CTA on one line at top of card, faint divider, then body — not stacked in the middle.
 */
export function DashboardSection(props: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.dashCard}>
      <View style={styles.dashHeaderRow}>
        <Text style={styles.dashTitle} numberOfLines={1} ellipsizeMode="tail">
          {props.title}
        </Text>
        {props.right != null ? <View style={styles.dashHeaderRight}>{props.right}</View> : null}
      </View>
      <View style={styles.dashDivider} />
      <View style={styles.dashBody}>{props.children}</View>
    </View>
  );
}

export function SectionHeaderLink(props: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} hitSlop={8} style={({ pressed }) => [styles.sectionLinkWrap, pressed && { opacity: 0.7 }]}>
      <Text style={styles.sectionLink}>{props.label}</Text>
      <Text style={styles.sectionLinkChevron}>›</Text>
    </Pressable>
  );
}

export function ActiveTrackedCard(props: {
  item: TrackedFlightItem;
  inboundHint?: string | null;
  onPress: () => void;
  isLast?: boolean;
}) {
  const f = props.item.flight;
  if (!f) return null;
  const pct = statusProgress(f.normalized_status);
  const delay = f.delay_minutes;
  const tone =
    delay != null && delay >= 15
      ? styles.badgeDelay
      : f.normalized_status === 'cancelled'
        ? styles.badgeBad
        : styles.badgeOk;

  return (
    <Pressable style={[styles.activeCard, props.isLast && styles.activeCardLast]} onPress={props.onPress}>
      <View style={styles.activeTop}>
        <Text style={styles.activeFlight}>
          {f.airline_code} {f.flight_number}
        </Text>
        <View style={[styles.badge, tone]}>
          <Text style={styles.badgeText}>{f.normalized_status.replace(/_/g, ' ')}</Text>
        </View>
      </View>
      <Text style={styles.activeRoute}>
        {f.origin_airport} → {f.destination_airport}
      </Text>
      <View style={styles.timeRow}>
        <Text style={styles.timeLabel}>Dep</Text>
        <Text style={styles.timeVal}>{formatFlightTime(f.estimated_departure ?? f.scheduled_departure)}</Text>
        <Text style={styles.timeLabel}>Arr</Text>
        <Text style={styles.timeVal}>{formatFlightTime(f.estimated_arrival ?? f.scheduled_arrival)}</Text>
        {delay != null && delay > 0 ? (
          <View style={styles.delayPill}>
            <Text style={styles.delayPillText}>+{delay}m</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      {props.inboundHint ? <Text style={styles.inboundHint}>{props.inboundHint}</Text> : null}
    </Pressable>
  );
}

export function DelayAlertRow(props: {
  title: string;
  subtitle: string;
  onPress?: () => void;
  isLast?: boolean;
}) {
  const inner = (
    <>
      <Ionicons name="warning-outline" size={16} color={colors.primary} />
      <View style={styles.delayTextCol}>
        <Text style={styles.delayTitle}>{props.title}</Text>
        <Text style={styles.delaySub}>{props.subtitle}</Text>
      </View>
    </>
  );
  const rowStyle = [styles.delayRow, props.isLast && styles.delayRowLast];
  if (props.onPress) {
    return (
      <Pressable style={rowStyle} onPress={props.onPress}>
        {inner}
      </Pressable>
    );
  }
  return <View style={rowStyle}>{inner}</View>;
}

export function WatchlistRow(props: {
  item: TrackedFlightItem;
  onPress: () => void;
  isLast?: boolean;
}) {
  const f = props.item.flight;
  if (!f) return null;
  return (
    <Pressable style={[styles.watchRow, props.isLast && styles.watchRowLast]} onPress={props.onPress}>
      <View style={styles.watchLeft}>
        <Text style={styles.watchFlight}>
          {f.airline_code} {f.flight_number}
        </Text>
        <Text style={styles.watchRoute}>
          {f.origin_airport} → {f.destination_airport}
        </Text>
      </View>
      <View style={styles.watchRight}>
        <Text style={styles.watchTime}>{formatFlightTime(f.scheduled_departure ?? f.estimated_departure)}</Text>
        <Text style={styles.watchStatus}>{f.normalized_status.replace(/_/g, ' ')}</Text>
      </View>
    </Pressable>
  );
}

export function RecentSearchChip(props: {
  label: string;
  meta?: string;
  onPress: () => void;
  /** When set, avoids percentage width in 2-col grids */
  chipWidth?: number;
}) {
  return (
    <Pressable style={[styles.recentChip, props.chipWidth != null ? { width: props.chipWidth } : null]} onPress={props.onPress}>
      <Ionicons name="time-outline" size={16} color={colors.primary} />
      <View style={styles.recentChipText}>
        <Text style={styles.recentChipLabel} numberOfLines={1}>
          {props.label}
        </Text>
        {props.meta ? <Text style={styles.recentChipMeta}>{props.meta}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

export function BoardPreviewRow(props: { row: NormalizedBoardRow; isLast?: boolean }) {
  const r = props.row;
  return (
    <View style={[styles.boardRow, props.isLast && styles.boardRowLast]}>
      <Text style={styles.boardFn}>{r.displayFlightNumber}</Text>
      <Text style={styles.boardRoute} numberOfLines={1}>
        {r.origin} → {r.destination}
      </Text>
      <Text style={styles.boardTime}>{formatFlightTime(r.scheduledDepartureUtc ?? r.scheduledArrivalUtc)}</Text>
      <Text style={styles.boardGate} numberOfLines={1}>
        {r.gate ? `G${r.gate}` : '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  qaTile: {
    backgroundColor: '#FFFFFF',
    borderRadius: ftHub.quickRadius,
    paddingHorizontal: 11,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: ftHub.quickTileBorder,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  qaTilePressed: { opacity: 0.94, backgroundColor: '#FFF5F5' },
  qaInnerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  qaIconWrap: {
    marginRight: 10,
    paddingTop: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: 24,
  },
  qaTextCol: {
    flex: 1,
    minWidth: 0,
  },
  qaTitle: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.25,
    lineHeight: 18,
  },
  qaSubtitle: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 2,
  },
  sectionTitle: { color: '#1A1A1A', fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  /** Outer dashboard card: mockup shadow + border frame */
  dashCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: ftHub.sectionRadius,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8ECF1',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  /** Title + link on one horizontal line, top-aligned */
  dashHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    minHeight: 40,
  },
  dashTitle: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  dashHeaderRight: { flexShrink: 0, justifyContent: 'center' },
  dashDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ftHub.dashDivider,
    marginLeft: 14,
    marginRight: 14,
  },
  dashBody: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  sectionLinkWrap: { flexDirection: 'row', alignItems: 'center' },
  sectionLink: { color: colors.accentBlue, fontWeight: '700', fontSize: 12 },
  sectionLinkChevron: { color: colors.accentBlue, fontWeight: '700', fontSize: 13, marginLeft: 2 },
  activeCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E8ECF1',
    marginBottom: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  activeCardLast: {
    marginBottom: 0,
  },
  activeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activeFlight: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  activeRoute: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 3 },
  timeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  timeLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  timeVal: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  delayPill: {
    marginLeft: 'auto',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  delayPillText: { color: '#92400E', fontSize: 11, fontWeight: '800' },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  inboundHint: { marginTop: 8, color: colors.textSecondary, fontSize: 12, fontWeight: '600', fontStyle: 'italic' },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeOk: { backgroundColor: '#E2E8F0' },
  badgeDelay: { backgroundColor: '#FEF3C7' },
  badgeBad: { backgroundColor: '#FEE2E2' },
  badgeText: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize', color: colors.textPrimary },
  delayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECF0',
    marginBottom: 8,
  },
  delayRowLast: {
    borderBottomWidth: 0,
    marginBottom: 0,
  },
  delayTextCol: { flex: 1 },
  delayTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  delaySub: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', marginTop: 2, lineHeight: 15 },
  watchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECF0',
  },
  watchRowLast: {
    borderBottomWidth: 0,
  },
  watchLeft: { flex: 1, minWidth: 0 },
  watchRight: { alignItems: 'flex-end', marginLeft: 8 },
  watchFlight: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  watchRoute: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 2 },
  watchTime: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  watchStatus: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'capitalize' },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8ECF1',
    marginBottom: 0,
  },
  recentChipText: { flex: 1, minWidth: 0 },
  recentChipLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  recentChipMeta: { color: colors.textSecondary, fontSize: 10, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECF0',
  },
  boardRowLast: {
    borderBottomWidth: 0,
  },
  boardFn: { width: 72, color: colors.textPrimary, fontSize: 12, fontWeight: '800' },
  boardRoute: { flex: 1, color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  boardTime: { width: 56, color: colors.textPrimary, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  boardGate: { width: 40, color: colors.textSecondary, fontSize: 11, fontWeight: '600', textAlign: 'right' },
});
