import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { scheduleTheme as T } from '../scheduleTheme';
import type { TripDetailViewModel } from '../tripDetailViewModel';
import TripStatTilesRow from './TripStatTilesRow';

type Props = {
  vm: TripDetailViewModel;
  /** When false, omit stat tiles (e.g. if shown elsewhere) */
  showStats?: boolean;
};

export default function TripSummaryCard({ vm, showStats = true }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.route}>{vm.routeSummary}</Text>
      <Text style={styles.pair}>{vm.pairingCode}</Text>
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{vm.statusLabel}</Text>
        </View>
        {vm.trip.base ? (
          <View style={[styles.badge, styles.badgeMuted]}>
            <Text style={styles.badgeTextMuted}>Base {vm.trip.base}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.meta}>{vm.dateRangeLabel}</Text>
      <Text style={styles.meta}>{vm.summaryLine}</Text>
      {showStats ? (
        <View style={styles.stats}>
          <TripStatTilesRow tiles={vm.statTiles} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: T.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  route: { fontSize: 19, fontWeight: '800', color: T.text, letterSpacing: -0.2 },
  pair: { fontSize: 14, fontWeight: '700', color: T.textSecondary, marginTop: 6 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 8 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FECACA',
  },
  badgeMuted: { backgroundColor: T.surfaceMuted, borderColor: T.line },
  badgeText: { fontSize: 12, fontWeight: '800', color: T.accent },
  badgeTextMuted: { fontSize: 12, fontWeight: '700', color: T.text },
  meta: { fontSize: 14, color: T.text, marginTop: 8, fontWeight: '600' },
  stats: { marginTop: 14 },
});
