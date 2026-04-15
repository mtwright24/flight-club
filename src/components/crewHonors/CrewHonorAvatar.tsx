import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { CH } from './crewHonorsTheme';

type Props = {
  uri: string | null | undefined;
  initials: string;
  size: number;
  borderColor?: string;
  ringWidth?: number;
};

export default function CrewHonorAvatar({
  uri,
  initials,
  size,
  borderColor = CH.goldLine,
  ringWidth = 2,
}: Props) {
  const fontSize = Math.round(size * 0.34);
  if (uri) {
    return (
      <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2, borderWidth: ringWidth, borderColor }]}>
        <Image source={{ uri }} style={{ width: size - ringWidth * 2, height: size - ringWidth * 2, borderRadius: (size - ringWidth * 2) / 2 }} />
      </View>
    );
  }
  return (
    <View
      style={[
        styles.wrap,
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2, borderWidth: ringWidth, borderColor },
      ]}
    >
      <Text style={[styles.initials, { fontSize }]} numberOfLines={1}>
        {(initials || 'FC').slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: CH.champagne },
  fallback: { backgroundColor: '#F5E6C8' },
  initials: { color: CH.navy, fontWeight: '800', letterSpacing: -0.5 },
});
