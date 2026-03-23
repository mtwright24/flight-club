import React from 'react';
import { Pressable, StyleSheet, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { usePathname, useSegments } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';

/** Matches SectionHeader / AppHeader `headerWrap` height for vertical alignment. */
const HEADER_HEIGHT = 60;

/** True when user is on a bottom-tab root (no inner stack pushed). */
function isBottomTabRootScreen(segments: readonly string[]): boolean {
  const tabsIdx = segments.indexOf('(tabs)');
  if (tabsIdx === -1) return false;
  const tail = segments.slice(tabsIdx + 1);
  if (tail.length === 0) return true;
  if (tail.length === 1) {
    const s = tail[0];
    return s === 'index' || s === 'crew-tools' || s === 'feed' || s === 'profile' || s === 'crew-rooms';
  }
  if (tail.length === 2 && tail[0] === 'crew-rooms' && tail[1] === 'index') {
    return true;
  }
  return false;
}

export default function FloatingBackButton() {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();
  const segments = useSegments();
  const pathname = usePathname();

  const canGoBack = typeof navigation?.canGoBack === 'function' ? navigation.canGoBack() : false;

  const path = (pathname || '/').replace(/\/$/, '') || '/';
  // These screens already render a primary back control in the red header row.
  if (path === '/search' || path === '/notifications') {
    return null;
  }

  if (!canGoBack || isBottomTabRootScreen(segments)) return null;

  const top = insets.top + HEADER_HEIGHT + 10;

  const handlePress = async () => {
    try { await Haptics.selectionAsync(); } catch {}
    navigation.goBack();
  };

  return (
    <View pointerEvents="box-none" style={[styles.container, { top }]}> 
      <Pressable onPress={handlePress} style={({ pressed }) => [styles.button, pressed && styles.pressed]} accessibilityLabel="Back">
        <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'chevron-back'} size={20} color={colors.NAVY} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    zIndex: 1000,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
});
