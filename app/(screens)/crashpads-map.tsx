import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import {
  coordinateForBaseAirport,
  listingCoordinateJitter,
  regionForCoordinates,
} from '../../src/lib/airportCoordinates';
import {
  fetchHousingListings,
  fetchHousingNeedPosts,
  type HousingFilters,
  type HousingSort,
} from '../../src/lib/housing';
import { colors, radius, spacing } from '../../src/styles/theme';
import type { HousingListing, HousingNeedPost } from '../../src/types/housing';

type TabKey = 'crashpad' | 'room' | 'apartment' | 'wanted';

function parseTab(t: string | undefined): TabKey {
  if (t === 'room' || t === 'apartment' || t === 'wanted') return t;
  return 'crashpad';
}

function parseSort(s: string | undefined): HousingSort {
  if (s === 'price_low' || s === 'price_high' || s === 'newest') return s;
  return 'recommended';
}

function priceSnippet(item: HousingListing): string {
  if (item.price_monthly != null) return `$${item.price_monthly}/mo`;
  if (item.price_nightly != null) return `$${item.price_nightly}/night`;
  if (item.price_per_trip != null) return `$${item.price_per_trip}/trip`;
  return 'See listing';
}

export default function HousingMapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    base?: string;
    area?: string;
    type?: string;
    min?: string;
    max?: string;
    bed?: string;
    hot?: string;
    standby?: string;
    sort?: string;
  }>();

  const googleMapsKey =
    (Constants.expoConfig?.extra as { googleMapsApiKey?: string } | undefined)?.googleMapsApiKey || '';
  const useGoogleMaps = Platform.OS !== 'web' && !!googleMapsKey;

  const activeTab = useMemo(() => parseTab(typeof params.type === 'string' ? params.type : undefined), [params.type]);
  const filters: HousingFilters = useMemo(() => {
    const min = params.min ? Number(params.min) : undefined;
    const max = params.max ? Number(params.max) : undefined;
    return {
      base_airport: typeof params.base === 'string' && params.base ? params.base : undefined,
      housing_type:
        activeTab === 'room' ? 'room' : activeTab === 'apartment' ? 'apartment' : undefined,
      bed_type: typeof params.bed === 'string' && params.bed ? (params.bed as HousingFilters['bed_type']) : undefined,
      min_price: Number.isFinite(min) ? min : undefined,
      max_price: Number.isFinite(max) ? max : undefined,
      available_tonight: params.hot === '1' || undefined,
      standby_only: params.standby === '1' || undefined,
      sort: parseSort(typeof params.sort === 'string' ? params.sort : undefined),
    };
  }, [activeTab, params.base, params.bed, params.hot, params.max, params.min, params.sort, params.standby]);

  const [listings, setListings] = useState<HousingListing[]>([]);
  const [needs, setNeeds] = useState<HousingNeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'wanted') {
        const data = await fetchHousingNeedPosts({
          base_airport: filters.base_airport,
        });
        setNeeds(data);
        setListings([]);
      } else {
        const data = await fetchHousingListings(filters);
        setListings(data);
        setNeeds([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load listings');
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const listingMarkers = useMemo(() => {
    return listings.map((item) => {
      const base = coordinateForBaseAirport(item.base_airport);
      const j = listingCoordinateJitter(item.id);
      return {
        kind: 'listing' as const,
        id: item.id,
        title: item.title,
        subtitle: `${item.base_airport} · ${priceSnippet(item)}`,
        coordinate: { latitude: base.latitude + j.dLat, longitude: base.longitude + j.dLng },
      };
    });
  }, [listings]);

  const needMarkers = useMemo(() => {
    return needs.map((n) => {
      const base = coordinateForBaseAirport(n.base_airport);
      const j = listingCoordinateJitter(n.id);
      return {
        kind: 'need' as const,
        id: n.id,
        title: `Wanted: ${n.base_airport}`,
        subtitle: n.notes ? String(n.notes).slice(0, 80) : 'Crew need',
        coordinate: { latitude: base.latitude + j.dLat, longitude: base.longitude + j.dLng },
      };
    });
  }, [needs]);

  const markers = useMemo(() => [...listingMarkers, ...needMarkers], [listingMarkers, needMarkers]);

  const initialRegion = useMemo(
    () => regionForCoordinates(markers.map((m) => m.coordinate)),
    [markers]
  );

  const onMarkerPress = useCallback(
    (id: string, kind: 'listing' | 'need') => {
      if (kind === 'listing') {
        router.push({ pathname: '/(screens)/crashpads-detail', params: { id } });
      }
    },
    [router]
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.root}>
        <FlightClubHeader title="Map" showLogo={false} />
        <View style={styles.webFallback}>
          <Ionicons name="map-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.webTitle}>Map on mobile</Text>
          <Text style={styles.webBody}>
            Open Crashpads & housing in the Flight Club iOS or Android app for the interactive map.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlightClubHeader title="Map" showLogo={false} />
      {!googleMapsKey ? (
        <View style={styles.banner}>
          <Ionicons name="key-outline" size={18} color="#92400e" />
          <Text style={styles.bannerText}>
            Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY and rebuild the dev client for Google map tiles (Maps SDK).
          </Text>
        </View>
      ) : null}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryTx}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <MapView
          style={StyleSheet.absoluteFillObject}
          initialRegion={initialRegion}
          provider={useGoogleMaps ? PROVIDER_GOOGLE : undefined}
          showsUserLocation={false}
          showsMyLocationButton={false}
        >
          {markers.map((m) => (
            <Marker
              key={`${m.kind}-${m.id}`}
              coordinate={m.coordinate}
              pinColor={m.kind === 'need' ? '#f59e0b' : colors.primary}
              onCalloutPress={() => onMarkerPress(m.id, m.kind)}
            >
              <Callout>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle} numberOfLines={2}>
                    {m.title}
                  </Text>
                  <Text style={styles.calloutSub} numberOfLines={2}>
                    {m.subtitle}
                  </Text>
                  {m.kind === 'listing' ? (
                    <Text style={styles.calloutLink}>Tap to open listing</Text>
                  ) : (
                    <Text style={styles.calloutMuted}>Wanted — browse the Wanted tab for details.</Text>
                  )}
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
      )}
      <View style={styles.legend}>
        <Text style={styles.legendText}>
          {markers.length} pin{markers.length === 1 ? '' : 's'} · near base airport
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: '#fffbeb',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#fcd34d',
  },
  bannerText: { flex: 1, fontSize: 13, color: '#92400e', fontWeight: '600' },
  errorText: { color: colors.primary, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  retryBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryTx: { color: '#fff', fontWeight: '800' },
  legend: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600', textAlign: 'center' },
  callout: {
    minWidth: 200,
    maxWidth: 260,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calloutTitle: { fontWeight: '800', fontSize: 15, color: colors.textPrimary },
  calloutSub: { marginTop: 4, fontSize: 13, color: colors.textSecondary },
  calloutLink: { marginTop: 8, fontSize: 13, fontWeight: '800', color: colors.primary },
  calloutMuted: { marginTop: 8, fontSize: 12, color: colors.textSecondary },
  webFallback: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webTitle: { marginTop: 16, fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  webBody: { marginTop: 10, fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
