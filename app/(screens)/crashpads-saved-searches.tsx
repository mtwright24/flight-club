import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { deleteSavedSearch, fetchSavedSearches } from '../../src/lib/housing';
import { colors, radius, shadow, spacing } from '../../src/styles/theme';
import type { HousingSavedSearch } from '../../src/types/housing';

export default function SavedHousingSearchesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [items, setItems] = useState<HousingSavedSearch[]>([]);

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
          <View style={styles.emptyCard}>
            <Ionicons name="bookmark-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.emptyText}>You have no saved searches yet.</Text>
          </View>
        ) : (
          items.map((s: HousingSavedSearch) => (
            <View key={s.id} style={[styles.card, shadow.cardShadow]}>
              <Text style={styles.title}>
                {s.base_airport || 'Any Base'}{s.area ? ` / ${s.area}` : ''}
              </Text>
              <Text style={styles.meta}>
                {s.housing_type ? `${s.housing_type} • ` : ''}
                {s.min_price || s.max_price ? `$${s.min_price || 0}-$${s.max_price || '—'}` : 'Any Price'}
              </Text>
              <View style={styles.actionsRow}>
                <Pressable
                  style={styles.actionButton}
                  onPress={() =>
                    router.push({
                      pathname: '/(screens)/crashpads',
                      params: {
                        base: s.base_airport || undefined,
                        area: s.area || undefined,
                        min: typeof s.min_price === 'number' ? String(s.min_price) : undefined,
                        max: typeof s.max_price === 'number' ? String(s.max_price) : undefined,
                        type: s.housing_type || undefined,
                        bed: s.bed_type || undefined,
                        hot: s.available_tonight ? '1' : '0',
                      },
                    })
                  }
                >
                  <Text style={styles.actionButtonText}>View</Text>
                </Pressable>
                <Pressable style={styles.actionButtonOutline} onPress={() => handleDelete(s.id)}>
                  <Text style={styles.actionButtonOutlineText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.bottomActions}>
        <Pressable style={styles.bottomPrimary} onPress={() => router.push('/(screens)/crashpads-filter')}>
          <Text style={styles.bottomPrimaryText}>SAVE SEARCH</Text>
        </Pressable>
        <Pressable style={styles.bottomSecondary} onPress={() => router.push('/(screens)/crashpads-post-need')}>
          <Text style={styles.bottomSecondaryText}>POST NEED</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  actionButtonOutline: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.cardBg,
  },
  actionButtonOutlineText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  bottomActions: {
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    gap: 8,
  },
  bottomPrimary: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    backgroundColor: colors.cardBg,
  },
  bottomPrimaryText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  bottomSecondary: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  bottomSecondaryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
});
