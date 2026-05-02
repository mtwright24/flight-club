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
import {
  fetchCrewScheduleTripByPairingUuid,
  fetchTripMetadataForGroup,
  mergeTripWithMetadataRow,
  resolveSchedulePairingDbIdByOverlap,
} from '../scheduleApi';
import { scheduleTheme as T } from '../scheduleTheme';
import { buildTripDetailViewModel, type TripStatTile } from '../tripDetailViewModel';
import type { CrewScheduleTrip } from '../types';
import { pairingNavigationSessionKey } from '../scheduleStableSnapshots';
import { devLogCarryoverOrInternationalCheck, validateFullPairingHandoff } from '../pairingHandoff';
import TripCrewList from './TripCrewList';
import TripStatTilesRow from './TripStatTilesRow';
import { isFlicaNonFlyingActivityId } from '../../../services/flicaScheduleHtmlParser';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function quickPreviewTripIsEnrichable(t: CrewScheduleTrip): boolean {
  const code = String(t.pairingCode ?? '').trim().toUpperCase();
  if (!code || code === '—' || code === 'CONT' || code === 'RDO') return false;
  if (isFlicaNonFlyingActivityId(code)) return false;
  if (t.status === 'off' || t.status === 'pto' || t.status === 'ptv' || t.status === 'rsv') return false;
  if (t.status === 'training' || t.status === 'other') return false;
  return true;
}

/**
 * Same resolution order as TripDetailScreen, except we never treat `trip.id` (trip_group_id) as
 * schedule_pairings.id — overlap resolver must supply the DB UUID for classic/list trips.
 */
async function resolveSchedulePairingIdForQuickPreview(
  trip: CrewScheduleTrip,
  pairingUuidProp?: string | null,
): Promise<string | null> {
  const fromProp =
    pairingUuidProp && String(pairingUuidProp).trim().length > 0 && UUID_RE.test(String(pairingUuidProp).trim())
      ? String(pairingUuidProp).trim()
      : null;
  const fromTrip =
    trip.schedulePairingId && UUID_RE.test(String(trip.schedulePairingId).trim())
      ? String(trip.schedulePairingId).trim()
      : null;
  if (fromTrip) return fromTrip;
  if (fromProp) return fromProp;
  const overlap =
    (await resolveSchedulePairingDbIdByOverlap({
      pairingCode: trip.pairingCode,
      rangeStart: trip.startDate,
      rangeEnd: trip.endDate,
    })) ?? null;
  return overlap;
}

function mergeEnrichedPreviewTrip(enrf: CrewScheduleTrip, classic: CrewScheduleTrip): CrewScheduleTrip {
  return {
    ...enrf,
    id: classic.id,
    month: classic.month,
    year: classic.year,
    schedulePairingId: enrf.schedulePairingId ?? classic.schedulePairingId ?? null,
    ledgerContext: classic.ledgerContext ?? enrf.ledgerContext,
  };
}

