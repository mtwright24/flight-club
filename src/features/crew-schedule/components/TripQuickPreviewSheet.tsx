import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleTheme as T } from '../scheduleTheme';
import { buildTripDetailViewModel, type TripStatTile } from '../tripDetailViewModel';
import type { CrewScheduleTrip } from '../types';
import { validateVisibleTripHandoff } from '../pairingHandoff';
import { isExemptFromStrictPairingPaint } from '../pairingRenderableGate';
import { buildPairingFirstPaintDecision, resolveRenderablePairingSnapshot } from '../resolveRenderablePairingSnapshot';
import { monthCalendarKey } from '../scheduleMonthCache';
import { readPairingDetailFromMonthCache, storeDetailReadyPairingInMonthCaches } from '../pairingDetailMonthCache';
import { readCommittedMonthSnapshot } from '../scheduleStableSnapshots';
import { canSealPairingSurface } from '../pairingDetailReadiness';
import { shouldRejectWeakerPairingRender } from '../tripDetailNavCache';
import TripCrewList from './TripCrewList';
import TripStatTilesRow from './TripStatTilesRow';

/**
 * Quick trip preview: scrollable bottom-sheet style modal (not full operational detail).
 */
export default function TripQuickPreviewSheet({
  visible,
  trip,
  onClose,
  onOpenFullTrip,
  pairingUuid,
}: {
  visible: boolean;
  trip: CrewScheduleTrip | null;
  onClose: () => void;
  onOpenFullTrip: () => void;
  /** Optional override (e.g. route param); otherwise `trip.schedulePairingId` + overlap resolver are used. */
  pairingUuid?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [resolvedTrip, setResolvedTrip] = useState<CrewScheduleTrip | null>(null);
  const [resolveSettled, setResolveSettled] = useState(false);
  const previewTargetTripIdRef = useRef<string>('');
  const previewPaintSealedRef = useRef(false);

  const tripRef = useRef(trip);
  tripRef.current = trip;

  useLayoutEffect(() => {
    const tripRow = tripRef.current;
    if (!visible) {
      previewPaintSealedRef.current = false;
      previewTargetTripIdRef.current = '';
      setResolvedTrip(null);
      setResolveSettled(false);
      return;
    }
    if (!tripRow) {
      setResolvedTrip(null);
      setResolveSettled(false);
      return;
    }
    previewTargetTripIdRef.current = tripRow.id;
    if (isExemptFromStrictPairingPaint(tripRow)) {
      previewPaintSealedRef.current = true;
      setResolvedTrip(null);
      setResolveSettled(true);
      return;
    }
    const monthKey = monthCalendarKey(tripRow.year, tripRow.month);
    const rowDate =
      tripRow.startDate && /^\d{4}-\d{2}-\d{2}/.test(tripRow.startDate)
        ? tripRow.startDate.slice(0, 10)
        : null;
    const cached = readPairingDetailFromMonthCache(tripRow.id, monthKey, rowDate);
    if (cached) {
      previewPaintSealedRef.current = true;
      setResolvedTrip(cached);
      setResolveSettled(true);
      return;
    }
    const anchor = rowDate;
    const { pick: instant } = buildPairingFirstPaintDecision(
      tripRow.id,
      anchor,
      tripRow,
    );
    if (instant && canSealPairingSurface(instant.trip)) {
      previewPaintSealedRef.current = true;
      setResolvedTrip(instant.trip);
      setResolveSettled(true);
      return;
    }
    setResolvedTrip(null);
    setResolveSettled(false);
  }, [visible, trip?.id]);

  useEffect(() => {
    if (!visible || !trip || isExemptFromStrictPairingPaint(trip)) {
      return;
    }
    if (previewPaintSealedRef.current) {
      return;
    }
    const targetTripId = trip.id;
    const targetPairing = String(trip.pairingCode ?? '').trim().toUpperCase();
    let cancelled = false;
    void (async () => {
      if (previewPaintSealedRef.current) {
        return;
      }
      try {
        const r = await resolveRenderablePairingSnapshot(targetTripId, pairingUuid ?? null, trip);
        if (cancelled) return;
        if (
          previewTargetTripIdRef.current !== targetTripId ||
          String(trip.pairingCode ?? '').trim().toUpperCase() !== targetPairing
        ) {
          return;
        }
        if (r) {
          setResolvedTrip((prev) => {
            if (previewPaintSealedRef.current && prev && canSealPairingSurface(prev)) {
              return prev;
            }
            if (prev && shouldRejectWeakerPairingRender(prev, r.trip)) {
              if (canSealPairingSurface(prev)) {
                previewPaintSealedRef.current = true;
              }
              return prev;
            }
            const seal = canSealPairingSurface(r.trip);
            previewPaintSealedRef.current = seal;
            if (seal) {
              const mk = monthCalendarKey(r.trip.year, r.trip.month);
              const idk = readCommittedMonthSnapshot(mk)?.identityKey ?? 'preview-enriched';
              storeDetailReadyPairingInMonthCaches(r.trip, idk, mk);
            }
            return r.trip;
          });
        }
      } finally {
        if (!cancelled) {
          setResolveSettled(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, trip, pairingUuid]);

  const paintTrip = useMemo((): CrewScheduleTrip | null => {
    if (!trip) return null;
    if (isExemptFromStrictPairingPaint(trip)) return trip;
    return resolvedTrip;
  }, [trip, resolvedTrip]);

  const showLoadingShell = Boolean(
    visible && trip && !isExemptFromStrictPairingPaint(trip) && !resolveSettled,
  );

  const showErrorStub = Boolean(
    visible && trip && !isExemptFromStrictPairingPaint(trip) && resolveSettled && !resolvedTrip,
  );

  const vm = useMemo(() => {
    if (!visible || !trip || showLoadingShell || showErrorStub) return null;
    if (!paintTrip) return null;
    if (!paintTrip.id?.trim()) return null;
    if (!isExemptFromStrictPairingPaint(trip) && !validateVisibleTripHandoff(paintTrip).ok) return null;
    return buildTripDetailViewModel(paintTrip);
  }, [visible, trip, paintTrip, showLoadingShell, showErrorStub]);

  const statTiles: TripStatTile[] = useMemo(() => (vm ? vm.statTiles : []), [vm]);

  if (!trip) return null;

  const sheetMaxH = Math.min(winH * 0.82, 720);
  /** Grabber + sheet padding above scroll (paddingTop + grabberWrap + grabber). */
  const sheetTopChromePx = 4 + 6 + 4;
  const sheetPadBottom = Math.max(insets.bottom, 12) + 6;
  const scrollViewportMaxH = Math.max(260, sheetMaxH - sheetTopChromePx - sheetPadBottom);
  const scrollContentPadBottom = Math.max(insets.bottom, 12) + 14;
  const legCount = paintTrip?.legs.length ?? 0;
  const dayCount = vm?.days.length ?? 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <View style={styles.overlay}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdropDim]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View style={[styles.sheet, { maxHeight: sheetMaxH, paddingBottom: sheetPadBottom }]}>
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>

          <ScrollView
            style={[styles.sheetScroll, { maxHeight: scrollViewportMaxH }]}
            contentContainerStyle={[styles.sheetScrollContent, { paddingBottom: scrollContentPadBottom }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            nestedScrollEnabled
            bounces
          >
            {showLoadingShell ? (
              <View style={styles.hydrateShell}>
                <View style={styles.headerRow}>
                  <View style={styles.headerText}>
                    <Text style={styles.pairing}>{trip.pairingCode}</Text>
                    <Text style={styles.routeMuted}>Loading full pairing…</Text>
                  </View>
                  <Pressable onPress={onClose} style={styles.closeHit} hitSlop={12} accessibilityLabel="Close preview">
                    <Ionicons name="close" size={20} color={T.textSecondary} />
                  </Pressable>
                </View>
                <ActivityIndicator style={styles.hydrateSpinner} color={T.accent} />
                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => {
                    onClose();
                    onOpenFullTrip();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Open full trip"
                >
                  <Text style={styles.primaryBtnText}>Open Full Trip</Text>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </Pressable>
              </View>
            ) : showErrorStub ? (
              <View style={styles.hydrateShell}>
                <View style={styles.headerRow}>
                  <View style={styles.headerText}>
                    <Text style={styles.pairing}>{trip.pairingCode}</Text>
                    <Text style={styles.routeMuted}>Preview unavailable for this assignment.</Text>
                  </View>
                  <Pressable onPress={onClose} style={styles.closeHit} hitSlop={12} accessibilityLabel="Close preview">
                    <Ionicons name="close" size={20} color={T.textSecondary} />
                  </Pressable>
                </View>
                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => {
                    onClose();
                    onOpenFullTrip();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Open full trip"
                >
                  <Text style={styles.primaryBtnText}>Open Full Trip</Text>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </Pressable>
              </View>
            ) : vm && paintTrip ? (
              <>
                <View style={styles.headerRow}>
                  <View style={styles.headerText}>
                    <Text style={styles.pairing}>{vm.pairingCode}</Text>
                    <Text style={styles.route} numberOfLines={2}>
                      {vm.routeSummary}
                    </Text>
                    <View style={styles.badgeRow}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{vm.statusLabel}</Text>
                      </View>
                    </View>
                  </View>
                  <Pressable onPress={onClose} style={styles.closeHit} hitSlop={12} accessibilityLabel="Close preview">
                    <Ionicons name="close" size={20} color={T.textSecondary} />
                  </Pressable>
                </View>

                <Text style={styles.dateRange}>{vm.dateRangeLabel}</Text>
                <Text style={styles.summary}>{vm.summaryLine}</Text>

                <View style={styles.statsBlock}>
                  <TripStatTilesRow tiles={statTiles} compact dense />
                </View>

                <View style={styles.section}>
                  <Text style={styles.previewTitle}>Crew</Text>
                  {vm.crewMembers.length > 0 ? (
                    <TripCrewList members={vm.crewMembers} maxVisible={4} showTitle={false} />
                  ) : (
                    <Text style={styles.emdash}>—</Text>
                  )}
                </View>

                <View style={styles.previewCard}>
                  <Text style={styles.previewTitle}>Layover & hotel</Text>
                  {vm.layoverHotelPreview && (vm.layoverHotelPreview.layoverLine || vm.layoverHotelPreview.hotelLine) ? (
                    <>
                      {vm.layoverHotelPreview.layoverLine ? (
                        <Text style={styles.previewLine}>
                          <Text style={styles.previewMuted}>City </Text>
                          {vm.layoverHotelPreview.layoverLine}
                        </Text>
                      ) : null}
                      {vm.layoverHotelPreview.hotelLine ? (
                        <Text style={styles.previewLine} numberOfLines={3}>
                          <Text style={styles.previewMuted}>Hotel </Text>
                          {vm.layoverHotelPreview.hotelLine}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.emdash}>—</Text>
                  )}
                </View>

                <View style={styles.opsHint}>
                  <Text style={styles.opsHintText}>
                    {legCount > 0
                      ? `${legCount} leg${legCount === 1 ? '' : 's'} · ${dayCount} operating day${dayCount === 1 ? '' : 's'}`
                      : 'Open full trip for day-by-day legs and times'}
                  </Text>
                </View>

                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => {
                    onClose();
                    onOpenFullTrip();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Open full trip"
                >
                  <Text style={styles.primaryBtnText}>Open Full Trip</Text>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </Pressable>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  /** Sheet stacks above dim tap target; do not wrap sheet in Pressable (scroll would dismiss). */
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropDim: {
    backgroundColor: 'rgba(43, 46, 60, 0.52)',
  },
  sheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    width: '100%',
    flexDirection: 'column',
  },
  sheetScroll: {},
  sheetScrollContent: {},
  grabberWrap: { alignItems: 'center', paddingBottom: 6 },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: T.line },
  hydrateShell: { paddingBottom: 8 },
  hydrateSpinner: { marginVertical: 24 },
  routeMuted: { fontSize: 13, fontWeight: '600', color: T.textSecondary, marginTop: 4, lineHeight: 17 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1, paddingRight: 6 },
  closeHit: { padding: 2, marginTop: -2 },
  pairing: { fontSize: 18, fontWeight: '800', color: T.text, letterSpacing: -0.3 },
  route: { fontSize: 13, fontWeight: '600', color: T.textSecondary, marginTop: 4, lineHeight: 17 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FECACA',
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: T.accent },
  dateRange: { fontSize: 12, fontWeight: '700', color: T.text, marginTop: 8 },
  summary: { fontSize: 12, color: T.textSecondary, marginTop: 4, lineHeight: 16 },
  statsBlock: { marginTop: 8 },
  section: { marginTop: 10 },
  previewCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: T.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  previewTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: T.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  previewLine: { fontSize: 12, fontWeight: '600', color: T.text, marginTop: 2, lineHeight: 16 },
  previewMuted: { fontWeight: '700', color: T.textSecondary },
  opsHint: { marginTop: 8, paddingVertical: 4 },
  opsHintText: { fontSize: 11, color: T.textSecondary, fontWeight: '600' },
  primaryBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.accent,
    paddingVertical: 11,
    borderRadius: 10,
    gap: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  emdash: { fontSize: 13, fontWeight: '700', color: T.textSecondary, marginTop: 2 },
});
