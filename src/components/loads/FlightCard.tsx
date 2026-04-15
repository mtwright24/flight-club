import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../styles/theme';

interface FlightCardProps {
  flightNumber: string;
  airline?: string;
  route: string;
  departTime: string;
  arriveTime: string;
  duration: string;
  reportCount: number;
  aircraft?: string | null;
  /** When set, card shows selection UI and calls onToggleSelect instead of navigating. */
  selectionMode?: boolean;
  selected?: boolean;
  prioritySelected?: boolean;
  onPress: () => void;
  onToggleSelect?: () => void;
  /** When selected in selection mode, long-press toggles priority for this flight. */
  onTogglePriority?: () => void;
}

export const FlightCard: React.FC<FlightCardProps> = ({
  flightNumber,
  airline,
  route,
  departTime,
  arriveTime,
  duration,
  reportCount,
  aircraft,
  selectionMode,
  selected,
  prioritySelected,
  onPress,
  onToggleSelect,
  onTogglePriority,
}) => {
  const onCardPress = () => {
    if (selectionMode && onToggleSelect) onToggleSelect();
    else onPress();
  };
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        selectionMode && selected && styles.cardSelected,
        selectionMode && prioritySelected && styles.cardPriority,
      ]}
      onPress={onCardPress}
      onLongPress={selectionMode && selected && onTogglePriority ? () => onTogglePriority() : undefined}
      delayLongPress={320}
      accessibilityRole="button"
      accessibilityLabel={`Flight ${flightNumber}, ${route}`}
      accessibilityState={selectionMode ? { selected: !!selected, disabled: false } : undefined}
    >
      <View style={styles.content}>
        <View style={styles.left}>
          {selectionMode ? (
            <View style={[styles.check, selected && styles.checkOn, prioritySelected && styles.checkPriority]}>
              <Text style={styles.checkMark}>{selected ? (prioritySelected ? '★' : '✓') : ''}</Text>
            </View>
          ) : null}
          <View style={styles.flightBadge}>
            {airline ? <Text style={styles.airlineTiny}>{airline}</Text> : null}
            <Text style={styles.flightBadgeText}>{flightNumber}</Text>
          </View>
        </View>

        <View style={styles.middle}>
          <Text style={styles.route}>{route}</Text>
          {aircraft ? <Text style={styles.ac}>{aircraft}</Text> : null}
          <View style={styles.timingRow}>
            <Text style={styles.time}>{departTime}</Text>
            <Text style={styles.duration}>{duration}</Text>
            <Text style={styles.time}>{arriveTime}</Text>
          </View>
        </View>

        <View style={styles.right}>
          {selectionMode && reportCount <= 0 ? (
            <View style={styles.selectHint}>
              <Text style={styles.selectHintTx}>Tap</Text>
            </View>
          ) : (
            <View style={styles.reportBadge}>
              <Text style={styles.reportCount}>{reportCount}</Text>
              <Text style={styles.reportLabel}>reports</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

interface LoadStatusPillProps {
  status: 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'FULL';
  size?: 'sm' | 'md' | 'lg';
}

export const LoadStatusPill: React.FC<LoadStatusPillProps> = ({ status, size = 'md' }) => {
  const statusColors: Record<string, { bg: string; text: string }> = {
    LIGHT: { bg: '#d4edda', text: '#155724' },
    MEDIUM: { bg: '#fff3cd', text: '#856404' },
    HEAVY: { bg: '#f8d7da', text: '#721c24' },
    FULL: { bg: colors.headerRed, text: '#fff' },
  };

  const labels: Record<string, string> = {
    LIGHT: 'Light',
    MEDIUM: 'Medium',
    HEAVY: 'Heavy',
    FULL: 'Full',
  };

  const sizeStyles = {
    sm: { paddingHorizontal: 8, paddingVertical: 4 },
    md: { paddingHorizontal: 12, paddingVertical: 6 },
    lg: { paddingHorizontal: 16, paddingVertical: 8 },
  };

  const fontSizes = {
    sm: 12,
    md: 13,
    lg: 14,
  };

  const color = statusColors[status];

  return (
    <View
      style={[
        styles.pill,
        sizeStyles[size],
        { backgroundColor: color.bg },
      ]}
    >
      <Text style={[styles.pillText, { color: color.text, fontSize: fontSizes[size] }]}>
        {labels[status]}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardSelected: { borderColor: colors.headerRed, borderWidth: 2, backgroundColor: '#fff8f8' },
  cardPriority: { borderColor: '#B8860B', backgroundColor: '#fffdf5' },
  cardPressed: {
    opacity: 0.92,
    backgroundColor: '#fafafa',
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkOn: { borderColor: colors.headerRed, backgroundColor: colors.headerRed },
  checkPriority: { borderColor: '#B8860B', backgroundColor: '#B8860B' },
  checkMark: { color: '#fff', fontWeight: '900', fontSize: 14 },
  airlineTiny: { fontSize: 9, fontWeight: '800', color: '#666', marginBottom: 2 },
  ac: { fontSize: 11, color: '#888', marginBottom: 4 },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  left: {
    justifyContent: 'center',
    marginRight: 12,
  },
  flightBadge: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  flightBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  middle: {
    flex: 1,
  },
  route: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  timingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  time: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  duration: {
    fontSize: 12,
    color: '#999',
  },
  right: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  reportBadge: {
    alignItems: 'center',
  },
  reportCount: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.headerRed,
  },
  reportLabel: {
    fontSize: 10,
    color: '#999',
    marginTop: 1,
  },
  selectHint: { alignItems: 'center', justifyContent: 'center', minWidth: 44 },
  selectHintTx: { fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' },
  pill: {
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontWeight: '600',
  },
});
