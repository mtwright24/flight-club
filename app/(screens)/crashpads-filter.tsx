import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { upsertSavedSearch } from '../../src/lib/housing';
import { colors, radius, spacing } from '../../src/styles/theme';

type ChipOption = { key: string; label: string };

const BASES: ChipOption[] = [
  { key: 'JFK', label: 'JFK' },
  { key: 'LGA', label: 'LGA' },
  { key: 'EWR', label: 'EWR' },
];

const HOUSING_TYPES: ChipOption[] = [
  { key: 'crashpad', label: 'Crashpad' },
  { key: 'room', label: 'Room' },
  { key: 'apartment', label: 'Apartment' },
  { key: 'short_term', label: 'Short-Term Stay' },
];

const PREFS: ChipOption[] = [
  { key: 'women_only', label: 'Women only' },
  { key: 'men_only', label: 'Men only' },
  { key: 'coed', label: 'Coed' },
  { key: 'crew_only', label: 'Airline crew only' },
];

const AMENITIES: ChipOption[] = [
  { key: 'near_public_transit', label: 'Near public transit' },
  { key: 'airport_shuttle', label: 'Shuttle to airport' },
  { key: 'washer_dryer', label: 'Washer/dryer' },
  { key: 'kitchen_access', label: 'Kitchen access' },
];

