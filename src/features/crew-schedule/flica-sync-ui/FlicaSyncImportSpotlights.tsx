import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { COLORS, RADIUS, SHADOW, SPACING } from '../../../styles/theme';
import { FLICA_SYNC_IMPORT_SPOTLIGHTS } from './flicaSyncPromoConfig';

const BANNER_GRADIENT: Record<string, [string, string]> = {
  nonrev: ['#1E3A5F', '#2563EB'],
  crashpads: ['#831843', '#BE185D'],
  utility: ['#134E4A', '#0D9488'],
};

/**
 * Full-width “while you wait” discovery strips — editorial banners, not utility icon tiles.
 */
export default function FlicaSyncImportSpotlights({
  presentationMode = 'interactive',
}: {
  presentationMode?: 'interactive' | 'sync';
}) {
  const router = useRouter();
  const sync = presentationMode === 'sync';
  return (
    <View style={styles.wrap}>
      <Text style={styles.rowKicker}>While you wait</Text>
      <View style={styles.column}>
        {FLICA_SYNC_IMPORT_SPOTLIGHTS.map((item) => {
          const row = (
            <>
              <LinearGradient
                colors={BANNER_GRADIENT[item.id] ?? ['#B91C1C', COLORS.red]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bannerArt}
              >
                <View style={styles.artGlyph}>
                  <Ionicons
                    name={item.icon as ComponentProps<typeof Ionicons>['name']}
                    size={32}
                    color="rgba(255,255,255,0.95)"
                  />
                </View>
              </LinearGradient>
              <View style={styles.bannerCopy}>
                <Text style={styles.bannerChip}>{item.chip}</Text>
                <Text style={styles.bannerTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.bannerSub} numberOfLines={2}>
                  {item.id === 'nonrev'
                    ? 'Space-available travel tools built for crew.'
                    : item.id === 'crashpads'
                      ? 'Find housing and crash pads from the community.'
                      : 'Quick links to loads, housing, and crew tools.'}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={22}
                color={sync ? COLORS.line : COLORS.text2}
                style={styles.chev}
              />
            </>
          );
          return sync ? (
            <View
              key={item.id}
              style={[styles.banner, styles.bannerSync]}
              accessibilityRole="text"
              accessibilityLabel={item.title}
            >
              {row}
            </View>
          ) : (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.banner, pressed && styles.bannerPressed]}
              onPress={() => item.route && router.push(item.route as Href)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              {row}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: SPACING.md },
  rowKicker: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.65,
    marginBottom: SPACING.sm,
  },
  column: { gap: 12 },
  banner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 84,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line + 'AA',
    ...SHADOW.card,
  },
  bannerSync: {
    opacity: 0.97,
  },
  bannerPressed: { opacity: 0.96 },
  bannerArt: {
    width: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artGlyph: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  bannerCopy: {
    flex: 1,
    minWidth: 0,
    paddingVertical: SPACING.sm,
    paddingRight: SPACING.sm,
    justifyContent: 'center',
  },
  bannerChip: {
    alignSelf: 'flex-start',
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.red,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 4,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.navy,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  bannerSub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text2,
    lineHeight: 16,
  },
  chev: { alignSelf: 'center', marginRight: 10 },
});
