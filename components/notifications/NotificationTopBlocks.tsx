import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TopBlockCounts, TopBlockSection } from '../../lib/notificationTopBlocks';
import { colors, spacing } from '../../src/styles/theme';

type BlockDef = {
  section: TopBlockSection;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
};

const BLOCKS: BlockDef[] = [
  {
    section: 'message-requests',
    title: 'Message Requests',
    icon: 'chatbubbles',
    iconBg: '#2563EB',
    iconColor: '#FFFFFF',
  },
  {
    section: 'crew-invites',
    title: 'Crew Room Invites',
    icon: 'people',
    iconBg: '#38BDF8',
    iconColor: '#FFFFFF',
  },
  {
    section: 'trade-matches',
    title: 'Trade Matches',
    icon: 'airplane',
    iconBg: '#06B6D4',
    iconColor: '#FFFFFF',
  },
  {
    section: 'housing-alerts',
    title: 'Housing Alerts',
    icon: 'home',
    iconBg: '#15803D',
    iconColor: '#FFFFFF',
  },
];

function topBlockSubtitle(section: TopBlockSection, counts: TopBlockCounts): string {
  switch (section) {
    case 'message-requests': {
      const n = counts.messageRequests;
      if (n === 0) return 'No new message requests';
      return `You have ${n} new message request${n === 1 ? '' : 's'}`;
    }
    case 'crew-invites': {
      const n = counts.crewRoomInvites;
      if (n === 0) return 'No invites to new crew rooms';
      return `${n} invite${n === 1 ? '' : 's'} to join new crew rooms`;
    }
    case 'trade-matches': {
      const n = counts.tradeMatches;
      if (n === 0) return 'No new trade matches';
      if (n === 1) return 'Trade match found for your trip';
      return `${n} trade matches for your trip`;
    }
    case 'housing-alerts': {
      const n = counts.housingAlerts;
      if (n === 0) return 'No new housing alerts';
      if (n === 1) return 'New crashpad listing for you';
      return `${n} new crashpad & housing alerts`;
    }
  }
}

function countForSection(section: TopBlockSection, counts: TopBlockCounts): number {
  switch (section) {
    case 'message-requests':
      return counts.messageRequests;
    case 'crew-invites':
      return counts.crewRoomInvites;
    case 'trade-matches':
      return counts.tradeMatches;
    case 'housing-alerts':
      return counts.housingAlerts;
  }
}

type Props = {
  counts: TopBlockCounts;
};

/**
 * One horizontal row per block (mockup): [icon] [title + subtitle] … [badge?] [›]
 * Inner `View` row — `Pressable` alone often breaks flex row and drops the chevron below text.
 */
export default function NotificationTopBlocks({ counts }: Props) {
  const router = useRouter();

  return (
    <View style={styles.section}>
      {BLOCKS.map((b, index) => {
        const n = countForSection(b.section, counts);
        const subtitle = topBlockSubtitle(b.section, counts);
        const isLast = index === BLOCKS.length - 1;

        return (
          <Pressable
            key={b.section}
            onPress={() => router.push(`/notifications/sublist/${b.section}`)}
            accessibilityRole="button"
            accessibilityLabel={`${b.title}. ${subtitle}`}
            style={({ pressed }) => [
              styles.rowPress,
              !isLast && styles.rowBorder,
              pressed && styles.rowPressed,
            ]}
          >
            <View style={styles.rowInner}>
              <View style={[styles.iconCircle, { backgroundColor: b.iconBg }]}>
                <Ionicons name={b.icon} size={18} color={b.iconColor} />
              </View>

              <View style={styles.textCol}>
                <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
                  {b.title}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
                  {subtitle}
                </Text>
              </View>

              <View style={styles.trailing}>
                {n > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{n > 99 ? '99+' : String(n)}</Text>
                  </View>
                ) : null}
                <View style={styles.chevronWrap}>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </View>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: colors.cardBg,
  },
  /** Hit target only — flex row lives in rowInner (Pressable flexDirection is unreliable). */
  rowPress: {
    width: '100%',
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  rowPressed: {
    backgroundColor: '#F9FAFB',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 10,
    minWidth: 0,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.25,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    lineHeight: 16,
  },
  /** Badge + chevron stay on the right, never wrap under the text. */
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.headerRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  chevronWrap: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
