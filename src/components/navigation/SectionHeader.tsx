import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../../styles/theme';

type Props = {
  title: string;
  showBell?: boolean;
  bellCount?: number;
  onPressBell?: () => void;
  onPressMenu?: () => void;
  showMessageIcon?: boolean;
  onPressMessage?: () => void;
  notificationCount?: number;
  dmCount?: number;
};

/**
 * NavigationSectionHeader is a lightweight, section-specific header used for tabs
 * other than Home. It displays a section title with bell and menu icons.
 * 
 * Usage:
 * - Crew Rooms tab: <SectionHeader title="Crew Rooms" />
 * - Social Feed tab: <SectionHeader title="Social Feed" />
 * - Profile tab: <SectionHeader title="Profile" />
 */
export default function SectionHeader({ 
  title, 
  onPressBell, 
  onPressMenu, 
  onPressMessage, 
  notificationCount = 0, 
  dmCount = 0 
}: Props) {
  const router = useRouter();

  const handleBell = () => {
    if (onPressBell) return onPressBell();
    try { router.push('/notifications'); } catch (e) { console.log('no route /notifications'); }
  };

  const handleMenu = () => {
    if (onPressMenu) return onPressMenu();
    try { router.push('/menu'); } catch (e) { console.log('no route /menu'); }
  };

  const handleMessage = () => {
    if (onPressMessage) return onPressMessage();
    try { router.push('/messages-inbox'); } catch (e) { console.log('no route /messages-inbox'); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'top']}>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.rightRow}>
          <Pressable
            onPress={() => {
              try { router.push('/search'); } catch (e) { console.log('no route /search'); }
            }}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            accessibilityLabel="Search"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="search-outline" size={26} color={colors.cardBg} />
          </Pressable>
          <Pressable onPress={handleBell} style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]} accessibilityLabel="Notifications">
            <Ionicons name="notifications-outline" size={26} color={colors.cardBg} />
            <View style={[styles.badge, { top: -4, right: -4 }]}> 
              <Text style={styles.badgeText}>{notificationCount}</Text>
            </View>
          </Pressable>
          <Pressable onPress={handleMessage} style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]} accessibilityLabel="Messages">
            <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.cardBg} />
            <View style={[styles.badge, { top: -4, right: -4 }]}> 
              <Text style={styles.badgeText}>{dmCount}</Text>
            </View>
          </Pressable>
          <Pressable onPress={handleMenu} style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]} accessibilityLabel="Menu">
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
    justifyContent: 'space-between',
    backgroundColor: colors.headerRed,
    height: 60,
    paddingTop: 6,
    paddingBottom: 2,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  title: { 
    color: colors.cardBg, 
    fontSize: 18, 
    fontWeight: '800',
    flex: 1,
    marginRight: 12,
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
  badgeText: { color: colors.cardBg, fontSize: 10, fontWeight: '800', textAlign: 'center', lineHeight: 16 },
});
