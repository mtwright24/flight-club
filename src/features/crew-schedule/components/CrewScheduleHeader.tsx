import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../../../styles/theme';
import { useNotificationsBadge } from '../../../hooks/useNotificationsBadge';
import { useDmUnreadBadge } from '../../../hooks/useDmUnreadBadge';

type Props = {
  title?: string;
  /**
   * Extra space below title / icons inside the red bar (matches other red headers on tall screens).
   * Use only where the default bar feels tight below the chromed row — e.g. FLICA Sync.
   */
  relaxedBottomInset?: boolean;
};

/**
 * Red branded header for the Crew Schedule module (matches Flight Club header affordances).
 */
export default function CrewScheduleHeader({ title = 'Crew Schedule', relaxedBottomInset = false }: Props) {
  const router = useRouter();
  const unread = useNotificationsBadge();
  const { count: dmUnread } = useDmUnreadBadge();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'top']}>
      <View
        style={[styles.headerWrap, relaxedBottomInset ? styles.headerWrapRelaxedInset : undefined]}
      >
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          accessibilityLabel="Back"
          hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.cardBg} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text
            style={styles.title}
            numberOfLines={1}
            ellipsizeMode="tail"
            {...(Platform.OS === 'ios'
              ? { adjustsFontSizeToMinimumFontScale: true, minimumFontScale: 0.82 }
              : {})}
          >
            {title}
          </Text>
        </View>
        <View style={styles.rightRow}>
          <Pressable
            onPress={() => router.push('/search')}
            style={({ pressed }) => [styles.iconButton, styles.rightIconButton, pressed && styles.iconButtonPressed]}
            accessibilityLabel="Search"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="search-outline" size={26} color={colors.cardBg} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.iconButton, styles.rightIconButton, pressed && styles.iconButtonPressed]}
            accessibilityLabel="Notifications"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="notifications-outline" size={26} color={colors.cardBg} />
            {unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => router.push('/messages-inbox')}
            style={({ pressed }) => [styles.iconButton, styles.rightIconButton, pressed && styles.iconButtonPressed]}
            accessibilityLabel="Messages"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.cardBg} />
            {dmUnread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{dmUnread > 99 ? '99+' : dmUnread}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => router.push('/menu')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            accessibilityLabel="Menu"
          >
            <Ionicons name="menu" size={26} color={colors.cardBg} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.headerRed },
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.headerRed,
    height: 60,
    paddingTop: 6,
    paddingBottom: 2,
    paddingHorizontal: spacing.lg,
    gap: 12,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  /**
   * FLICA Sync: pin title + icons to the top of the red bar (not vertically centered), so they sit higher
   * and farther from the scroll / WebView below.
   */
  headerWrapRelaxedInset: {
    alignItems: 'flex-start',
    height: 68,
    paddingTop: 2,
    paddingBottom: spacing.sm,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  title: {
    color: colors.cardBg,
    fontSize: 18,
    fontWeight: '800',
    textAlignVertical: 'center',
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 14,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    padding: 8,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  /** Right-side cluster: spacing from `rightRow` gap only (no extra horizontal margins). */
  rightIconButton: {
    marginHorizontal: 0,
  },
  iconButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.dangerRed,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    zIndex: 2,
  },
  badgeText: {
    color: colors.cardBg,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 16,
  },
});
