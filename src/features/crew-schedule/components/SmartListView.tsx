import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CrewScheduleTrip } from '../types';
import { scheduleTheme as T } from '../scheduleTheme';
import TripQuickPreviewSheet from './TripQuickPreviewSheet';

type Props = {
  trips: CrewScheduleTrip[];
  onPressTrip: (trip: CrewScheduleTrip) => void;
  onPost?: (trip: CrewScheduleTrip) => void;
  onChat?: (trip: CrewScheduleTrip) => void;
  /** Open module Manage (replaces former hotel shortcut). */
  onManageSchedule?: () => void;
  onAlert?: (trip: CrewScheduleTrip) => void;
};

function formatRange(trip: CrewScheduleTrip): string {
  const a = new Date(trip.startDate + 'T12:00:00');
  const b = new Date(trip.endDate + 'T12:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (trip.startDate === trip.endDate) return a.toLocaleDateString(undefined, opts);
  return `${a.toLocaleDateString(undefined, opts)}–${b.toLocaleDateString(undefined, { day: 'numeric' })}`;
}

export default function SmartListView({ trips, onPressTrip, onPost, onChat, onManageSchedule, onAlert }: Props) {
  const [previewTrip, setPreviewTrip] = useState<CrewScheduleTrip | null>(null);
  const closePreview = useCallback(() => setPreviewTrip(null), []);
  const openFullFromPreview = useCallback(() => {
    const t = previewTrip;
    setPreviewTrip(null);
    if (t) onPressTrip(t);
  }, [previewTrip, onPressTrip]);

  return (
    <View style={styles.wrap}>
      {trips.map((trip) => {
        const leg = trip.legs[0];
        return (
          <View key={trip.id} style={styles.card}>
            <Pressable
              onPress={() => onPressTrip(trip)}
              onLongPress={() => setPreviewTrip(trip)}
              delayLongPress={420}
              style={({ pressed }) => [pressed && { opacity: 0.92 }]}
              accessibilityHint="Long press for a quick preview of trip details."
            >
              <Text style={styles.range}>{formatRange(trip)}</Text>
              <Text style={styles.route}>{trip.routeSummary}</Text>
              {trip.layoverCity ? (
                <Text style={styles.lay}>Layover: {trip.layoverCity}</Text>
              ) : null}
              {leg ? (
                <Text style={styles.times}>
                  Report {leg.reportLocal ?? '—'} • Release {leg.releaseLocal ?? '—'}
                </Text>
              ) : null}
              <Text style={styles.meta}>
                {trip.pairingCreditHours != null
                  ? `${trip.pairingCreditHours.toFixed(2)} CR`
                  : trip.creditHours != null
                    ? `${trip.creditHours} CR`
                    : '— CR'}{' '}
                • {trip.pairingCode}
              </Text>
            </Pressable>
            <View style={styles.actions}>
              <MiniAction icon="swap-horizontal" label="Post" onPress={() => onPost?.(trip)} />
              <MiniAction icon="chatbubbles-outline" label="Chat" onPress={() => onChat?.(trip)} />
              <MiniAction icon="options-outline" label="Manage" onPress={() => onManageSchedule?.()} />
              <MiniAction icon="alarm-outline" label="Alert" onPress={() => onAlert?.(trip)} />
            </View>
          </View>
        );
      })}
      <TripQuickPreviewSheet
        visible={previewTrip != null}
        trip={previewTrip}
        onClose={closePreview}
        onOpenFullTrip={openFullFromPreview}
      />
    </View>
  );
}

function MiniAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.mini} hitSlop={6}>
      <Ionicons name={icon} size={16} color={T.accent} />
      <Text style={styles.miniText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingBottom: 12 },
  card: {
    backgroundColor: T.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  range: { fontSize: 12, fontWeight: '800', color: T.textSecondary, marginBottom: 4 },
  route: { fontSize: 16, fontWeight: '800', color: T.text },
  lay: { fontSize: 13, color: T.text, marginTop: 4 },
  times: { fontSize: 12, color: T.textSecondary, marginTop: 6 },
  meta: { fontSize: 12, color: T.textSecondary, marginTop: 4 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.line,
  },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8 },
  miniText: { fontSize: 12, fontWeight: '700', color: T.accent },
});
