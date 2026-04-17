import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Shared layout for Staff Loads tiles: tappable main body + ⋮ that does not trigger main navigation.
 * Blueprint for flight tiles + request tiles + load summary rows.
 */
export function StaffLoadsTileKebabRow({
  children,
  onPressMain,
  onPressKebab,
  onLongPressMain,
  delayLongPressMain = 380,
  mainAccessibilityLabel,
  mainAccessibilityState,
  kebabAccessibilityLabel = 'More actions',
  style,
}: {
  children: React.ReactNode;
  onPressMain: () => void;
  onPressKebab: () => void;
  onLongPressMain?: () => void;
  delayLongPressMain?: number;
  mainAccessibilityLabel?: string;
  mainAccessibilityState?: { selected?: boolean };
  kebabAccessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, style]}>
      <Pressable
        style={({ pressed }) => [styles.main, pressed && styles.mainPressed]}
        onPress={onPressMain}
        onLongPress={onLongPressMain}
        delayLongPress={onLongPressMain ? delayLongPressMain : undefined}
        accessibilityRole="button"
        accessibilityLabel={mainAccessibilityLabel}
        accessibilityState={mainAccessibilityState}
      >
        {children}
      </Pressable>
      <Pressable
        style={styles.kebab}
        onPress={onPressKebab}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={kebabAccessibilityLabel}
      >
        <Ionicons name="ellipsis-vertical" size={18} color="#94a3b8" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  main: { flex: 1, minWidth: 0 },
  mainPressed: { opacity: 0.96 },
  kebab: {
    width: 32,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginRight: -2,
  },
});
