import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../../src/styles/theme';

const EXAMPLES = ['DL4825', 'B6 1234', 'JFK to FLL', 'MCO', 'BOS-MIA'];

export default function FlightTrackerSearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const runSearch = (next?: string) => {
    const q = (next ?? query).trim();
    if (!q) return;
    router.push({ pathname: '/flight-tracker/results', params: { q } });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Track a Flight</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Search by flight, route, or airport</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
          <TextInput
            style={styles.input}
            placeholder="DL4825, JFK to FLL, MCO"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="characters"
            returnKeyType="search"
            onSubmitEditing={() => runSearch()}
          />
        </View>
        <Pressable style={styles.searchBtn} onPress={() => runSearch()}>
          <Text style={styles.searchBtnText}>Search flights</Text>
        </Pressable>

        <Text style={styles.examplesTitle}>Examples</Text>
        <View style={styles.examplesWrap}>
          {EXAMPLES.map((e) => (
            <Pressable key={e} style={styles.exampleChip} onPress={() => runSearch(e)}>
              <Text style={styles.exampleText}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    backgroundColor: colors.headerRed,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  content: { padding: spacing.md },
  label: { fontSize: 13, color: colors.textSecondary, fontWeight: '600', marginBottom: 8 },
  inputWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600', paddingVertical: 11, paddingHorizontal: 8 },
  searchBtn: {
    marginTop: 10,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  searchBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  examplesTitle: { marginTop: 16, marginBottom: 8, color: colors.textPrimary, fontWeight: '800', fontSize: 14 },
  examplesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exampleChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  exampleText: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
});
