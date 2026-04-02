import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../src/styles/theme';

export default function InboundAircraftScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Inbound Aircraft</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Inbound chain lookup</Text>
        <Text style={styles.body}>
          FlightAware inbound-leg linkage is wired at the service layer and can be surfaced per-flight once your account confirms endpoint availability.
        </Text>
        <Pressable style={styles.cta} onPress={() => router.push('/flight-tracker/search')}>
          <Text style={styles.ctaText}>Open flight search</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: { backgroundColor: colors.headerRed, paddingHorizontal: spacing.md, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  content: { padding: spacing.md },
  title: { color: colors.textPrimary, fontWeight: '800', fontSize: 16, marginBottom: 6 },
  body: { color: colors.textSecondary, fontWeight: '600', fontSize: 13, lineHeight: 19 },
  cta: { marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9, alignSelf: 'flex-start' },
  ctaText: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
});
