import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { FlicaMonthStats, FlicaPairing } from '../../../services/flicaScheduleHtmlParser';
import { scheduleTheme as T } from '../scheduleTheme';

function formatLegLine(leg: FlicaPairing['legs'][0]): string {
  const fn = leg.flightNumber ? `B6 ${leg.flightNumber}` : '—';
  return `${fn}  ${leg.route}  ${leg.departLocal}–${leg.arriveLocal}`;
}

type Props = {
  stats: FlicaMonthStats;
  pairings: FlicaPairing[];
  importedAt?: string | null;
};

export default function FlicaCrewScheduleSection({ stats, pairings, importedAt }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>JetBlue schedule (FLICA)</Text>
      {importedAt ? (
        <Text style={styles.meta}>Imported {new Date(importedAt).toLocaleString()}</Text>
      ) : null}

      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Month totals</Text>
        <View style={styles.statsRow}>
          <Text style={styles.statCell}>
            <Text style={styles.statLabel}>Block</Text>
            {'\n'}
            <Text style={styles.statVal}>{stats.block || '—'}</Text>
          </Text>
          <Text style={styles.statCell}>
            <Text style={styles.statLabel}>Credit</Text>
            {'\n'}
            <Text style={styles.statVal}>{stats.credit || '—'}</Text>
          </Text>
          <Text style={styles.statCell}>
            <Text style={styles.statLabel}>TAFB</Text>
            {'\n'}
            <Text style={styles.statVal}>{stats.tafb || '—'}</Text>
          </Text>
          <Text style={styles.statCell}>
            <Text style={styles.statLabel}>YTD</Text>
            {'\n'}
            <Text style={styles.statVal}>{stats.ytd || '—'}</Text>
          </Text>
          <Text style={styles.statCell}>
            <Text style={styles.statLabel}>Days off</Text>
            {'\n'}
            <Text style={styles.statVal}>{stats.daysOff}</Text>
          </Text>
        </View>
      </View>

      {pairings.map((p) => {
        const layovers = [
          ...new Set(p.legs.map((l) => l.layoverCity).filter(Boolean)),
        ] as string[];
        return (
          <View key={p.id} style={styles.pairingCard}>
            <Text style={styles.pairingId}>
              {p.id} · {p.startDate} → {p.endDate}
            </Text>
            <Text style={styles.line}>Report: {p.baseReport || '—'}</Text>
            {layovers.length > 0 ? (
              <Text style={styles.line}>Layovers: {layovers.join(', ')}</Text>
            ) : null}
            <Text style={styles.line}>
              Block {p.totalBlock} · Credit {p.totalCredit} · TAFB {p.tafb}
            </Text>
            <View style={styles.legsBlock}>
              {p.legs.map((leg, i) => (
                <Text key={`${p.id}-${i}`} style={styles.legLine}>
                  {formatLegLine(leg)}
                  {leg.isDeadhead ? ' · DH' : ''}
                </Text>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 17, fontWeight: '800', color: T.text, marginBottom: 4 },
  meta: { fontSize: 12, color: T.textSecondary, marginBottom: 10 },
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  statsTitle: { fontSize: 13, fontWeight: '700', color: T.text, marginBottom: 8 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCell: { minWidth: '18%', flexGrow: 1 },
  statLabel: { fontSize: 10, fontWeight: '600', color: T.textSecondary, textTransform: 'uppercase' },
  statVal: { fontSize: 14, fontWeight: '700', color: T.text },
  pairingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  pairingId: { fontSize: 15, fontWeight: '800', color: T.text, marginBottom: 6 },
  line: { fontSize: 13, color: T.text, marginBottom: 4 },
  legsBlock: { marginTop: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: T.line },
  legLine: { fontSize: 12, fontFamily: 'Menlo', color: T.textSecondary, marginBottom: 3 },
});
