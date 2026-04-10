import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlightTrackerSubScreenShell } from '../../src/features/flight-tracker/components/FlightTrackerSubScreenShell';
import { useAuth } from '../../src/hooks/useAuth';
import { listScheduleFlightLinks, type ScheduleFlightLinkRow } from '../../src/features/flight-tracker/api/flightTrackerService';
import { colors, radius, spacing } from '../../src/styles/theme';

function statusLabel(s: string): string {
  switch (s) {
    case 'matched':
      return 'Synced';
    case 'not_found':
      return 'Not found';
    case 'pending':
      return 'Pending';
    case 'error':
      return 'Error';
    default:
      return s;
  }
}

export default function ScheduleSyncScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduleFlightLinkRow[]>([]);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listScheduleFlightLinks(userId);
      setRows(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to load schedule sync status.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FlightTrackerSubScreenShell title="Schedule Sync">
      <View style={styles.intro}>
        <Text style={styles.introTitle}>Crew schedule ↔ live flights</Text>
        <Text style={styles.introBody}>
          When schedule legs sync, we match them to live flight data from your configured provider. Rows below show Synced when a real flight was found, or Not found when the lookup returned no match.
        </Text>
        <Pressable style={styles.ctaOutline} onPress={() => router.push('/crew-schedule')}>
          <Text style={styles.ctaOutlineText}>Open Crew Schedule</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.err}>{error}</Text>
          <Pressable style={styles.cta} onPress={() => void load()}>
            <Text style={styles.ctaText}>Retry</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No sync rows yet</Text>
          <Text style={styles.emptyBody}>
            Sync runs when you view a trip with flight legs, or when schedule import includes flight numbers. Open a trip to generate links.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.code}>
                  {item.carrier_code} {item.flight_number}
                </Text>
                <View
                  style={[
                    styles.badge,
                    item.sync_status === 'matched' ? styles.badgeOk : styles.badgeMuted,
                  ]}
                >
                  <Text style={styles.badgeText}>{statusLabel(item.sync_status)}</Text>
                </View>
              </View>
              <Text style={styles.meta}>Date {item.flight_date}</Text>
              {item.sync_status === 'not_found' ? (
                <Text style={styles.meta}>Last lookup did not find a matching live flight for this leg.</Text>
              ) : item.sync_status === 'matched' && item.tracked_flight_id ? (
                <Text style={styles.meta}>Linked to a tracked flight for live updates.</Text>
              ) : null}
              {item.last_synced_at ? (
                <Text style={styles.metaSmall}>Updated {new Date(item.last_synced_at).toLocaleString()}</Text>
              ) : null}
            </View>
          )}
        />
      )}
    </FlightTrackerSubScreenShell>
  );
}

const styles = StyleSheet.create({
  intro: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  introTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  introBody: { color: colors.textSecondary, fontWeight: '600', fontSize: 13, marginTop: 6, lineHeight: 19 },
  ctaOutline: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ctaOutlineText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  emptyTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 16 },
  emptyBody: { color: colors.textSecondary, fontWeight: '600', fontSize: 13, marginTop: 6, textAlign: 'center' },
  err: { color: colors.error, fontWeight: '700', textAlign: 'center' },
  cta: { marginTop: 10, borderRadius: radius.md, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  meta: { marginTop: 4, color: colors.textSecondary, fontWeight: '600', fontSize: 12 },
  metaSmall: { marginTop: 2, color: colors.textSecondary, fontWeight: '600', fontSize: 11 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  badgeOk: { backgroundColor: '#DCFCE7' },
  badgeMuted: { backgroundColor: '#F1F5F9' },
  badgeText: { fontWeight: '800', fontSize: 10 },
});
