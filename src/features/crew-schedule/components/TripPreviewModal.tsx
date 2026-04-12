import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleTheme as T } from '../scheduleTheme';
import type { CrewScheduleTrip } from '../types';

function formatRange(trip: CrewScheduleTrip): string {
  const a = new Date(trip.startDate + 'T12:00:00');
  const b = new Date(trip.endDate + 'T12:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  if (trip.startDate === trip.endDate) return a.toLocaleDateString(undefined, opts);
  return `${a.toLocaleDateString(undefined, opts)} → ${b.toLocaleDateString(undefined, opts)}`;
}

function statusLine(trip: CrewScheduleTrip): string {
  const s = trip.status;
  if (s === 'flying') return 'Flying';
  if (s === 'deadhead') return 'Deadhead';
  if (s === 'continuation') return 'Continuation';
  if (s === 'off') return 'Off';
  if (s === 'pto') return 'PTO';
  if (s === 'rsv') return 'Reserve';
  if (s === 'training') return 'Training';
  return 'Duty';
}

export default function TripPreviewModal({
  visible,
  trip,
  onClose,
  onOpenFullDetail,
}: {
  visible: boolean;
  trip: CrewScheduleTrip | null;
  onClose: () => void;
  onOpenFullDetail: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  if (!trip) return null;

  const legs = trip.legs;
  const scrollMaxH = Math.min(winH * 0.72, 640);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close preview">
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>

          <ScrollView
            style={[styles.sheetScroll, { maxHeight: scrollMaxH }]}
            contentContainerStyle={styles.sheetScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            nestedScrollEnabled
          >
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderText}>
                <Text style={styles.pairing}>{trip.pairingCode !== '—' ? trip.pairingCode : 'Duty'}</Text>
                <Text style={styles.route} numberOfLines={2}>
                  {trip.routeSummary}
                </Text>
                <View style={styles.badgeRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{statusLine(trip)}</Text>
                  </View>
                </View>
              </View>
              <Pressable onPress={onClose} style={styles.closeHit} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={T.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.meta}>{formatRange(trip)}</Text>
            <Text style={styles.meta}>
              {trip.dutyDays} duty day{trip.dutyDays === 1 ? '' : 's'}
              {trip.pairingCreditHours != null
                ? ` · ${trip.pairingCreditHours.toFixed(2)} CR`
                : trip.creditHours != null
                  ? ` · ${trip.creditHours} CR`
                  : ''}
            </Text>

            {trip.pairingBlockHours != null ||
            trip.pairingCreditHours != null ||
            trip.pairingTafbHours != null ||
            trip.tripLayoverTotalMinutes != null ? (
              <Text style={styles.totalsLine}>
                Block {trip.pairingBlockHours != null ? `${trip.pairingBlockHours.toFixed(2)}h` : '—'} · Credit{' '}
                {trip.pairingCreditHours != null ? `${trip.pairingCreditHours.toFixed(2)}h` : '—'} · TAFB{' '}
                {trip.pairingTafbHours != null ? `${trip.pairingTafbHours.toFixed(2)}h` : '—'}
              </Text>
            ) : null}

            {trip.crewMembers && trip.crewMembers.length > 0 ? (
              <View style={styles.crewPreview}>
                <Text style={styles.sectionLabel}>Crew</Text>
                {trip.crewMembers.slice(0, 5).map((c, i) => (
                  <Text key={`${c.position}-${i}`} style={styles.crewPreviewLine}>
                    {c.position} · {c.name}
                  </Text>
                ))}
              </View>
            ) : null}

            {trip.layoverCity ? (
              <Text style={styles.layover}>
                Layover <Text style={styles.layoverStrong}>{trip.layoverCity}</Text>
              </Text>
            ) : null}

            {trip.hotel?.name ? (
              <Text style={styles.hotel} numberOfLines={2}>
                Hotel · {trip.hotel.name}
              </Text>
            ) : null}

            {legs.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Legs</Text>
                {legs.slice(0, 24).map((leg) => (
                  <View key={leg.id} style={styles.legRow}>
                    <Text style={styles.legRoute}>
                      {leg.departureAirport} → {leg.arrivalAirport}
                      {leg.isDeadhead ? ' · DH' : ''}
                    </Text>
                    {leg.flightNumber ? <Text style={styles.legFn}>Flt {leg.flightNumber}</Text> : null}
                    <Text style={styles.legTimes}>
                      Report {leg.reportLocal ?? '—'} · D-END {leg.releaseLocal ?? '—'}
                    </Text>
                    <Text style={styles.legTimes}>
                      Dep {leg.departLocal ?? '—'} · Arr {leg.arriveLocal ?? '—'}
                    </Text>
                  </View>
                ))}
                {legs.length > 24 ? (
                  <Text style={styles.moreLegs}>+{legs.length - 24} more in full trip</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.muted}>No legs on file for this line yet.</Text>
            )}

            <Pressable style={styles.primaryBtn} onPress={onOpenFullDetail}>
              <Text style={styles.primaryBtnText}>Open full trip</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 8,
    maxHeight: '78%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  sheetScroll: { flexGrow: 0 },
  sheetScrollContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  grabberWrap: { alignItems: 'center', paddingBottom: 8 },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: T.line },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sheetHeaderText: { flex: 1, paddingRight: 8 },
  closeHit: { padding: 4 },
  pairing: { fontSize: 22, fontWeight: '800', color: T.text },
  route: { fontSize: 15, fontWeight: '600', color: T.textSecondary, marginTop: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: T.surfaceMuted,
    borderWidth: 1,
    borderColor: T.line,
  },
  badgeText: { fontSize: 12, fontWeight: '800', color: T.accent },
  meta: { fontSize: 14, color: T.text, marginTop: 10 },
  totalsLine: { fontSize: 12, color: T.textSecondary, marginTop: 8, lineHeight: 17 },
  crewPreview: { marginTop: 10 },
  crewPreviewLine: { fontSize: 12, color: T.text, marginTop: 4, fontWeight: '600' },
  layover: { fontSize: 14, color: T.textSecondary, marginTop: 8 },
  layoverStrong: { fontWeight: '700', color: T.text },
  hotel: { fontSize: 13, color: T.textSecondary, marginTop: 6 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: T.textSecondary,
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
  },
  legRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
  },
  legRoute: { fontSize: 15, fontWeight: '800', color: T.text },
  legFn: { fontSize: 13, color: T.textSecondary, marginTop: 2 },
  legTimes: { fontSize: 12, color: T.text, marginTop: 6, lineHeight: 17 },
  moreLegs: { fontSize: 12, color: T.textSecondary, paddingVertical: 8, fontStyle: 'italic' },
  muted: { fontSize: 14, color: T.textSecondary, marginTop: 12 },
  primaryBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
