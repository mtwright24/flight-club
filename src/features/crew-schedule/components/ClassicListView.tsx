import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CrewScheduleTrip } from '../types';
import { scheduleTheme as T } from '../scheduleTheme';

const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function rowLabel(trip: CrewScheduleTrip): string {
  const st = trip.status;
  if (st === 'off') return 'OFF';
  if (st === 'rsv') return 'RSV';
  if (st === 'pto') return 'PTO';
  if (st === 'deadhead') return `DH | ${trip.routeSummary.replace(/^DH \| /, '')}`;
  if (st === 'continuation') return 'continuation';
  return trip.routeSummary;
}

function subline(trip: CrewScheduleTrip): string | null {
  if (trip.legs.length === 0) return null;
  const leg = trip.legs[0];
  const parts = [leg.reportLocal && `Rpt ${leg.reportLocal}`, leg.releaseLocal && `Rel ${leg.releaseLocal}`].filter(
    Boolean
  ) as string[];
  return parts.length ? parts.join(' · ') : null;
}

type Props = {
  trips: CrewScheduleTrip[];
  onPressTrip: (trip: CrewScheduleTrip) => void;
};

export default function ClassicListView({ trips, onPressTrip }: Props) {
  return (
    <View style={styles.wrap}>
      {trips.map((trip) => {
        const d = new Date(trip.startDate + 'T12:00:00');
        const dow = DOW[d.getDay()];
        const dayNum = d.getDate();
        const tint =
          trip.status === 'off'
            ? T.tintOff
            : trip.status === 'rsv'
              ? T.tintRsv
              : trip.status === 'pto'
                ? T.tintPto
                : T.tintFly;
        const sub = subline(trip);
        return (
          <Pressable
            key={trip.id}
            onPress={() => onPressTrip(trip)}
            style={({ pressed }) => [styles.row, { backgroundColor: tint }, pressed && { opacity: 0.92 }]}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.dow}>{dow}</Text>
              <Text style={styles.day}>{dayNum}</Text>
            </View>
            <View style={styles.rowMid}>
              <Text style={styles.code} numberOfLines={1}>
                {trip.pairingCode}
              </Text>
              <Text style={styles.route} numberOfLines={2}>
                {rowLabel(trip)}
              </Text>
              {sub ? (
                <Text style={styles.sub} numberOfLines={1}>
                  {sub}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={T.textSecondary} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
    gap: 10,
  },
  rowLeft: { width: 44, alignItems: 'flex-start' },
  dow: { fontSize: 11, fontWeight: '800', color: T.textSecondary, letterSpacing: 0.5 },
  day: { fontSize: 18, fontWeight: '800', color: T.text },
  rowMid: { flex: 1, minWidth: 0 },
  code: { fontSize: 13, fontWeight: '800', color: T.text },
  route: { fontSize: 13, color: T.text, marginTop: 2 },
  sub: { fontSize: 11, color: T.textSecondary, marginTop: 2 },
});
