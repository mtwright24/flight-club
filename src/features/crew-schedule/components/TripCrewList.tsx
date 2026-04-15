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
        <View key={`${c.position}-${i}`} style={styles.line}>
          <Text style={styles.pos}>{c.position}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {c.name}
          </Text>
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
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  pos: {
    fontSize: 12,
    fontWeight: '800',
    color: T.accent,
    minWidth: 28,
  },
  name: { flex: 1, fontSize: 13, fontWeight: '600', color: T.text },
  more: { fontSize: 12, color: T.textSecondary, fontStyle: 'italic', marginTop: 2 },
});
