import React from 'react';
import { Pressable, StyleSheet, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useSegments } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';

const HEADER_HEIGHT = 56;

export default function FloatingBackButton() {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();
  const segments = useSegments();

  const canGoBack = typeof navigation?.canGoBack === 'function' ? navigation.canGoBack() : false;

  // Determine if current route is a root tab screen: segments like ['(tabs)']
  const isRootTab = segments.length === 1 && segments[0] === '(tabs)';

  if (!canGoBack || isRootTab) return null;

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
