import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../styles/theme';
import { StaffLoadsCardShell } from './StaffLoadsRequestPresentation';
import { StaffLoadsTileInner } from './StaffLoadsTileInner';
import { formatStaffLoadsEdgeUntilDeparture } from './staffLoadsDisplay';

/** Search / staff variant: same layout as active request tiles (StaffTraveler-style). */
export type StaffLoadsStaffFlightMeta = {
  airlineCode: string;
  flightNumber: string | null;
  from: string;
  to: string;
  travelDate: string;
  departAt: string;
  arriveAt: string;
  aircraft: string | null;
  flightId: string;
};

interface FlightCardProps {
  /** Legacy list layout only (ignored when `staffMeta` is set). */
  flightNumber?: string;
  airline?: string;
  route?: string;
  departTime?: string;
  arriveTime?: string;
  duration?: string;
  reportCount?: number;
  aircraft?: string | null;
  travelDateLabel?: string;
  selectionMode?: boolean;
  selected?: boolean;
  prioritySelected?: boolean;
  onPress: () => void;
  onToggleSelect?: () => void;
  onTogglePriority?: () => void;
  variant?: 'staff' | 'legacy';
  /** Staff Loads search tiles — same body as active request cards. */
  staffMeta?: StaffLoadsStaffFlightMeta;
}

export const FlightCard: React.FC<FlightCardProps> = ({
  flightNumber = '',
  airline,
  route = '',
  departTime = '',
  arriveTime = '',
  duration = '',
  reportCount = 0,
  aircraft,
  travelDateLabel,
  selectionMode,
  selected,
  prioritySelected,
  onPress,
  onToggleSelect,
  onTogglePriority,
  variant = 'legacy',
  staffMeta,
}) => {
  const staff = variant === 'staff';

  const stripColor = !staff
    ? 'transparent'
    : !selectionMode
      ? '#cbd5e1'
      : selected
        ? prioritySelected
          ? '#ca8a04'
          : colors.headerRed
        : '#cbd5e1';

  const onCardPress = () => {
    if (selectionMode && onToggleSelect) onToggleSelect();
    else onPress();
  };

  const onLongPress = () => {
    if (!selectionMode || !onTogglePriority) return;
    if (selected) onTogglePriority();
  };

  if (staff && staffMeta) {
    const depStamp = formatStaffLoadsEdgeUntilDeparture(staffMeta.departAt);
    return (
      <View
        style={[
          styles.staffOuter,
          selectionMode && styles.staffOuterSelBase,
          selectionMode && selected && !prioritySelected && styles.staffOuterSelStd,
          selectionMode && selected && prioritySelected && styles.staffOuterSelPri,
          selectionMode && selected && !prioritySelected && styles.staffOuterSelFillStd,
          selectionMode && selected && prioritySelected && styles.staffOuterSelFillPri,
        ]}
      >
        <StaffLoadsCardShell accentColor={stripColor} style={styles.staffShellFlex} compact>
          <Pressable
            style={({ pressed }) => [styles.staffPress, pressed && styles.cardStaffPressed]}
            onPress={onCardPress}
            onLongPress={onLongPress}
            delayLongPress={380}
            accessibilityRole="button"
            accessibilityLabel={`Flight ${staffMeta.airlineCode} ${staffMeta.flightNumber || ''}, ${staffMeta.from} to ${staffMeta.to}`}
            accessibilityState={selectionMode ? { selected: !!selected } : undefined}
          >
            <StaffLoadsTileInner
              airlineCode={staffMeta.airlineCode}
              flightNumber={staffMeta.flightNumber}
              fromAirport={staffMeta.from}
              toAirport={staffMeta.to}
              travelDate={staffMeta.travelDate}
              departAt={staffMeta.departAt}
              arriveAt={staffMeta.arriveAt}
              aircraftType={staffMeta.aircraft}
              flightIdForPlaceholder={staffMeta.flightId}
              edgeTimestamp={depStamp || null}
            />
          </Pressable>
        </StaffLoadsCardShell>
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Flight ${flightNumber}, ${route}`}
    >
      <View style={styles.content}>
        <View style={styles.left}>
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
          <View style={styles.reportBadge}>
            <Text style={styles.reportCount}>{reportCount}</Text>
            <Text style={styles.reportLabel}>reports</Text>
          </View>
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
  staffOuter: {
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 20,
    overflow: 'visible',
  },
  /** Thin ring in selection mode — no layout jump; selected state swaps tint + border color */
  staffOuterSelBase: {
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  staffShellFlex: { flex: 1 },
  staffPress: { flex: 1 },
  staffOuterSelStd: {
    borderColor: 'rgba(181, 22, 30, 0.62)',
  },
  staffOuterSelPri: {
    borderColor: 'rgba(217, 119, 6, 0.62)',
  },
  staffOuterSelFillStd: {
    backgroundColor: 'rgba(181, 22, 30, 0.065)',
  },
  staffOuterSelFillPri: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  cardStaffPressed: {
    opacity: 0.96,
  },
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardPressed: {
    opacity: 0.92,
    backgroundColor: '#fafafa',
  },
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
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  flightBadgeText: {
    fontSize: 12,
    fontWeight: '800',
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
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  duration: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
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
  pill: {
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontWeight: '600',
  },
});
