import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  /** Tighter hero when vertical space is scarce (e.g. captcha + promos). */
  compact?: boolean;
  /** Tightest hero for full-screen sync scenes (fit without scroll on iPhone). */
  syncTight?: boolean;
};

/**
 * Same Flight Club community wordmark PNG as Home / auth — not a text substitution.
 */
export default function FlicaSyncBrandedHero({ compact = false, syncTight = false }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        syncTight && styles.wrapSyncTight,
        { paddingTop: Math.max(insets.top, syncTight ? 4 : compact ? 6 : 10) },
      ]}
      accessibilityRole="image"
      accessibilityLabel="Flight Club Crew"
    >
      <Image
        source={require('../../../../assets/images/auth/brand/flightclub-header.png')}
        style={[styles.logo, compact && styles.logoCompact, syncTight && styles.logoSyncTight]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingBottom: 14,
    width: '100%',
  },
  wrapCompact: {
    paddingBottom: 8,
  },
  wrapSyncTight: {
    paddingBottom: 2,
  },
  logo: {
    width: '88%',
    maxWidth: 300,
    height: 64,
  },
  logoCompact: {
    height: 56,
  },
  logoSyncTight: {
    height: 44,
    maxWidth: 260,
  },
});
