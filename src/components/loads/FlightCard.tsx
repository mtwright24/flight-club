import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../styles/theme';

interface FlightCardProps {
  flightNumber: string;
  route: string;
  departTime: string;
  arriveTime: string;
  duration: string;
  reportCount: number;
  onPress: () => void;
}

export const FlightCard: React.FC<FlightCardProps & { onPress: () => void }> = ({
  flightNumber,
  route,
  departTime,
  arriveTime,
  duration,
  reportCount,
  onPress,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.content}>
        <View style={styles.left}>
          <View style={styles.flightBadge}>
            <Text style={styles.flightBadgeText}>{flightNumber}</Text>
          </View>
        </View>

        <View style={styles.middle}>
          <Text style={styles.route}>{route}</Text>
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
    </View>
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
  pill: {
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontWeight: '600',
  },
});
