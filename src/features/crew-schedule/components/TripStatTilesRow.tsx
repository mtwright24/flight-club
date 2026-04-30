import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { scheduleTheme as T } from '../scheduleTheme';
import type { TripStatTile } from '../tripDetailViewModel';

type Props = {
  tiles: TripStatTile[];
  /** Slightly tighter padding for bottom sheet */
  compact?: boolean;
  /** Tighter still (trip quick preview only). */
  dense?: boolean;
};

export default function TripStatTilesRow({ tiles, compact, dense }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, compact && styles.rowCompact, dense && styles.rowDense]}
    >
      {tiles.map((t) => (
        <View key={t.id} style={[styles.tile, compact && styles.tileCompact, dense && styles.tileDense]}>
          <Text style={[styles.tileLabel, dense && styles.tileLabelDense]}>{t.label}</Text>
          <Text style={[styles.tileValue, dense && styles.tileValueDense]} numberOfLines={1}>
            {t.value}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 4,
  },
  rowCompact: { paddingVertical: 2 },
  rowDense: { gap: 6, paddingVertical: 0 },
  tile: {
    minWidth: 76,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: T.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  tileCompact: {
    minWidth: 70,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  tileDense: {
    minWidth: 62,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  tileLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: T.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  tileValue: { fontSize: 14, fontWeight: '800', color: T.text },
  tileLabelDense: { fontSize: 9, marginBottom: 2, letterSpacing: 0.3 },
  tileValueDense: { fontSize: 12 },
});
