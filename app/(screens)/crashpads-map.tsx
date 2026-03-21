import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import { colors, radius, spacing } from '../../src/styles/theme';

export default function HousingMapPlaceholderScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlightClubHeader title="Map" showLogo={false} />
      <View style={styles.wrap}>
        <View style={styles.mapBox}>
          <Text style={styles.mapText}>Map view placeholder – pins and real map can be wired here later.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: spacing.lg,
  },
  mapBox: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  mapText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
