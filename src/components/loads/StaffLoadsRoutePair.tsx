import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Size = 'sm' | 'md' | 'lg';

/**
 * Aviation-forward route line: origin · small flight path · destination (not a plain “→” in body text).
 */
export function StaffLoadsRoutePair({
  from,
  to,
  size = 'md',
  muted = false,
}: {
  from: string;
  to: string;
  size?: Size;
  /** Softer secondary use (meta lines). */
  muted?: boolean;
}) {
  const fs = size === 'lg' ? 18 : size === 'md' ? 16 : 13;
  const plane = size === 'lg' ? 15 : size === 'md' ? 13 : 11;
  const lineW = size === 'sm' ? 10 : 14;
  return (
    <View style={styles.row}>
      <Text style={[styles.code, { fontSize: fs }, muted && styles.codeMuted]} numberOfLines={1}>
        {(from || '—').trim().toUpperCase()}
      </Text>
      <View style={styles.dividerWrap}>
        <View style={[styles.line, { width: lineW }, muted && styles.lineMuted]} />
        <Ionicons name="airplane" size={plane} color={muted ? '#cbd5e1' : '#94a3b8'} style={styles.plane} />
        <View style={[styles.line, { width: lineW }, muted && styles.lineMuted]} />
      </View>
      <Text style={[styles.code, { fontSize: fs }, muted && styles.codeMuted]} numberOfLines={1}>
        {(to || '—').trim().toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'nowrap',
  },
  code: {
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.8,
    flexShrink: 0,
  },
  codeMuted: { color: '#475569', fontWeight: '800' },
  dividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  line: {
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: '#cbd5e1',
    borderRadius: 1,
  },
  lineMuted: { backgroundColor: '#e2e8f0' },
  plane: { marginHorizontal: 0 },
});
