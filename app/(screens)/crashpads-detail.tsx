import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { fetchHousingListingById, fetchHousingListingPhotos } from '../../src/lib/housing';
import { sendMessage, startDirectConversation } from '../../src/lib/supabase/dms';
import { colors, radius, shadow, spacing } from '../../src/styles/theme';
import type { HousingListing, HousingListingPhoto } from '../../src/types/housing';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function CrashpadsDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { session } = useAuth();
  const meId = session?.user?.id ?? null;
  const { width: windowWidth } = useWindowDimensions();
  const id = params.id as string | undefined;
  const [item, setItem] = useState(null as HousingListing | null);
  const [photos, setPhotos] = useState([] as HousingListingPhoto[]);
  const [loading, setLoading] = useState(true);
  const [dmBusy, setDmBusy] = useState(false);

  const heroSlideWidth = useMemo(() => Math.max(0, windowWidth - spacing.lg * 2), [windowWidth]);

  const listingLine = useMemo(() => {
    if (!item) return '';
    const bits = [item.title, item.base_airport].filter(Boolean);
    return bits.join(' · ');
  }, [item]);

  const openDmWithHost = useCallback(
    async (initialMessage?: string) => {
      if (!item || dmBusy) return;
      if (!meId) {
        Alert.alert('Sign in required', 'Sign in to message the host about this listing.');
        return;
      }
      const hostId = (item.created_by || '').trim();
      if (!hostId || !UUID_RE.test(hostId)) {
        Alert.alert('Host unavailable', 'This listing does not have a linked host account yet.');
        return;
      }
      if (hostId === meId) {
        Alert.alert('Your listing', 'You are the host for this listing.');
        return;
      }
      setDmBusy(true);
      try {
        const { conversationId } = await startDirectConversation(meId, hostId);
        const convId = String(conversationId);
        const trimmed = typeof initialMessage === 'string' ? initialMessage.trim() : '';
        if (trimmed) {
          try {
            await sendMessage(convId, meId, trimmed);
          } catch {
            // Message-request flows (or other gates) may block the first send until accepted — still open the thread.
          }
        }
        router.push({ pathname: '/dm-thread', params: { conversationId: convId } });
      } catch (e: unknown) {
        const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Please try again.';
        Alert.alert('Unable to open messages', msg);
      } finally {
        setDmBusy(false);
      }
    },
    [dmBusy, item, meId, router]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const data = id ? await fetchHousingListingById(id) : null;
      const extraPhotos = id ? await fetchHousingListingPhotos(id) : [];
      if (!mounted) return;
      setItem(data);
      setPhotos(extraPhotos);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlightClubHeader title="Listing" showLogo={false} />
      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator />
        </View>
      ) : !item ? (
        <View style={styles.centerWrap}>
          <Text style={styles.emptyText}>Listing not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Image carousel */}
          <View style={[styles.hero, shadow.cardShadow]}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
            >
              {[item.cover_photo_url, ...photos.map((p: HousingListingPhoto) => p.photo_url)]
                .filter(Boolean)
                .map((uri, index) => (
                  <Image
                    key={index}
                    source={{ uri: uri as string }}
                    style={[styles.heroImage, { width: heroSlideWidth }]}
                  />
                ))}
            </ScrollView>
            <View style={styles.heroOverlayRow}>
              <View style={styles.heroBadgeRow}>
                <View
                  style={[
                    styles.heroBadge,
                    item.bed_type === 'hot_bed' && styles.heroBadgeHot,
                  ]}
                >
                  <Text style={styles.heroBadgeText}>
                    {item.bed_type === 'hot_bed'
                      ? 'HOT BED'
                      : item.bed_type === 'cold_bed'
                      ? 'COLD BED'
                      : 'PRIVATE ROOM'}
                  </Text>
                </View>
                  {item.available_tonight && item.standby_bed_allowed && (
                    <View style={[styles.heroBadge, styles.heroBadgeTonight]}>
                      <Text style={styles.heroBadgeText}>Standby tonight</Text>
                    </View>
                  )}
                  {item.available_tonight && !item.standby_bed_allowed && (
                    <View style={[styles.heroBadge, styles.heroBadgeTonight]}>
                      <Text style={styles.heroBadgeText}>Tonight</Text>
                    </View>
                  )}
              </View>
            </View>
            <View style={styles.heroPriceBlock}>
              <Text style={styles.heroTitle}>{item.title}</Text>
              <Text style={styles.heroSub}>
                {item.base_airport}
                {item.neighborhood ? ` • ${item.neighborhood}` : ''}
              </Text>
              <Text style={styles.heroPrice}>
                {item.price_type === 'per_trip' && item.price_per_trip
                  ? `$${item.price_per_trip}/trip`
                  : item.price_monthly
                  ? `$${item.price_monthly}/mo`
                  : item.price_nightly
                  ? `$${item.price_nightly}/night`
                  : 'See details'}
              </Text>
            </View>
          </View>

          <View style={styles.quickFacts}>
            <Text style={styles.sectionLabel}>Quick Facts</Text>
            <Text style={styles.factLine}>
              {item.bed_type === 'hot_bed'
                ? 'Hot Bed'
                : item.bed_type === 'cold_bed'
                ? 'Cold Bed'
                : 'Private Room'}
              {item.total_beds ? ` • ${item.total_beds} beds` : ''}
              {item.bathrooms ? ` • ${item.bathrooms} baths` : ''}
            </Text>
            {item.distance_to_airport_minutes && (
              <Text style={styles.factLine}>
                <Ionicons name="airplane-outline" size={14} color={colors.textSecondary} />{' '}
                {item.distance_to_airport_minutes} min to {item.base_airport}
              </Text>
            )}
            {item.available_tonight && (
              <Text style={styles.factHighlight}>
                {item.standby_bed_allowed ? 'Standby bed available tonight' : 'Available tonight'}
              </Text>
            )}
            {item.available_date && !item.available_tonight && (
              <Text style={styles.factLine}>Available {item.available_date}</Text>
            )}
            {item.standby_bed_allowed && item.standby_price && (
              <Text style={styles.factLine}>
                Standby rate: ${item.standby_price}
              </Text>
            )}
            {item.posting_as && (
              <Text style={styles.factLine}>
                Posted by{' '}
                {item.posting_as === 'pad_manager'
                  ? 'Pad Leader / Manager'
                  : item.posting_as === 'owner'
                    ? 'Crashpad Owner'
                    : item.posting_as.replace(/_/g, ' ')}
              </Text>
            )}
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Crew Rules</Text>
            {item.crew_rules ? (
              <View style={styles.tagsRow}>
                {Object.entries(item.crew_rules).map(([key, value]) =>
                  value ? (
                    <View key={key} style={styles.tagPill}>
                      <Text style={styles.tagText}>{key.replace(/_/g, ' ')}</Text>
                    </View>
                  ) : null
                )}
              </View>
            ) : (
              <Text style={styles.bodyText}>No crew rules listed yet.</Text>
            )}
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>About this place</Text>
            <Text style={styles.bodyText}>
              {item.description ||
                'Host has not added a detailed description yet. Ask a question to learn more about commute, house vibe, and rules.'}
            </Text>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Amenities</Text>
            {item.amenities ? (
              <View style={styles.tagsRow}>
                {Object.entries(item.amenities).map(([key, value]) =>
                  value ? (
                    <View key={key} style={styles.tagPill}>
                      <Text style={styles.tagText}>{key.replace(/_/g, ' ')}</Text>
                    </View>
                  ) : null
                )}
              </View>
            ) : (
              <Text style={styles.bodyText}>No amenities listed yet.</Text>
            )}
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Crew Fit</Text>
            {item.lifestyle_tags ? (
              <View style={styles.tagsRow}>
                {Object.entries(item.lifestyle_tags).map(([key, value]) =>
                  value ? (
                    <View key={key} style={styles.tagPill}>
                      <Text style={styles.tagText}>{key.replace(/_/g, ' ')}</Text>
                    </View>
                  ) : null
                )}
              </View>
            ) : (
              <Text style={styles.bodyText}>No lifestyle details yet.</Text>
            )}
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Host</Text>
            <Text style={styles.bodyText}>{item.host_name || 'Crew host'}</Text>
            {item.house_rules && <Text style={styles.bodyText}>{item.house_rules}</Text>}
          </View>

          <View style={styles.primaryActions}>
            <Pressable
              style={[styles.primaryBtn, dmBusy && styles.btnDisabled]}
              disabled={dmBusy}
              onPress={() =>
                openDmWithHost(
                  `Hi — I'm interested in requesting a spot for your Flight Club housing listing: ${listingLine}. When you have a moment, could you let me know if you still have availability? Thanks!`
                )
              }
            >
              <Text style={styles.primaryBtnText}>Request Spot</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, dmBusy && styles.btnDisabled]}
              disabled={dmBusy}
              onPress={() => openDmWithHost()}
            >
              <Text style={styles.secondaryBtnText}>Message Host</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.tertiaryBtn, dmBusy && styles.btnDisabled]}
            disabled={dmBusy}
            onPress={() =>
              openDmWithHost(
                `Hi — I have a question about your Flight Club housing listing: ${listingLine}.\n\n`
              )
            }
          >
            <Text style={styles.tertiaryBtnText}>Ask a Question</Text>
          </Pressable>
          {dmBusy ? (
            <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  emptyText: {
    color: colors.textSecondary,
  },
  hero: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  heroImage: {
    height: 240,
  },
  heroOverlayRow: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15,23,42,0.85)',
  },
  heroBadgeHot: {
    backgroundColor: 'rgba(181,22,30,0.95)',
  },
  heroBadgeTonight: {
    backgroundColor: 'rgba(15,23,42,0.85)',
  },
  heroBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  heroPriceBlock: {
    padding: spacing.md,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  heroPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },
  quickFacts: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionBlock: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  factLine: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  factHighlight: {
    marginTop: 4,
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
  },
  bodyText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.pillBg,
  },
  tagText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  primaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  primaryBtn: {
    flex: 1,
    marginRight: 6,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  secondaryBtn: {
    flex: 1,
    marginLeft: 6,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  tertiaryBtn: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tertiaryBtnText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.65,
  },
});
