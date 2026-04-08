import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../styles/theme';

type ProfileData = Record<string, any>;

type Props = {
  profile: ProfileData | null;
  memberRoomNames: string[];
};

function toCleanString(value: unknown): string {
  if (typeof value === 'string') {
    const v = value.trim();
    return v;
  }
  if (typeof value === 'number') return String(value);
  return '';
}

function toDisplayList(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => toCleanString(v)).filter(Boolean).join(', ');
  }
  return toCleanString(value);
}

function formatMemberSince(value: unknown): string {
  const s = toCleanString(value);
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function firstTruthy(...values: unknown[]): string {
  for (const v of values) {
    const s = toCleanString(v);
    if (s) return s;
  }
  return '';
}

function InfoSection({ title, rows }: { title: string; rows: Array<{ label: string; value: string }> }) {
  if (!rows.length) return null;
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.map((r) => (
        <View key={`${title}-${r.label}`} style={styles.row}>
          <Text style={styles.rowLabel}>{r.label}</Text>
          <Text style={styles.rowValue}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ProfileAboutTab({ profile, memberRoomNames }: Props) {
  if (!profile) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>More profile details will appear here.</Text>
      </View>
    );
  }

  const bio = toCleanString(profile.bio);
  const bioRows = bio ? [{ label: 'Bio', value: bio }] : [];

  const role = firstTruthy(profile.role);
  const airline = firstTruthy(profile.airline);
  const base = firstTruthy(profile.base);
  const fleet = firstTruthy(profile.fleet);
  const aviationSince = firstTruthy(profile.aviation_since_year, profile.aviation_since, profile.seniority_year);
  const commuterStatus = firstTruthy(profile.commuter_status);
  const languages = toDisplayList(profile.languages);

  const crewRows = [
    { label: 'Role', value: role },
    { label: 'Airline', value: airline },
    { label: 'Base', value: base },
    { label: 'Fleet', value: fleet },
    { label: 'In aviation since', value: aviationSince },
    { label: 'Commuter status', value: commuterStatus },
    { label: 'Languages', value: languages },
  ].filter((r) => r.value);

  const memberSince = formatMemberSince(profile.created_at);
  const verificationValue =
    profile.is_verified === true
      ? 'Verified'
      : profile.crew_verified === true
      ? 'Crew verified'
      : profile.airline_verified === true
      ? 'Airline verified'
      : '';
  const profileRows = [
    { label: 'Member since', value: memberSince },
    { label: 'Verification', value: verificationValue },
  ].filter((r) => r.value);

  const hometown = firstTruthy(profile.hometown);
  const livesIn = firstTruthy(profile.lives_in);
  const favoriteLayoverCity = firstTruthy(profile.favorite_layover_city, profile.favorite_layover);
  const interests = toDisplayList(profile.interests);
  const moreRows = [
    { label: 'Hometown', value: hometown },
    { label: 'Lives in', value: livesIn },
    { label: 'Favorite layover city', value: favoriteLayoverCity },
    { label: 'Interests', value: interests },
  ].filter((r) => r.value);

  const hasAnySection =
    bioRows.length > 0 ||
    crewRows.length > 0 ||
    profileRows.length > 0 ||
    moreRows.length > 0 ||
    memberRoomNames.length > 0;

  if (!hasAnySection) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>More profile details will appear here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <InfoSection title="About" rows={bioRows} />
      <InfoSection title="Crew Info" rows={crewRows} />
      {memberRoomNames.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Community</Text>
          <View style={styles.chipsWrap}>
            {memberRoomNames.map((name) => (
              <View key={name} style={styles.chip}>
                <Text style={styles.chipText}>{name}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <InfoSection title="Profile Info" rows={profileRows} />
      <InfoSection title="More About" rows={moreRows} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 10,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  rowLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  rowValue: {
    flex: 1.2,
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyWrap: {
    paddingHorizontal: 18,
    paddingTop: spacing.lg,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
});

