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
};

/**
 * Red branded header for the Crew Schedule module (matches Flight Club header affordances).
 */
export default function CrewScheduleHeader({ title = 'Crew Schedule' }: Props) {
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
      <View style={styles.headerWrap}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
          accessibilityLabel="Back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.cardBg} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text
            style={styles.title}
            numberOfLines={1}
            ellipsizeMode="tail"
            {...(Platform.OS === 'ios'
              ? { adjustsFontSizeToMinimumFontScale: true, minimumFontScale: 0.85 }
              : {})}
          >
            {title}
          </Text>
        </View>
        <View style={styles.rightRow}>
          <Pressable
            onPress={() => router.push('/search')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
            accessibilityLabel="Search"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="search-outline" size={24} color={colors.cardBg} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={24} color={colors.cardBg} />
            {unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => router.push('/messages-inbox')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
            accessibilityLabel="Messages"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.cardBg} />
            {dmUnread > 0 ? (
              <View style={[styles.badge, { right: -2 }]}>
                <Text style={styles.badgeText}>{dmUnread > 99 ? '99+' : dmUnread}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => router.push('/menu')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
            accessibilityLabel="Menu"
          >
            <Ionicons name="menu" size={24} color={colors.cardBg} />
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
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  titleWrap: { flex: 1, minWidth: 0, paddingHorizontal: spacing.xs },
  title: {
    color: colors.cardBg,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    minWidth: 40,
    minHeight: 40,
    padding: 6,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconPressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: colors.dangerRed,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    zIndex: 2,
  },
  badgeText: { color: colors.cardBg, fontSize: 10, fontWeight: '800' },
});
