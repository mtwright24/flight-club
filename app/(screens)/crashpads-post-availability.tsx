import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { createHousingListing, insertHousingListingPhoto, updateHousingListingCoverPhoto } from '../../src/lib/housing';
import { pickHousingPhotos, takeHousingPhoto, uploadHousingPhoto, type LocalPhotoAsset } from '../../src/lib/uploadHousingMedia';
import { colors, radius, spacing } from '../../src/styles/theme';

export default function PostHousingAvailabilityScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [baseAirport, setBaseAirport] = useState('JFK');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [address, setAddress] = useState('');

  const [housingType, setHousingType] = useState('crashpad' as 'crashpad' | 'room' | 'apartment' | 'short_term');
  const [bedType, setBedType] = useState('hot_bed' as 'hot_bed' | 'cold_bed' | 'private_room');
  const [postingAs, setPostingAs] = useState('owner' as 'owner' | 'pad_manager' | 'roommate' | 'landlord' | 'on_behalf' | 'other');

  const [priceType, setPriceType] = useState('monthly' as 'monthly' | 'nightly' | 'per_trip');
  const [price, setPrice] = useState('');

  const [availableTonight, setAvailableTonight] = useState(false);
  const [availableNow, setAvailableNow] = useState(true);
  const [standbyAllowed, setStandbyAllowed] = useState(false);
  const [standbyPrice, setStandbyPrice] = useState('');
  const [availableDate, setAvailableDate] = useState('');
  const [bedsTonight, setBedsTonight] = useState('');
  const [minStay, setMinStay] = useState('');
  const [maxStay, setMaxStay] = useState('');

  const [totalBeds, setTotalBeds] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [distanceMinutes, setDistanceMinutes] = useState('');

  const [crewRules, setCrewRules] = useState([] as string[]);
  const [lifestyleTags, setLifestyleTags] = useState([] as string[]);
  const [amenities, setAmenities] = useState([] as string[]);

  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [photos, setPhotos] = useState([] as LocalPhotoAsset[]);

  const toggleFromList = (list: string[], setter: (next: string[]) => void, key: string) => {
    setter(list.includes(key) ? list.filter((k: string) => k !== key) : [...list, key]);
  };

  const handleAddFromLibrary = async () => {
    const picked = await pickHousingPhotos(8 - photos.length);
    if (picked.length) setPhotos((prev: LocalPhotoAsset[]) => [...prev, ...picked].slice(0, 8));
  };

  const handleAddFromCamera = async () => {
    const shot = await takeHousingPhoto();
    if (shot) setPhotos((prev: LocalPhotoAsset[]) => [shot, ...prev].slice(0, 8));
  };

  const handleSubmit = async () => {
    if (!userId || submitting) return;
    if (!baseAirport || !housingType || !bedType || !postingAs) return;

    setSubmitting(true);
    try {
      const crewRulesJson: Record<string, boolean> | null = crewRules.length
        ? crewRules.reduce((acc: Record<string, boolean>, key: string) => ({ ...acc, [key]: true }), {} as Record<string, boolean>)
        : null;
      const lifestyleJson: Record<string, boolean> | null = lifestyleTags.length
        ? lifestyleTags.reduce((acc: Record<string, boolean>, key: string) => ({ ...acc, [key]: true }), {} as Record<string, boolean>)
        : null;
      const amenitiesJson: Record<string, boolean> | null = amenities.length
        ? amenities.reduce((acc: Record<string, boolean>, key: string) => ({ ...acc, [key]: true }), {} as Record<string, boolean>)
        : null;

      const priceNumber = price ? Number(price) : null;
      const standbyNumber = standbyPrice ? Number(standbyPrice) : null;

      const listing = await createHousingListing({
        created_by: userId,
        title: `${baseAirport} ${housingType === 'crashpad' ? 'Crashpad' : housingType === 'room' ? 'Room' : housingType === 'apartment' ? 'Apartment' : 'Stay'} – ${area || city || 'Crew housing'}`,
        housing_type: housingType,
        base_airport: baseAirport,
        neighborhood: area || null,
        city: city || null,
        state: stateCode || null,
        address_line1: address || null,
        price_type: priceType,
        price_monthly: priceType === 'monthly' ? priceNumber : null,
        price_nightly: priceType === 'nightly' ? priceNumber : null,
        price_per_trip: priceType === 'per_trip' ? priceNumber : null,
        bed_type: bedType,
        posting_as: postingAs,
        available_tonight: availableTonight,
        standby_bed_allowed: standbyAllowed,
        standby_price: standbyNumber,
        available_now: availableNow,
        available_date: availableDate || null,
        beds_available_tonight: bedsTonight ? Number(bedsTonight) : null,
        total_beds: totalBeds ? Number(totalBeds) : null,
        bathrooms: bathrooms ? Number(bathrooms) : null,
        distance_to_airport_minutes: distanceMinutes ? Number(distanceMinutes) : null,
        crew_rules: crewRulesJson,
        amenities: amenitiesJson,
        lifestyle_tags: lifestyleJson,
        description: description || null,
        house_rules: null,
      });

      if (listing && photos.length) {
        for (let i = 0; i < photos.length; i++) {
          const asset = photos[i];
          const url = await uploadHousingPhoto(listing.id, asset, i);
          if (!url) continue;
          if (i === 0) {
            await updateHousingListingCoverPhoto(listing.id, url);
          } else {
            await insertHousingListingPhoto({ listing_id: listing.id, photo_url: url, sort_order: i });
          }
        }
      }

      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlightClubHeader title="Post Housing Availability" showLogo={false} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.helper}>
          Share a crashpad, crew room, or apartment you have available. Photos and clear rules help crew quickly understand if it''s a fit.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Location</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Base / Airport</Text>
            <TextInput
              value={baseAirport}
              onChangeText={setBaseAirport}
              style={styles.input}
              placeholder="JFK, LGA, EWR, IAH, FLL..."
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Area / Neighborhood</Text>
            <TextInput
              value={area}
              onChangeText={setArea}
              style={styles.input}
              placeholder="Jamaica, Queens / near IAH..."
            />
          </View>
          <View style={styles.row}>
            <View style={[styles.fieldGroup, styles.rowHalf]}>
              <Text style={styles.label}>City</Text>
              <TextInput
                value={city}
                onChangeText={setCity}
                style={styles.input}
                placeholder="New York"
              />
            </View>
            <View style={[styles.fieldGroup, styles.rowHalf]}>
              <Text style={styles.label}>State</Text>
              <TextInput
                value={stateCode}
                onChangeText={setStateCode}
                style={styles.input}
                placeholder="NY"
                maxLength={2}
              />
            </View>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Address or general area (optional)</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              style={styles.input}
              placeholder="Street or cross streets (optional)"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Listing basics</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Listing Type</Text>
            <View style={styles.chipRow}>
              {[
                { key: 'crashpad', label: 'Crashpad' },
                { key: 'room', label: 'Room' },
                { key: 'apartment', label: 'Apartment' },
                { key: 'short_term', label: 'Short-Term Stay' },
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

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Bed Type</Text>
            <View style={styles.chipRow}>
              {[
                { key: 'hot_bed', label: 'Hot Bed' },
                { key: 'cold_bed', label: 'Cold Bed' },
                { key: 'private_room', label: 'Private Room' },
              ].map((opt) => (
                <Pressable
                  key={opt.key}
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

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Posting As</Text>
            <View style={styles.chipRow}>
              {[
                { key: 'owner', label: 'Crashpad Owner' },
                { key: 'pad_manager', label: 'Pad Leader / Manager' },
                { key: 'roommate', label: 'Current Roommate' },
                { key: 'landlord', label: 'Landlord / Property Manager' },
                { key: 'on_behalf', label: 'Posting for Someone Else' },
                { key: 'other', label: 'Other' },
              ].map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[styles.chip, postingAs === opt.key && styles.chipActive]}
                  onPress={() => setPostingAs(opt.key as any)}
                >
                  <Text style={[styles.chipText, postingAs === opt.key && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pricing</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Price Type</Text>
            <View style={styles.chipRow}>
              {[
                { key: 'monthly', label: 'Monthly' },
                { key: 'nightly', label: 'Nightly' },
                { key: 'per_trip', label: 'Per Trip' },
              ].map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[styles.chip, priceType === opt.key && styles.chipActive]}
                  onPress={() => setPriceType(opt.key as any)}
                >
                  <Text style={[styles.chipText, priceType === opt.key && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Price</Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              style={styles.input}
              keyboardType="numeric"
              placeholder={priceType === 'nightly' ? 'e.g. 45' : 'e.g. 425'}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Availability</Text>
          <View style={styles.switchRow}>
            <Text style={styles.label}>Available Tonight</Text>
            <Switch
              value={availableTonight}
              onValueChange={setAvailableTonight}
              trackColor={{ false: '#CBD5E1', true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>Available Now</Text>
            <Switch
              value={availableNow}
              onValueChange={setAvailableNow}
              trackColor={{ false: '#CBD5E1', true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>Standby Bed Allowed</Text>
            <Switch
              value={standbyAllowed}
              onValueChange={setStandbyAllowed}
              trackColor={{ false: '#CBD5E1', true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Standby Price (optional)</Text>
            <TextInput
              value={standbyPrice}
              onChangeText={setStandbyPrice}
              style={styles.input}
              keyboardType="numeric"
              placeholder="e.g. 35"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Available Date (optional)</Text>
            <TextInput
              value={availableDate}
              onChangeText={setAvailableDate}
              style={styles.input}
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={styles.row}>
            <View style={[styles.fieldGroup, styles.rowHalf]}>
              <Text style={styles.label}>Beds open tonight (optional)</Text>
              <TextInput
                value={bedsTonight}
                onChangeText={setBedsTonight}
                style={styles.input}
                keyboardType="numeric"
                placeholder="e.g. 2"
              />
            </View>
            <View style={[styles.fieldGroup, styles.rowHalf]}>
              <Text style={styles.label}>Min stay (nights)</Text>
              <TextInput
                value={minStay}
                onChangeText={setMinStay}
                style={styles.input}
                keyboardType="numeric"
                placeholder="optional"
              />
            </View>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Max stay (nights, optional)</Text>
            <TextInput
              value={maxStay}
              onChangeText={setMaxStay}
              style={styles.input}
              keyboardType="numeric"
              placeholder="optional"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Property details</Text>
          <View style={styles.row}>
            <View style={[styles.fieldGroup, styles.rowHalf]}>
              <Text style={styles.label}>Total beds</Text>
              <TextInput
                value={totalBeds}
                onChangeText={setTotalBeds}
                style={styles.input}
                keyboardType="numeric"
                placeholder="e.g. 6"
              />
            </View>
            <View style={[styles.fieldGroup, styles.rowHalf]}>
              <Text style={styles.label}>Bathrooms (optional)</Text>
              <TextInput
                value={bathrooms}
                onChangeText={setBathrooms}
                style={styles.input}
                keyboardType="numeric"
                placeholder="e.g. 2"
              />
            </View>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Distance to airport (minutes)</Text>
            <TextInput
              value={distanceMinutes}
              onChangeText={setDistanceMinutes}
              style={styles.input}
              keyboardType="numeric"
              placeholder="e.g. 10"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Crew rules</Text>
          <View style={styles.chipRow}>
            {[
              { key: 'women_only', label: 'Women Only' },
              { key: 'men_only', label: 'Men Only' },
              { key: 'crew_only', label: 'Crew Only' },
              { key: 'coed', label: 'Coed' },
            ].map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.chip, crewRules.includes(opt.key) && styles.chipActive]}
                onPress={() => toggleFromList(crewRules, setCrewRules, opt.key)}
              >
                <Text style={[styles.chipText, crewRules.includes(opt.key) && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Lifestyle / Fit</Text>
          <View style={styles.chipRow}>
            {[
              { key: 'reserve_friendly', label: 'Reserve-friendly' },
              { key: 'quiet_hours', label: 'Quiet hours' },
              { key: 'social_lively', label: 'Social / lively' },
            ].map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.chip, lifestyleTags.includes(opt.key) && styles.chipActive]}
                onPress={() => toggleFromList(lifestyleTags, setLifestyleTags, opt.key)}
              >
                <Text style={[styles.chipText, lifestyleTags.includes(opt.key) && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Amenities</Text>
          <View style={styles.chipRow}>
            {[
              { key: 'washer_dryer', label: 'Washer / Dryer' },
              { key: 'kitchen_access', label: 'Kitchen Access' },
              { key: 'wifi', label: 'Fast Wi-Fi' },
              { key: 'shuttle', label: 'Airport Shuttle' },
              { key: 'parking', label: 'Parking' },
            ].map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.chip, amenities.includes(opt.key) && styles.chipActive]}
                onPress={() => toggleFromList(amenities, setAmenities, opt.key)}
              >
                <Text style={[styles.chipText, amenities.includes(opt.key) && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Description</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Tell crew about this place</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              style={[styles.input, { height: 130, textAlignVertical: 'top' }]}
              multiline
              placeholder="Describe the crashpad, house rules, commute details, vibe, bed setup, and anything important for crew."
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Photos</Text>
          <View style={styles.photoActionsRow}>
            <Pressable style={styles.photoButton} onPress={handleAddFromLibrary}>
              <Text style={styles.photoButtonText}>Add from library</Text>
            </Pressable>
            <Pressable style={styles.photoButton} onPress={handleAddFromCamera}>
              <Text style={styles.photoButtonText}>Use camera</Text>
            </Pressable>
          </View>
          <Text style={styles.photoHelper}>Up to 8 photos. First photo becomes the main card image.</Text>
          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
              {photos.map((p: LocalPhotoAsset, idx: number) => (
                <View key={idx} style={styles.photoThumbWrap}>
                  <Image source={{ uri: p.uri }} style={styles.photoThumb} />
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          style={[styles.submitBtn, submitted && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting || !userId}
        >
          <Text style={styles.submitText}>
            {submitted ? 'Posted' : submitting ? 'Posting…' : 'Post Availability'}
          </Text>
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
  helper: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
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
    columnGap: 8,
  },
  rowHalf: {
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
    marginBottom: spacing.sm,
  },
  photoActionsRow: {
    flexDirection: 'row',
    columnGap: 8,
    marginBottom: spacing.sm,
  },
  photoButton: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    alignItems: 'center',
  },
  photoButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  photoHelper: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  photoThumbWrap: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginRight: 8,
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  bottomBar: {
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    backgroundColor: colors.cardBg,
  },
  submitBtn: {
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingVertical: 12,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
