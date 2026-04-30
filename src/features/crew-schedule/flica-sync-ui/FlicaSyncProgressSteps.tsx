import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../../styles/theme';

export type FlicaSyncProgressPhase = 'signin' | 'verify' | 'import';

const STEPS: { key: FlicaSyncProgressPhase; label: string }[] = [
  { key: 'signin', label: 'Sign In' },
  { key: 'verify', label: 'Verify' },
  { key: 'import', label: 'Import Schedule' },
];

type Props = { phase: FlicaSyncProgressPhase; compact?: boolean; stepStyle?: 'default' | 'importMockup' };

export default function FlicaSyncProgressSteps({ phase, compact, stepStyle = 'default' }: Props) {
  const idx = STEPS.findIndex((s) => s.key === phase);
  const bubbleSize = compact ? 24 : 28;
  const bubbleRadius = compact ? 12 : 14;
  const railTop = compact ? 11 : 13;
  const importDone = stepStyle === 'importMockup';
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <View pointerEvents="none" style={[styles.rail, importDone && styles.railImport, { top: railTop }]} />
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <View key={s.key} style={styles.col}>
            <View style={[styles.bubbleSlot, importDone && styles.bubbleSlotImport]}>
              <View
                style={[
                  styles.bubble,
                  { width: bubbleSize, height: bubbleSize, borderRadius: bubbleRadius },
                  !done && !active && !importDone && styles.bubbleIdle,
                  done && !importDone && styles.bubbleDone,
                  done && importDone && styles.bubbleDoneOutlined,
                  active && styles.bubbleActive,
                ]}
              >
                {done ? (
                  <Ionicons
                    name="checkmark"
                    size={compact ? 12 : 14}
                    color={importDone ? '#9CA3AF' : '#fff'}
                  />
                ) : (
                  <Text style={[styles.num, active && styles.numOn]}>{i + 1}</Text>
                )}
              </View>
            </View>
            <Text
              style={[
                styles.lbl,
                compact && styles.lblCompact,
                importDone && done && styles.lblDoneSoft,
                importDone && active && styles.lblActiveRed,
                !importDone && (done || active) && styles.lblOn,
              ]}
              numberOfLines={1}
            >
              {s.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    position: 'relative',
  },
  rowCompact: { paddingVertical: 6 },
  rail: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.line + 'CC',
  },
  railImport: {
    backgroundColor: '#D1D5DB',
  },
  col: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  bubbleSlot: {
    marginBottom: 4,
    backgroundColor: COLORS.card,
    paddingHorizontal: 2,
    borderRadius: 99,
  },
  bubbleSlotImport: {
    backgroundColor: 'transparent',
  },
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleIdle: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  bubbleActive: { backgroundColor: COLORS.red, borderWidth: 0 },
  bubbleDone: { backgroundColor: COLORS.red },
  bubbleDoneOutlined: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  num: { fontSize: 10, fontWeight: '800', color: COLORS.text2 },
  numOn: { color: '#fff' },
  lbl: { fontSize: 9, fontWeight: '600', color: COLORS.text2, textAlign: 'center', lineHeight: 12 },
  lblCompact: { fontSize: 9, lineHeight: 11 },
  lblOn: { color: COLORS.navy, fontWeight: '800' },
  lblDoneSoft: { color: COLORS.text2, fontWeight: '600' },
  lblActiveRed: { color: COLORS.red, fontWeight: '800' },
});
