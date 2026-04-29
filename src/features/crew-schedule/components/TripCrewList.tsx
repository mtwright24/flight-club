import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { scheduleTheme as T } from '../scheduleTheme';
import type { ScheduleCrewMember } from '../types';

type Props = {
  members: ScheduleCrewMember[];
  /** When set, only first N rows + optional footer */
  maxVisible?: number;
  title?: string;
  showTitle?: boolean;
};

export default function TripCrewList({ members, maxVisible, title = 'Crew', showTitle = true }: Props) {
  if (!members.length) return null;
  const cap = maxVisible ?? members.length;
  const shown = members.slice(0, cap);
  const more = members.length - shown.length;

  return (
    <View style={styles.wrap}>
      {showTitle ? <Text style={styles.title}>{title}</Text> : null}
      {shown.map((c, i) => (
        <View key={`${c.position}-${c.employeeId ?? ''}-${i}`} style={styles.line}>
          <Text style={styles.pos}>{c.position}</Text>
          <View style={styles.nameCol}>
            <Text style={styles.name} numberOfLines={2}>
              {c.name}
            </Text>
            {c.employeeId || c.roleLabel ? (
              <Text style={styles.meta} numberOfLines={1}>
                {[c.employeeId, c.roleLabel].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
      {more > 0 ? (
        <Text style={styles.more}>
          +{more} more in full trip
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  title: {
    fontSize: 11,
    fontWeight: '800',
    color: T.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 8,
  },
  pos: {
    fontSize: 12,
    fontWeight: '800',
    color: T.accent,
    minWidth: 28,
  },
  nameCol: { flex: 1 },
  name: { fontSize: 13, fontWeight: '600', color: T.text },
  meta: { fontSize: 11, fontWeight: '600', color: T.textSecondary, marginTop: 2 },
  more: { fontSize: 12, color: T.textSecondary, fontStyle: 'italic', marginTop: 2 },
});
