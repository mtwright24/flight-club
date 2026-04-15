import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { scheduleTheme as T } from '../scheduleTheme';
import type { TripDayViewModel } from '../tripDetailViewModel';

const NODE = 12;
/** Fixed column geometry so the timeline aligns with node centers */
const PILL_MIN_H = 58;
const PILL_NODE_GAP = 10;
const TRACK_SLOT_H = 28;
/** Top edge of 2px track so it runs through node centers */
const TRACK_LINE_TOP = PILL_MIN_H + PILL_NODE_GAP + TRACK_SLOT_H / 2 - 1;
/** Wider columns when scrolling so labels stay readable */
const COLUMN_SCROLL = 96;
const SCROLL_THRESHOLD = 6;

type Props = {
  days: TripDayViewModel[];
  selectedDayIndex: number;
  onSelectDay: (index: number) => void;
};

/**
 * Each day is one column: pill stacked above its timeline node (mockup alignment).
 * Track + red progress sit behind the nodes; columns share width so dots line up with labels.
 */
export default function TripDayTimelineNav({ days, selectedDayIndex, onSelectDay }: Props) {
  const [rowW, setRowW] = useState(0);
  const n = days.length;
  const needsScroll = n > SCROLL_THRESHOLD;

  const onRowLayout = (e: LayoutChangeEvent) => {
    setRowW(e.nativeEvent.layout.width);
  };

  const trackSpan = n <= 1 ? 0 : Math.max(0, rowW - rowW / n);
  const trackLeft = n <= 1 ? 0 : rowW / (2 * n);
  const redWidth =
    n <= 0 || rowW <= 0
      ? 0
      : n === 1
        ? 0
        : selectedDayIndex === 0
          ? Math.max(NODE + 4, trackSpan * 0.42)
          : (selectedDayIndex / (n - 1)) * trackSpan;

  const renderColumn = (d: TripDayViewModel, idx: number, columnStyle: object) => {
    const active = idx === selectedDayIndex;
    return (
      <Pressable
        key={d.dateIso}
        onPress={() => onSelectDay(idx)}
        style={[styles.column, columnStyle]}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${d.dayLabel}, ${d.dateIso}`}
      >
        <View style={[styles.pill, active && styles.pillActive]}>
          <Text style={[styles.pillText, active && styles.pillTextActive]}>{d.dayLabel}</Text>
          <Text style={[styles.pillSub, active && styles.pillSubActive]} numberOfLines={1}>
            {d.dateIso.slice(5)}
          </Text>
        </View>
        <View style={styles.trackSlot}>
          <View
            style={[
              styles.node,
              idx < selectedDayIndex && styles.nodePast,
              idx === selectedDayIndex && styles.nodeSelected,
            ]}
          />
        </View>
      </Pressable>
    );
  };

  const trackLayer =
    rowW > 0 && n > 1 ? (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View
          style={[
            styles.trackGray,
            {
              left: trackLeft,
              width: trackSpan,
              top: TRACK_LINE_TOP,
            },
          ]}
        />
        <View
          style={[
            styles.trackRed,
            {
              left: trackLeft,
              width: redWidth,
              top: TRACK_LINE_TOP,
            },
          ]}
        />
      </View>
    ) : null;

  return (
    <View style={styles.outer}>
      {needsScroll ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View
            style={[styles.rowScroll, { minWidth: n * COLUMN_SCROLL }]}
            onLayout={onRowLayout}
          >
            {trackLayer}
            {days.map((d, idx) =>
              renderColumn(d, idx, {
                width: COLUMN_SCROLL,
                paddingHorizontal: 4,
              })
            )}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.rowFill} onLayout={onRowLayout}>
          {trackLayer}
          {days.map((d, idx) => renderColumn(d, idx, { flex: 1 }))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  rowFill: {
    flexDirection: 'row',
    position: 'relative',
    minHeight: PILL_MIN_H + PILL_NODE_GAP + TRACK_SLOT_H,
    alignItems: 'flex-start',
  },
  rowScroll: {
    flexDirection: 'row',
    position: 'relative',
    minHeight: PILL_MIN_H + PILL_NODE_GAP + TRACK_SLOT_H,
    alignItems: 'flex-start',
  },
  scrollContent: {
    flexDirection: 'row',
    paddingRight: 8,
  },
  column: {
    alignItems: 'center',
  },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: T.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    minWidth: 76,
    minHeight: PILL_MIN_H,
    justifyContent: 'center',
    maxWidth: '100%',
    alignItems: 'center',
  },
  pillActive: {
    backgroundColor: T.accent,
    borderColor: T.accent,
    borderWidth: 1.5,
  },
  pillText: { fontSize: 13, fontWeight: '800', color: T.textSecondary },
  pillTextActive: { color: '#FFFFFF' },
  pillSub: { fontSize: 11, fontWeight: '600', color: T.textSecondary, marginTop: 2 },
  pillSubActive: { color: 'rgba(255,255,255,0.92)' },
  /** Space below pill before node; node sits on timeline */
  trackSlot: {
    marginTop: PILL_NODE_GAP,
    height: TRACK_SLOT_H,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  trackGray: {
    position: 'absolute',
    height: 2,
    backgroundColor: T.line,
    borderRadius: 1,
  },
  trackRed: {
    position: 'absolute',
    height: 2,
    backgroundColor: T.accent,
    borderRadius: 1,
    zIndex: 1,
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    backgroundColor: T.surface,
    borderWidth: 2,
    borderColor: T.line,
    zIndex: 2,
  },
  nodePast: {
    borderColor: T.accent,
    backgroundColor: '#FFFFFF',
  },
  nodeSelected: {
    backgroundColor: T.accent,
    borderColor: T.accent,
  },
});
