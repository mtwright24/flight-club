import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../src/styles/theme';
import AppHeader from '../components/AppHeader';

export default function NonRevLoadsScreen() {
  // State for airline, from, to, date, etc. (to be implemented)
  return (
    <View style={styles.container}>
      <AppHeader title="Non-Rev Loads" showLogo={false} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Search Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Where to?</Text>
          {/* Airline, From, To, Date pickers will go here */}
        </View>
        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>
            Community-reported loads. Verify in official airline systems. Flight Club does not access or automate airline systems.
          </Text>
        </View>
      </ScrollView>
      {/* Search Button (disabled for now) */}
      <View style={styles.footer}>
        <Pressable style={[styles.searchButton, styles.searchButtonDisabled]} disabled>
          <Text style={styles.searchButtonText}>Search Loads</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    marginBottom: 24,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16, color: '#222' },
  disclaimerBox: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  disclaimerText: { fontSize: 13, color: '#666', textAlign: 'center' },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
  searchButton: {
    backgroundColor: colors.headerRed,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  searchButtonDisabled: { backgroundColor: '#ccc' },
  searchButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
