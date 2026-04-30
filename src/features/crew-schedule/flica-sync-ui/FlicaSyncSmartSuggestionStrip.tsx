import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { COLORS, RADIUS, SHADOW, SPACING } from '../../../styles/theme';

type Props = {
  route?: string;
  /** During FLICA sync: looks tappable but does not navigate. */
  presentationMode?: 'interactive' | 'sync';
};

/**
 * Mockup-style slim “Smart suggestion” row (bell + chip + chevron).
 */
export default function FlicaSyncSmartSuggestionStrip({
  route = '/crew-schedule/(tabs)/alerts',
  presentationMode = 'interactive',
}: Props) {
  const router = useRouter();
  const sync = presentationMode === 'sync';
  const inner = (
    <>
      <View style={styles.glyph}>
        <Ionicons name="notifications" size={18} color="#CA8A04" />
      </View>
      <View style={styles.mid}>
        <View style={styles.chip}>
          <Text style={styles.chipTxt}>Smart suggestion</Text>
        </View>
        <Text style={styles.body} numberOfLines={2}>
          Turn on push notifications — never miss important schedule updates.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={sync ? COLORS.line : COLORS.text2} />
    </>
  );
  if (sync) {
    return (
      <View style={[styles.wrap, styles.wrapSync]} accessibilityRole="text" accessibilityLabel="Smart suggestion">
        {inner}
      </View>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      onPress={() => router.push(route as Href)}
      accessibilityRole="button"
      accessibilityLabel="Smart suggestion: turn on push notifications"
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...SHADOW.soft,
  },
  wrapSync: { opacity: 0.98 },
  pressed: { opacity: 0.94 },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF9C3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { flex: 1, minWidth: 0 },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  chipTxt: {
    fontSize: 8,
    fontWeight: '900',
    color: '#A16207',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
    lineHeight: 16,
  },
});
