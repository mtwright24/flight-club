import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../styles/theme';

type Props = {
  title?: string;
  showLogo?: boolean;
  bellCount?: number;
  dmCount?: number;
  onPressBell?: () => void;
  onPressMenu?: () => void;
  onPressMessage?: () => void;
};

export default function AppHeader({ title, showLogo = true, bellCount = 0, dmCount = 0, onPressBell, onPressMenu, onPressMessage }: Props) {
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
    <SafeAreaView style={styles.safe} edges={['left','right','top']}>
      <View style={styles.headerWrap}>
        <View style={styles.leftRow}>
          {showLogo && !title ? (
            <Image
              source={require('../../assets/images/auth/brand/flightclub-header.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          ) : title ? (
            <Text style={[styles.title, styles.titleNoLogo]}>{title}</Text>
          ) : null}
        </View>
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
              <Text style={styles.badgeText}>{bellCount}</Text>
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
    paddingVertical: 0,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  leftRow: { flexDirection: 'row', alignItems: 'center' },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginLeft: spacing.md,
  },
  logo: { height: 40, width: 200, marginLeft: -20 },
  title: { color: colors.cardBg, fontSize: 16, fontWeight: '800', marginLeft: 8 },
  titleNoLogo: { marginLeft: 0 },
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
  badgeText: { color: colors.cardBg, fontSize: 10, fontWeight: '800', textAlign: 'center', lineHeight: 16 },
});
