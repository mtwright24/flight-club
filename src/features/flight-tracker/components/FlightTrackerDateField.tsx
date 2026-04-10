import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { localCalendarDate } from '../flightDateLocal';
import { colors, radius, spacing } from '../../../styles/theme';

type Props = {
  /** YYYY-MM-DD */
  value: string;
  onChange: (next: string) => void;
  /** Tighter row for hub / inline toolbars */
  compact?: boolean;
};

function parseLocalNoon(iso: string): Date {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function FlightTrackerDateField({ value, onChange, compact }: Props) {
  const [show, setShow] = useState(false);
  const dateObj = useMemo(() => parseLocalNoon(value), [value]);

  const label = useMemo(() => {
    try {
      return parseLocalNoon(value).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return value;
    }
  }, [value]);

  return (
    <View>
      <Pressable
        style={[styles.row, compact && styles.rowCompact]}
        onPress={() => setShow(true)}
        accessibilityRole="button"
        accessibilityLabel={`Flight date ${label}`}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
        <Text style={styles.dateText} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.hint}>Change</Text>
      </Pressable>
      {show ? (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, d) => {
            if (Platform.OS === 'android') {
              setShow(false);
            }
            if (event.type === 'dismissed') return;
            if (d) onChange(localCalendarDate(d));
          }}
          style={Platform.OS === 'ios' ? styles.pickerIos : undefined}
          textColor={Platform.OS === 'ios' ? '#222' : undefined}
          themeVariant={Platform.OS === 'ios' ? 'light' : undefined}
        />
      ) : null}
      {Platform.OS === 'ios' && show ? (
        <Pressable style={styles.doneIos} onPress={() => setShow(false)} accessibilityRole="button">
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowCompact: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  dateText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  pickerIos: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
  },
  doneIos: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  doneText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.headerRed,
  },
});