export default function HousingFilterModalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [baseAirport, setBaseAirport] = useState((typeof params.base === 'string' && params.base) || 'JFK');
  const [area, setArea] = useState(typeof params.area === 'string' ? params.area : 'Jamaica');
  const [housingType, setHousingType] = useState((typeof params.type === 'string' && params.type) || 'crashpad');
  const [minPrice, setMinPrice] = useState(typeof params.min === 'string' ? params.min : '600');
  const [maxPrice, setMaxPrice] = useState(typeof params.max === 'string' ? params.max : '1200');
  const [bedType, setBedType] = useState(typeof params.bed === 'string' ? params.bed : '');
  const [availableTonight, setAvailableTonight] = useState(params.hot === '1');
  const [selectedPrefs, setSelectedPrefs] = useState<string[]>([]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);

  const hasFilters = useMemo(
    () =>
      !!baseAirport ||
      !!area ||
      !!minPrice ||
      !!maxPrice ||
      !!bedType ||
      !!housingType ||
      availableTonight ||
      selectedPrefs.length > 0 ||
      selectedAmenities.length > 0,
    [area, availableTonight, baseAirport, bedType, housingType, maxPrice, minPrice, selectedAmenities.length, selectedPrefs.length],
  );

  const toggleFromList = (list: string[], setList: (next: string[]) => void, key: string) => {
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  };

  const handleShowResults = () => {
    const paramsOut: Record<string, string> = { hot: availableTonight ? '1' : '0' };
    if (baseAirport) paramsOut.base = baseAirport;
    if (area) paramsOut.area = area;
    if (minPrice) paramsOut.min = minPrice;
    if (maxPrice) paramsOut.max = maxPrice;
    if (bedType) paramsOut.bed = bedType;
    if (housingType) paramsOut.type = housingType;
    router.push({ pathname: '/(screens)/crashpads', params: paramsOut });
  };

  const handleSaveSearch = async () => {
    if (!userId) return;
    await upsertSavedSearch({
      user_id: userId,
      base_airport: baseAirport,
      area: area || null,
      housing_type: (housingType as any) || null,
      min_price: minPrice ? Number(minPrice) : null,
      max_price: maxPrice ? Number(maxPrice) : null,
      bed_type: (bedType as any) || null,
      available_tonight: availableTonight,
      filters: {
        living_preferences: selectedPrefs,
        amenities: selectedAmenities,
      },
      alerts_enabled: true,
    } as any);
    router.push('/(screens)/crashpads-saved-searches');
  };

  const handleReset = () => {
    setBaseAirport('JFK');
    setArea('');
    setHousingType('crashpad');
    setMinPrice('');
    setMaxPrice('');
    setBedType('');
    setAvailableTonight(false);
    setSelectedPrefs([]);
    setSelectedAmenities([]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlightClubHeader title="Filter" showLogo={false} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Filter</Text>
            <Pressable disabled={!hasFilters} onPress={handleReset}>
              <Text style={[styles.resetText, !hasFilters && styles.resetDisabled]}>RESET</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Base</Text>
          <View style={styles.chipRow}>
            {BASES.map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.baseChip, baseAirport === opt.key && styles.baseChipActive]}
                onPress={() => setBaseAirport(opt.key)}
              >
                <Text style={[styles.baseChipText, baseAirport === opt.key && styles.baseChipTextActive]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Area</Text>
          <TextInput
            style={styles.input}
            value={area}
            onChangeText={setArea}
            placeholder="Jamaica, Queens..."
            placeholderTextColor="rgba(255,255,255,0.8)"
          />

          <Text style={styles.sectionTitle}>Housing Type</Text>
          <View style={styles.chipGrid}>
            {HOUSING_TYPES.map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.typeChip, housingType === opt.key && styles.typeChipActive]}
                onPress={() => setHousingType(opt.key)}
              >
                <Ionicons name="bed-outline" size={13} color={housingType === opt.key ? colors.primary : '#fff'} />
                <Text style={[styles.typeChipText, housingType === opt.key && styles.typeChipTextActive]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Price Range</Text>
          <View style={styles.priceRow}>
            <TextInput
              style={[styles.input, styles.priceInput]}
              value={minPrice}
              onChangeText={setMinPrice}
              keyboardType="numeric"
              placeholder="MINIMUM PRICE"
              placeholderTextColor="rgba(255,255,255,0.8)"
            />
            <TextInput
              style={[styles.input, styles.priceInput]}
              value={maxPrice}
              onChangeText={setMaxPrice}
              keyboardType="numeric"
              placeholder="MAX PRICE"
              placeholderTextColor="rgba(255,255,255,0.8)"
            />
          </View>

          <Text style={styles.sectionTitle}>Living preferences</Text>
          {PREFS.map((opt) => {
            const selected = selectedPrefs.includes(opt.key);
            return (
              <Pressable key={opt.key} style={styles.checkRow} onPress={() => toggleFromList(selectedPrefs, setSelectedPrefs, opt.key)}>
                <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={18} color="#fff" />
                <Text style={styles.checkRowText}>{opt.label}</Text>
              </Pressable>
            );
          })}

          {AMENITIES.map((opt) => {
            const selected = selectedAmenities.includes(opt.key);
            return (
              <Pressable key={opt.key} style={styles.checkRow} onPress={() => toggleFromList(selectedAmenities, setSelectedAmenities, opt.key)}>
                <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={18} color="#fff" />
                <Text style={styles.checkRowText}>{opt.label}</Text>
              </Pressable>
            );
          })}

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Hot bed tonight</Text>
            <Pressable onPress={() => setAvailableTonight((v) => !v)} style={[styles.togglePill, availableTonight && styles.togglePillActive]}>
              <Text style={[styles.togglePillText, availableTonight && styles.togglePillTextActive]}>
                {availableTonight ? 'On' : 'Off'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable style={styles.secondaryCta} onPress={handleSaveSearch}>
          <Text style={styles.secondaryCtaText}>SAVE SEARCH</Text>
        </Pressable>
        <Pressable style={styles.primaryCta} onPress={handleShowResults}>
          <Text style={styles.primaryCtaText}>SHOW CRASHPADS</Text>
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
  panel: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    padding: spacing.md,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  panelTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  resetText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  resetDisabled: {
    opacity: 0.5,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  baseChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  baseChipActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  baseChipText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  baseChipTextActive: {
    color: colors.primary,
  },
  input: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    color: '#fff',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeChipActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  typeChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  typeChipTextActive: {
    color: colors.primary,
  },
  priceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priceInput: {
    flex: 1,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  checkRowText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  togglePill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  togglePillActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  togglePillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  togglePillTextActive: {
    color: colors.primary,
  },
  bottomBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  secondaryCta: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    backgroundColor: colors.cardBg,
  },
  secondaryCtaText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  primaryCta: {
    flex: 1.3,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  primaryCtaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
});
