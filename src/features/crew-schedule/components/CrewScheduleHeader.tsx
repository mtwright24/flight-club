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
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
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
              ? { adjustsFontSizeToMinimumFontScale: true, minimumFontScale: 0.82 }
              : {})}
          >
            {title}
          </Text>
        </View>
        <View style={styles.rightRow}>
          <Pressable
            onPress={() => router.push('/search')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            accessibilityLabel="Search"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="search-outline" size={26} color={colors.cardBg} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            accessibilityLabel="Notifications"
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
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            accessibilityLabel="Messages"
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
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
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
    gap: 16,
    marginLeft: spacing.md,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    padding: 8,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    marginHorizontal: 2,
    position: 'relative',
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
