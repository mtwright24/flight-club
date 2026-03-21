import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import AppHeader from '../components/AppHeader';

export default function LoadsRequestsScreen() {
  // Placeholder for requests tabs
  return (
    <View style={styles.container}>
      <AppHeader title="Load Requests" showLogo={false} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Tabs: Open / Answered */}
        <View style={styles.tabsRow}>
          <Pressable style={[styles.tab, styles.tabActive]}><Text style={styles.tabTextActive}>Open</Text></Pressable>
          <Pressable style={styles.tab}><Text style={styles.tabText}>Answered</Text></Pressable>
        </View>
        {/* Requests list will go here */}
        <View style={styles.card}><Text>Requests will appear here.</Text></View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  tabsRow: { flexDirection: 'row', marginBottom: 18 },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#eee',
  },
  tabActive: {
    borderBottomColor: '#DC3545',
    backgroundColor: '#fff5f5',
  },
  tabText: { color: '#888', fontWeight: '600' },
  tabTextActive: { color: '#DC3545', fontWeight: '700' },
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
});
