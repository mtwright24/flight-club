import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlightTrackerSubScreenShell } from '../../src/features/flight-tracker/components/FlightTrackerSubScreenShell';
import { FlightTrackerDateField } from '../../src/features/flight-tracker/components/FlightTrackerDateField';
import { parseFlightTrackerDateParam } from '../../src/features/flight-tracker/flightDateLocal';
import { colors, radius, spacing } from '../../src/styles/theme';

/** Example query strings only — not live results; each runs a real search when tapped. */
const EXAMPLE_QUERIES = ['DL4825', 'B6 1234', 'JFK to FLL', 'MCO', 'BOS-MIA'];

export default function FlightTrackerSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string | string[] }>();
  const dateFromRoute = useMemo(() => parseFlightTrackerDateParam(params.date), [params.date]);
  const [query, setQuery] = useState('');
  const [searchDate, setSearchDate] = useState(dateFromRoute);

  useEffect(() => {
    setSearchDate(dateFromRoute);
  }, [dateFromRoute]);

  const runSearch = (next?: string) => {
    const q = (next ?? query).trim();
    if (!q) return;
    router.push({ pathname: '/flight-tracker/results', params: { q, date: searchDate } });
  };

  return (
    <FlightTrackerSubScreenShell title="Track a Flight">
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

        <Text style={styles.dateLabel}>Flight date</Text>
        <FlightTrackerDateField value={searchDate} onChange={setSearchDate} />

        <Text style={styles.examplesTitle}>Try a query</Text>
        <View style={styles.examplesWrap}>
          {EXAMPLE_QUERIES.map((e) => (
            <Pressable key={e} style={styles.exampleChip} onPress={() => runSearch(e)}>
              <Text style={styles.exampleText}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </FlightTrackerSubScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing.md },
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
  dateLabel: { marginTop: 14, marginBottom: 8, color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
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
