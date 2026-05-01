import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '../../../styles/theme';

type Props = {
  /** Tighter hero when vertical space is scarce (e.g. captcha + promos). */
  compact?: boolean;
  /** Tightest hero for fused captcha column. */
  syncTight?: boolean;
  /** Richer wordmark + gradient for full-screen sync overlay. */
  premiumSync?: boolean;
};

/**
 * Flight Club wordmark PNG — same asset as Home / auth.
 */
export default function FlicaSyncBrandedHero({ compact = false, syncTight = false, premiumSync = false }: Props) {
  const insets = useSafeAreaInsets();
  const pt = Math.max(insets.top, premiumSync ? (syncTight ? 6 : 10) : syncTight ? 4 : compact ? 6 : 10);
  return (
    <LinearGradient
      colors={[COLORS.red, COLORS.redDark, 'rgba(247,246,244,0.01)']}
      locations={[0, 0.38, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.gradient, { paddingTop: pt }]}
    >
      <View
        style={[
          styles.wrap,
          premiumSync && styles.wrapPremium,
          compact && styles.wrapCompact,
          syncTight && styles.wrapSyncTight,
        ]}
        accessibilityRole="header"
        accessibilityLabel="Flight Club"
      >
        <Image
          source={require('../../../../assets/images/auth/brand/flightclub-header.png')}
          style={[
            styles.logo,
            premiumSync && styles.logoPremium,
            compact && styles.logoCompact,
            syncTight && styles.logoSyncTight,
          ]}
          resizeMode="contain"
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    width: '100%',
    alignSelf: 'stretch',
  },
  wrap: {
    alignItems: 'center',
    paddingBottom: 14,
    width: '100%',
  },
  wrapPremium: {
    paddingBottom: 18,
    paddingTop: 2,
  },
  wrapCompact: {
    paddingBottom: 10,
  },
  wrapSyncTight: {
    paddingBottom: 4,
  },
  logo: {
    width: '88%',
    maxWidth: 300,
    height: 64,
  },
  logoPremium: {
    height: 58,
    maxWidth: 304,
  },
  logoCompact: {
    height: 52,
  },
  logoSyncTight: {
    height: 46,
    maxWidth: 268,
  },
});
