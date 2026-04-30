import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { scheduleTheme as T } from '../scheduleTheme';
import type { TripDayViewModel } from '../tripDetailViewModel';
import type { CrewScheduleLeg } from '../types';

type Props = {
  day: TripDayViewModel;
  legStatuses: Record<string, string>;
  trackingLegId: string | null;
  onTrackLeg: (leg: CrewScheduleLeg) => void;
};

export default function TripDayDetailPanel({ day, legStatuses, trackingLegId, onTrackLeg }: Props) {
  const reportDisplay = day.legs.find((l) => l.reportLocal?.trim())?.reportLocal;
  return (
    <View style={styles.card}>
      <View style={styles.dayTitleRow}>
        <Text style={styles.dayPill}>{day.dayLabel}</Text>
        <Text style={styles.dayDate}>{day.dateShort}</Text>
      </View>

      {reportDisplay ? (
        <View style={styles.reportRow}>
          <Text style={styles.reportK}>Report</Text>
          <Text style={styles.reportV}>{reportDisplay}</Text>
        </View>
      ) : null}

      {day.layoverRestLine ? (
        <View style={styles.layRow}>
          <Text style={styles.layLabel}>Layover rest</Text>
          <Text style={styles.layVal}>{day.layoverRestLine}</Text>
        </View>
      ) : null}

      {day.legs.length === 0 ? (
        <Text style={styles.muted}>No flight legs on file for this day.</Text>
      ) : (
        day.legs.map((leg, idx) => (
          <View key={leg.id} style={[styles.legBlock, idx === 0 && styles.legBlockFirst]}>
            <View style={styles.legTop}>
              <Text style={styles.legPair}>
                {leg.departureAirport} → {leg.arrivalAirport}
              </Text>
              {leg.isDeadhead ? (
                <View style={styles.dh}>
                  <Text style={styles.dhText}>DH</Text>
                </View>
              ) : null}
            </View>
            {leg.flightNumber ? <Text style={styles.fn}>Flight {leg.flightNumber}</Text> : null}
            <View style={styles.timeGrid}>
              {leg.dutyDayCalendarDom != null ? <Row k="Calendar day" v={String(leg.dutyDayCalendarDom)} /> : null}
              <Row k="Departure" v={leg.departLocal} />
              <Row k="Arrival" v={leg.arriveLocal} />
              {leg.blockTimeLocal ? <Row k="Block" v={leg.blockTimeLocal} /> : <Row k="Block" v={undefined} />}
              {leg.equipmentCode ? <Row k="Equipment" v={leg.equipmentCode} /> : <Row k="Equipment" v={undefined} />}
              {leg.layoverCityLeg ? <Row k="Layover city" v={leg.layoverCityLeg} /> : null}
              {leg.layoverRestDisplay ? <Row k="Layover / rest" v={leg.layoverRestDisplay} /> : null}
              <Row k="Duty end (D-END)" v={leg.releaseLocal} />
            </View>
            {legStatuses[leg.id] ? <Text style={styles.live}>Live: {legStatuses[leg.id]}</Text> : null}
            {leg.flightNumber ? (
              <Pressable
                style={styles.trackBtn}
                onPress={() => onTrackLeg(leg)}
                disabled={trackingLegId === leg.id}
              >
                {trackingLegId === leg.id ? (
                  <ActivityIndicator size="small" color={T.accent} />
                ) : (
                  <Ionicons name="airplane-outline" size={15} color={T.accent} />
                )}
                <Text style={styles.trackTxt}>{trackingLegId === leg.id ? 'Loading…' : 'Track this leg'}</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowK}>{k}</Text>
      <Text style={styles.rowV}>{v?.trim() ? v : '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: T.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  dayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
  },
  dayPill: {
    fontSize: 14,
    fontWeight: '800',
    color: T.accent,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
  },
  dayDate: { fontSize: 14, fontWeight: '700', color: T.textSecondary },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
  },
  reportK: { fontSize: 12, fontWeight: '800', color: T.textSecondary, textTransform: 'uppercase' },
  reportV: { fontSize: 14, fontWeight: '700', color: T.text },
  layRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: T.surfaceMuted,
  },
  layLabel: { fontSize: 12, fontWeight: '700', color: T.textSecondary },
  layVal: { fontSize: 15, fontWeight: '800', color: T.text },
  legBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.line,
  },
  legBlockFirst: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  legTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legPair: { fontSize: 16, fontWeight: '800', color: T.text, flex: 1, marginRight: 8 },
  dh: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
  },
  dhText: { fontSize: 11, fontWeight: '800', color: '#3730A3' },
  fn: { fontSize: 13, color: T.textSecondary, marginTop: 6, fontWeight: '600' },
  timeGrid: { marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowK: { fontSize: 13, color: T.textSecondary, fontWeight: '600', width: '36%' },
  rowV: { fontSize: 14, color: T.text, fontWeight: '700', flex: 1, textAlign: 'right' },
  live: { marginTop: 8, fontSize: 12, fontWeight: '700', color: '#1D4ED8' },
  trackBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    backgroundColor: T.surfaceMuted,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  trackTxt: { fontSize: 13, fontWeight: '800', color: T.accent },
  muted: { fontSize: 14, color: T.textSecondary, marginTop: 4 },
});
