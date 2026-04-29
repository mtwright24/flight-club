import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchCrewScheduleTripByPairingUuid } from '../scheduleApi';
import { scheduleTheme as T } from '../scheduleTheme';
import { buildTripDetailViewModel } from '../tripDetailViewModel';
import type { CrewScheduleTrip } from '../types';
import TripCrewList from './TripCrewList';
import TripStatTilesRow from './TripStatTilesRow';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Quick trip preview: scrollable bottom-sheet style modal (not full operational detail).
 */
export default function TripQuickPreviewSheet({
  visible,
  trip,
  onClose,
  onOpenFullTrip,
}: {
  visible: boolean;
  trip: CrewScheduleTrip | null;
  onClose: () => void;
  onOpenFullTrip: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [enrichedTrip, setEnrichedTrip] = useState<CrewScheduleTrip | null>(null);

  useEffect(() => {
    setEnrichedTrip(null);
  }, [trip?.id]);

  useEffect(() => {
    if (!visible || !trip) return;
    if (!UUID_RE.test(trip.id)) return;
    let cancelled = false;
    fetchCrewScheduleTripByPairingUuid(trip.id)
      .then((t) => {
        if (!cancelled && t) setEnrichedTrip(t);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, trip?.id]);

  const displayTrip = enrichedTrip ?? trip ?? null;
  const vm = useMemo(() => (displayTrip ? buildTripDetailViewModel(displayTrip) : null), [displayTrip]);

  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    if (!vm || !displayTrip) return;
    if (String(displayTrip.pairingCode).trim().toUpperCase() !== 'J1015') return;
    const ds = String(displayTrip.startDate).slice(0, 7);
    const de = String(displayTrip.endDate).slice(0, 7);
    if (ds > '2026-05' || de < '2026-05') return;
    console.log('[pairing-detail ui] TripQuickPreviewSheet final vm J1015', {
      enriched: enrichedTrip != null,
      block: vm.statTiles.find((x) => x.id === 'block')?.value ?? null,
      credit: vm.statTiles.find((x) => x.id === 'credit')?.value ?? null,
      tafb: vm.statTiles.find((x) => x.id === 'tafb')?.value ?? null,
      layover: vm.statTiles.find((x) => x.id === 'layover')?.value ?? null,
      crewCount: vm.crewMembers.length,
      routeSummary: vm.routeSummary,
      dayPanels: vm.days.length,
      firstDayLegs:
        vm.days[0]?.legs.map((l) => ({
          releaseLocal: l.releaseLocal ?? null,
          block: l.blockTimeLocal ?? null,
        })) ?? [],
    });
  }, [vm, displayTrip, enrichedTrip]);

  if (!trip || !vm || !displayTrip) return null;

  const sheetMaxH = Math.min(winH * 0.82, 720);
  const legCount = displayTrip.legs.length;
  const dayCount = vm.days.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Pressable style={[styles.sheet, { maxHeight: sheetMaxH, paddingBottom: Math.max(insets.bottom, 14) + 6 }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            nestedScrollEnabled
            bounces
          >
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
                <Ionicons name="close" size={24} color={T.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.dateRange}>{vm.dateRangeLabel}</Text>
            <Text style={styles.summary}>{vm.summaryLine}</Text>

            <View style={styles.statsBlock}>
              <TripStatTilesRow tiles={vm.statTiles} compact />
            </View>

            <View style={styles.section}>
              <Text style={styles.previewTitle}>Crew</Text>
              {vm.crewMembers.length > 0 ? (
                <TripCrewList members={vm.crewMembers} maxVisible={6} showTitle={false} />
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
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    width: '100%',
  },
  sheetScroll: { flexGrow: 0, maxHeight: '100%' },
  sheetScrollContent: { paddingBottom: 12 },
  grabberWrap: { alignItems: 'center', paddingBottom: 10 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: T.line },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1, paddingRight: 8 },
  closeHit: { padding: 4, marginTop: -2 },
  pairing: { fontSize: 22, fontWeight: '800', color: T.text, letterSpacing: -0.3 },
  route: { fontSize: 15, fontWeight: '600', color: T.textSecondary, marginTop: 6, lineHeight: 20 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FECACA',
  },
  badgeText: { fontSize: 12, fontWeight: '800', color: T.accent },
  dateRange: { fontSize: 14, fontWeight: '700', color: T.text, marginTop: 14 },
  summary: { fontSize: 13, color: T.textSecondary, marginTop: 6, lineHeight: 18 },
  statsBlock: { marginTop: 14 },
  section: { marginTop: 16 },
  previewCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: T.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  previewTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: T.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  previewLine: { fontSize: 13, fontWeight: '600', color: T.text, marginTop: 4, lineHeight: 18 },
  previewMuted: { fontWeight: '700', color: T.textSecondary },
  opsHint: { marginTop: 14, paddingVertical: 8 },
  opsHintText: { fontSize: 12, color: T.textSecondary, fontWeight: '600' },
  primaryBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.accent,
    paddingVertical: 15,
    borderRadius: 12,
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  emdash: { fontSize: 15, fontWeight: '700', color: T.textSecondary, marginTop: 4 },
});
