import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

const LOGO = (code: string) => `https://images.kiwi.com/airlines/64x64/${code.toUpperCase()}.png`;

type Props = {
  airlineCode: string;
  size?: number;
};

/**
 * Airline tail logo in a rounded tile (StaffTraveler-style). Falls back to code monogram on error.
 */
export function AirlineLogoMark({ airlineCode, size = 44 }: Props) {
  const code = (airlineCode || '?').slice(0, 3).toUpperCase();
  const [failed, setFailed] = useState(false);

  if (failed || code.length < 2) {
    return (
      <View style={[styles.fallback, { width: size, height: size, borderRadius: size * 0.22 }]}>
        <Text style={[styles.fallbackTx, { fontSize: size * 0.28 }]} numberOfLines={1}>
          {code}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.22 }]}>
      <Image
        source={{ uri: LOGO(code) }}
        style={{ width: size - 4, height: size - 4 }}
        contentFit="contain"
        transition={120}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  fallbackTx: {
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
});
