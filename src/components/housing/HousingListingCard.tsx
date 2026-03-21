import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../../styles/theme';
import type { HousingListing } from '../../types/housing';

interface Props {
  item: HousingListing;
  onPress: () => void;
  onToggleSave?: () => void;
  isSaved?: boolean;
}

function getBedLabel(type: string) {
  if (type === 'hot_bed') return 'Hot Bed';
  if (type === 'cold_bed') return 'Cold Bed';
  if (type === 'private_room') return 'Private Room';
  return type;
}

function getPostingAsLabel(value: string | null | undefined) {
  if (!value) return null;
  if (value === 'owner') return 'Crashpad Owner';
  if (value === 'pad_manager') return 'Pad Leader / Manager';
  if (value === 'roommate') return 'Current Roommate';
  if (value === 'landlord') return 'Landlord / Property Manager';
  if (value === 'on_behalf') return 'Posting for Someone Else';
  if (value === 'other') return 'Host';
  return value;
}

function mapTagLabel(key: string) {
  switch (key) {
    case 'women_only':
      return 'Women only';
    case 'men_only':
      return 'Men only';
    case 'crew_only':
      return 'Crew only';
    case 'coed':
      return 'Coed';
    case 'reserve_friendly':
      return 'Reserve-friendly';
    case 'quiet_hours':
      return 'Quiet hours';
    case 'social_lively':
      return 'Social / lively';
    case 'washer_dryer':
      return 'Washer / Dryer';
    case 'kitchen_access':
      return 'Kitchen access';
    case 'fast_wifi':
      return 'Fast Wi-Fi';
    case 'airport_shuttle':
      return 'Airport shuttle';
    case 'parking':
      return 'Parking';
    default:
      return key.replace(/_/g, ' ');
  }
}

export default function HousingListingCard({ item, onPress, onToggleSave, isSaved }: Props) {
  const bedLabel = getBedLabel(item.bed_type);
  const priceLabel =
    item.price_type === 'per_trip' && item.price_per_trip
      ? `$${item.price_per_trip}/trip`
      : item.price_monthly
      ? `$${item.price_monthly}/mo`
      : item.price_nightly
      ? `$${item.price_nightly}/night`
      : 'See details';
  const distanceLabel = item.distance_to_airport_minutes ? `${item.distance_to_airport_minutes} min to ${item.base_airport}` : item.base_airport;
  const postingAsLabel = getPostingAsLabel(item.posting_as);

  const combinedTags: string[] = [];
  if (item.crew_rules) {
    Object.entries(item.crew_rules).forEach(([key, val]) => {
      if (val && combinedTags.length < 4) combinedTags.push(mapTagLabel(key));
    });
  }
  if (item.lifestyle_tags && combinedTags.length < 4) {
    Object.entries(item.lifestyle_tags).forEach(([key, val]) => {
      if (val && combinedTags.length < 4) combinedTags.push(mapTagLabel(key));
    });
  }
  if (item.amenities && combinedTags.length < 4) {
    Object.entries(item.amenities).forEach(([key, val]) => {
      if (val && combinedTags.length < 4) combinedTags.push(mapTagLabel(key));
    });
  }

  return (
    <Pressable onPress={onPress} style={[styles.card, shadow.cardShadow]}>
      <ImageBackground
        source={{ uri: item.cover_photo_url || 'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=1200&q=80' }}
        style={styles.image}
        imageStyle={styles.imageInner}
      >
        <View style={styles.imageTopRow}>
          <View style={styles.badgeRow}>
            {item.available_tonight && item.standby_bed_allowed && (
              <View style={[styles.badge, styles.badgeHot]}>
                <Text style={styles.badgeText}>STANDBY TONIGHT</Text>
              </View>
            )}
            {item.available_tonight && !item.standby_bed_allowed && item.bed_type === 'hot_bed' && (
              <View style={[styles.badge, styles.badgeHot]}>
                <Text style={styles.badgeText}>HOT BED TONIGHT</Text>
              </View>
            )}
            {!item.available_tonight && item.bed_type === 'cold_bed' && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>COLD BED</Text>
              </View>
            )}
          </View>
          <Pressable
            onPress={onToggleSave}
            style={styles.saveBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isSaved ? 'heart' : 'heart-outline'}
              size={22}
              color={isSaved ? colors.dangerRed : '#FFFFFF'}
            />
          </Pressable>
        </View>
        {item.price_type === 'per_trip' && item.price_per_trip && (
          <View style={styles.photoTag}>
            <Text style={styles.photoTagText}>Per trip</Text>
          </View>
        )}
        {item.price_type !== 'per_trip' && item.price_nightly && !item.price_monthly && (
          <View style={styles.photoTag}>
            <Text style={styles.photoTagText}>Nightly</Text>
          </View>
        )}
      </ImageBackground>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.subTitle} numberOfLines={1}>
          {item.neighborhood ? `${item.neighborhood} • ${distanceLabel}` : distanceLabel}
        </Text>
        <Text style={styles.price}>{priceLabel}</Text>
        <Text style={styles.meta} numberOfLines={2}>
          {bedLabel}
          {item.total_beds ? ` • ${item.total_beds} beds` : ''}
          {item.bathrooms ? ` • ${item.bathrooms} baths` : ''}
        </Text>
        {postingAsLabel && (
          <Text style={styles.meta} numberOfLines={1}>
            Posted by {postingAsLabel}
          </Text>
        )}
        {combinedTags.length > 0 && (
          <View style={styles.tagsRow}>
            {combinedTags.map((label) => (
              <View key={label} style={styles.tagPill}>
                <Text style={styles.tagText}>{label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  image: {
    height: 180,
    justifyContent: 'space-between',
  },
  imageInner: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  imageTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15,23,42,0.75)',
  },
  badgeHot: {
    backgroundColor: 'rgba(181,22,30,0.9)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  saveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  photoTag: {
    alignSelf: 'flex-start',
    margin: spacing.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15,23,42,0.8)',
  },
  photoTagText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  subTitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  price: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
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
});