function devLogPreviewPairing(trip: CrewScheduleTrip): boolean {
  const c = String(trip.pairingCode ?? '').trim().toUpperCase();
  return c === 'J4173' || c === 'J1015';
}

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
  const [enrichedTrip, setEnrichedTrip] = useState<CrewScheduleTrip | null>(null);
  const previewTargetTripIdRef = useRef<string>('');
  const previewSessionKeyRef = useRef<string>('');

  useLayoutEffect(() => {
    if (!visible) {
      previewTargetTripIdRef.current = '';
      previewSessionKeyRef.current = '';
      setEnrichedTrip(null);
      return;
    }
    previewTargetTripIdRef.current = trip?.id ?? '';
    if (trip) {
      previewSessionKeyRef.current = pairingNavigationSessionKey(trip);
      const v = validateFullPairingHandoff(trip);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        if (v.ok) {
          console.log('[PAIRING_SUMMARY_FULL_SNAPSHOT_USED]', {
            tripId: trip.id,
            sessionKey: previewSessionKeyRef.current,
          });
          devLogCarryoverOrInternationalCheck(trip, 'summary_sheet');
        } else {
          console.log('[PREVENTED_PARTIAL_PAIRING_RENDER]', {
            where: 'summary_sheet_open',
            tripId: trip.id,
            reason: v.reason ?? 'invalid_handoff',
          });
        }
      }
    } else {
      previewSessionKeyRef.current = '';
    }
    setEnrichedTrip(null);
  }, [visible, trip?.id, trip]);

  useEffect(() => {
    if (!visible || !trip || !quickPreviewTripIsEnrichable(trip)) {
      return;
    }
    const targetTripId = trip.id;
    const targetPairing = String(trip.pairingCode ?? '').trim().toUpperCase();
    const targetSessionKey = trip ? pairingNavigationSessionKey(trip) : '';
    let cancel = false;
    (async () => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[PAIRING_SUMMARY_REFRESH_START]', { tripId: targetTripId });
      }
      const resolved = await resolveSchedulePairingIdForQuickPreview(trip, pairingUuid);
      if (typeof __DEV__ !== 'undefined' && __DEV__ && devLogPreviewPairing(trip)) {
        console.log('[quick-preview enrich]', {
          inputTripId: trip.id,
          schedulePairingId: trip.schedulePairingId ?? null,
          propPairingUuid: pairingUuid ?? null,
          resolvedPairingUuid: resolved,
        });
      }
      if (!resolved || cancel) return;
      try {
        const [fetched, meta] = await Promise.all([
          fetchCrewScheduleTripByPairingUuid(resolved),
          fetchTripMetadataForGroup(trip.id).catch(() => null),
        ]);
        if (cancel || !fetched) return;
        if (
          previewTargetTripIdRef.current !== targetTripId ||
          String(trip.pairingCode ?? '').trim().toUpperCase() !== targetPairing
        ) {
          return;
        }
        const withMeta = mergeTripWithMetadataRow(fetched, meta);
        const merged = mergeEnrichedPreviewTrip(withMeta, trip);
        if (pairingNavigationSessionKey(merged) !== previewSessionKeyRef.current || targetSessionKey !== previewSessionKeyRef.current) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log('[PAIRING_SUMMARY_REFRESH_REJECTED]', {
              reason: 'session_key_mismatch',
            });
            console.log('[PREVENTED_WRONG_PAIRING_RENDER]', { where: 'summary_sheet', reason: 'session_key_mismatch' });
          }
          return;
        }
        if (previewTargetTripIdRef.current !== targetTripId) return;
        setEnrichedTrip(merged);
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[PAIRING_SUMMARY_REFRESH_COMMIT]', { tripId: targetTripId });
          const hv = validateFullPairingHandoff(merged);
          if (hv.ok) {
            devLogCarryoverOrInternationalCheck(merged, 'summary_refresh');
          }
        }
        if (typeof __DEV__ !== 'undefined' && __DEV__ && devLogPreviewPairing(trip)) {
          console.log('[quick-preview enrich]', {
            fetchResult: {
              block: withMeta.pairingBlockHours ?? withMeta.summary?.blockTotal ?? null,
              credit: withMeta.pairingCreditHours ?? withMeta.summary?.creditTotal ?? null,
              tafb: withMeta.pairingTafbHours ?? (withMeta.summary ? withMeta.summary.tafbTotal / 60 : null),
              layoverMin: withMeta.tripLayoverTotalMinutes ?? withMeta.summary?.layoverTotal ?? null,
              crewLen: withMeta.crewMembers?.length ?? 0,
              hotelName: withMeta.hotel?.name ?? null,
              hotelPhone: withMeta.hotel?.phone ?? null,
            },
          });
        }
      } catch {
        /* keep classic fallback */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [visible, trip, pairingUuid]);

  const displayTrip = useMemo((): CrewScheduleTrip | null => {
    if (!trip) return null;
    if (
      enrichedTrip &&
      enrichedTrip.id === trip.id &&
      pairingNavigationSessionKey(enrichedTrip) === pairingNavigationSessionKey(trip)
    ) {
      return enrichedTrip;
    }
    return trip;
  }, [trip, enrichedTrip]);

  const needsHydrationShell = Boolean(
    visible &&
      trip &&
      quickPreviewTripIsEnrichable(trip) &&
      enrichedTrip == null &&
      !validateFullPairingHandoff(trip).ok,
  );

  const vm = useMemo(() => {
    if (!displayTrip || needsHydrationShell) return null;
    if (!validateFullPairingHandoff(displayTrip).ok) return null;
    return buildTripDetailViewModel(displayTrip);
  }, [displayTrip, needsHydrationShell]);

  const statTiles: TripStatTile[] = useMemo(() => (vm ? vm.statTiles : []), [vm]);

  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__ || !trip || !vm || !devLogPreviewPairing(trip)) return;
    console.log('[quick-preview final vm]', {
      enriched: enrichedTrip != null,
      block: vm.statTiles.find((x) => x.id === 'block')?.value ?? null,
      credit: vm.statTiles.find((x) => x.id === 'credit')?.value ?? null,
      tafb: vm.statTiles.find((x) => x.id === 'tafb')?.value ?? null,
      layover: vm.statTiles.find((x) => x.id === 'layover')?.value ?? null,
      crewLen: vm.crewMembers.length,
      hotelLine: vm.layoverHotelPreview?.hotelLine ?? null,
      routeSummary: vm.routeSummary,
    });
  }, [trip, vm, enrichedTrip]);

  if (!trip) return null;

  const sheetMaxH = Math.min(winH * 0.82, 720);
  /** Grabber + sheet padding above scroll (paddingTop + grabberWrap + grabber). */
  const sheetTopChromePx = 4 + 6 + 4;
  const sheetPadBottom = Math.max(insets.bottom, 12) + 6;
  const scrollViewportMaxH = Math.max(260, sheetMaxH - sheetTopChromePx - sheetPadBottom);
  const scrollContentPadBottom = Math.max(insets.bottom, 12) + 14;
  const legCount = displayTrip?.legs.length ?? 0;
  const dayCount = vm?.days.length ?? 0;
  const showErrorStub = Boolean(visible && !needsHydrationShell && !vm && trip);

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
            {needsHydrationShell ? (
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
            ) : vm && displayTrip ? (
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
