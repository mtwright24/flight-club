import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import AppHeader from '../components/AppHeader';

export default function LoadRequestDetailScreen() {
  // Placeholder for request detail
  return (
    <View style={styles.container}>
      <AppHeader title="Request Detail" showLogo={false} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Request info and answers will go here */}
        <View style={styles.card}><Text>Request details and answers will appear here.</Text></View>
        <Pressable style={styles.ctaButton}>
          <Text style={styles.ctaButtonText}>Answer Request</Text>
        </Pressable>
      </ScrollView>
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
  ctaButton: {
    backgroundColor: '#DC3545',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 18,
  },
  ctaButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
