import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { upsertSavedSearch } from '../../src/lib/housing';
import { colors, radius, spacing } from '../../src/styles/theme';

type ChipOption = { key: string; label: string };

const CREW_RULES: ChipOption[] = [
  { key: 'women_only', label: 'Women only' },
  { key: 'crew_only', label: 'Crew only' },
];

const LIFESTYLE_TAGS: ChipOption[] = [
  { key: 'reserve_friendly', label: 'Reserve-friendly' },
  { key: 'quiet_hours', label: 'Quiet hours' },
  { key: 'party_friendly', label: 'Social / lively' },
];

const AMENITIES: ChipOption[] = [
  { key: 'washer_dryer', label: 'Washer / dryer' },
  { key: 'kitchen_access', label: 'Kitchen access' },
  { key: 'wifi', label: 'Fast Wi‑Fi' },
  { key: 'shuttle', label: 'Shuttle' },
];

export default function HousingFilterModalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [baseAirport, setBaseAirport] = useState(
    (typeof params.base === 'string' && params.base) || 'JFK',
  );
  const [area, setArea] = useState(typeof params.area === 'string' ? params.area : '');
  const [housingType, setHousingType] = useState(
    (typeof params.type === 'string' && params.type) || 'crashpad',
  );
  const [minPrice, setMinPrice] = useState(
    typeof params.min === 'string' ? params.min : '',
  );
  const [maxPrice, setMaxPrice] = useState(
    typeof params.max === 'string' ? params.max : '',
  );
  const [bedType, setBedType] = useState(
    typeof params.bed === 'string' ? params.bed : '',
  );
  const [availableTonight, setAvailableTonight] = useState(params.hot === '1');
  const [standbyOnly, setStandbyOnly] = useState(false);

  const [crewRules, setCrewRules] = useState([] as string[]);
  const [lifestyleTags, setLifestyleTags] = useState([] as string[]);
  const [amenities, setAmenities] = useState([] as string[]);

  const hasFilters = useMemo(
    () =>
      !!baseAirport ||
      !!area ||
      !!minPrice ||
      !!maxPrice ||
      !!bedType ||
      !!housingType ||
      availableTonight ||
      standbyOnly ||
      crewRules.length > 0 ||
      lifestyleTags.length > 0 ||
      amenities.length > 0,
    [
      amenities.length,
      area,
      availableTonight,
      baseAirport,
      bedType,
      crewRules.length,
      housingType,
      lifestyleTags.length,
      maxPrice,
      minPrice,
      standbyOnly,
    ],
  );

  const toggleFromList = (
    list: string[],
    setList: (next: string[]) => void,
    key: string,
  ) => {
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  };

  const handleShowResults = () => {
    const paramsOut: any = { hot: availableTonight ? '1' : '0' };
    if (baseAirport) paramsOut.base = baseAirport;
    if (area) paramsOut.area = area;
    if (minPrice) paramsOut.min = minPrice;
    if (maxPrice) paramsOut.max = maxPrice;
    if (bedType) paramsOut.bed = bedType;
    if (housingType) paramsOut.type = housingType;
    if (standbyOnly) paramsOut.standby = '1';
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
        crew_rules: crewRules,
        lifestyle_tags: lifestyleTags,
        amenities,
      },
      standby_only: standbyOnly,
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
    setStandbyOnly(false);
    setCrewRules([]);
    setLifestyleTags([]);
    setAmenities([]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlightClubHeader title="Filter" showLogo={false} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Base + Area */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Base</Text>
          <TextInput
            style={styles.input}
            value={baseAirport}
            onChangeText={setBaseAirport}
            placeholder="JFK, LGA, EWR, IAH, FLL..."
          />
          <Text style={[styles.sectionTitle, { marginTop: spacing.sm }]}>Area / Neighborhood</Text>
          <TextInput
            style={styles.input}
            value={area}
            onChangeText={setArea}
            placeholder="Jamaica, Queens / Houston near IAH..."
          />
        </View>

        {/* Housing Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Housing Type</Text>
          <View style={styles.chipRow}>
            {[
              { key: 'crashpad', label: 'Crashpad' },
              { key: 'room', label: 'Room' },
              { key: 'apartment', label: 'Apartment' },
              { key: 'short_term', label: 'Short-Term' },
            ].map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.chip, housingType === opt.key && styles.chipActive]}
                onPress={() => setHousingType(opt.key as any)}
              >
                <Text style={[styles.chipText, housingType === opt.key && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Price */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Range (USD)</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.inputHalf]}
              value={minPrice}
              onChangeText={setMinPrice}
              placeholder="Min"
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.input, styles.inputHalf]}
              value={maxPrice}
              onChangeText={setMaxPrice}
              placeholder="Max"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Bed Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bed Type</Text>
          <View style={styles.chipRow}>
            {[
              { key: '', label: 'Any' },
              { key: 'hot_bed', label: 'Hot Bed' },
              { key: 'cold_bed', label: 'Cold Bed' },
              { key: 'private_room', label: 'Private Room' },
            ].map((opt) => (
              <Pressable
                key={opt.key || 'any'}
                style={[styles.chip, bedType === opt.key && styles.chipActive]}
                onPress={() => setBedType(opt.key as any)}
              >
                <Text style={[styles.chipText, bedType === opt.key && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Availability */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Availability</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Available Tonight</Text>
            <Switch
              value={availableTonight}
              onValueChange={setAvailableTonight}
              trackColor={{ false: '#CBD5E1', true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Standby beds only</Text>
            <Switch
              value={standbyOnly}
              onValueChange={setStandbyOnly}
              trackColor={{ false: '#CBD5E1', true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Crew Rules */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Crew Rules</Text>
          <View style={styles.chipRow}>
            {CREW_RULES.map((opt) => (
              <Pressable
                key={opt.key}
                style={[
                  styles.chip,
                  crewRules.includes(opt.key) && styles.chipActive,
                ]}
                onPress={() => toggleFromList(crewRules, setCrewRules, opt.key)}
              >
                <Text
                  style={[
                    styles.chipText,
                    crewRules.includes(opt.key) && styles.chipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Lifestyle / Fit */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lifestyle / Fit</Text>
          <View style={styles.chipRow}>
            {LIFESTYLE_TAGS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[
                  styles.chip,
                  lifestyleTags.includes(opt.key) && styles.chipActive,
                ]}
                onPress={() => toggleFromList(lifestyleTags, setLifestyleTags, opt.key)}
              >
                <Text
                  style={[
                    styles.chipText,
                    lifestyleTags.includes(opt.key) && styles.chipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Amenities */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Amenities / Access</Text>
          <View style={styles.chipRow}>
            {AMENITIES.map((opt) => (
              <Pressable
                key={opt.key}
                style={[
                  styles.chip,
                  amenities.includes(opt.key) && styles.chipActive,
                ]}
                onPress={() => toggleFromList(amenities, setAmenities, opt.key)}
              >
                <Text
                  style={[
                    styles.chipText,
                    amenities.includes(opt.key) && styles.chipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          style={[styles.bottomSecondary, !hasFilters && { opacity: 0.5 }]}
          onPress={handleReset}
          disabled={!hasFilters}
        >
          <Text style={styles.bottomSecondaryText}>Reset</Text>
        </Pressable>
        <Pressable style={styles.bottomSecondary} onPress={handleSaveSearch}>
          <Text style={styles.bottomSecondaryText}>Save Search</Text>
        </Pressable>
        <Pressable style={styles.bottomPrimary} onPress={handleShowResults}>
          <Text style={styles.bottomPrimaryText}>Show Results</Text>
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
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  input: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  inputHalf: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  bottomBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    backgroundColor: colors.cardBg,
  },
  bottomSecondary: {
    flex: 1,
    marginRight: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  bottomPrimary: {
    flex: 1,
    marginLeft: 6,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  bottomSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  bottomPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
