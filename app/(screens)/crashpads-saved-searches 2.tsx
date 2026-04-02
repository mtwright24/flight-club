import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { deleteSavedSearch, fetchSavedSearches } from '../../src/lib/housing';
import { colors, radius, spacing } from '../../src/styles/theme';
import type { HousingSavedSearch } from '../../src/types/housing';

export default function SavedHousingSearchesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [items, setItems] = useState([] as HousingSavedSearch[]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!userId) return;
      const data = await fetchSavedSearches(userId);
      if (!mounted) return;
      setItems(data);
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const handleDelete = async (id: string) => {
    await deleteSavedSearch(id);
    if (!userId) return;
    const data = await fetchSavedSearches(userId);
    setItems(data);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlightClubHeader title="Saved Searches" showLogo={false} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>You have no saved searches yet.</Text>
        ) : (
          items.map((s: HousingSavedSearch) => (
            <View key={s.id} style={styles.card}>
              <Text style={styles.title}>{s.base_airport} • {s.housing_type || 'Any type'}</Text>
              <Text style={styles.meta}>
                {s.bed_type || 'Any bed'}
                {s.min_price || s.max_price ? ` • $${s.min_price || 0}–$${s.max_price || '—'}` : ''}
              </Text>
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.label}>Alerts</Text>
                  <Switch value={s.alerts_enabled} onValueChange={() => {}} disabled />
                </View>
                <View style={styles.rowRight}>
                  <Pressable onPress={() => router.push('/(screens)/crashpads')}>
                    <Text style={styles.link}>View</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(s.id)}>
                    <Text style={[styles.link, { color: colors.dangerRed }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  link: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
});
