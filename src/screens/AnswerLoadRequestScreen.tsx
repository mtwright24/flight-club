import React from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import AppHeader from '../components/AppHeader';

export default function AnswerLoadRequestScreen() {
  // Placeholder for answer form
  return (
    <View style={styles.container}>
      <AppHeader title="Answer Request" showLogo={false} />
      <View style={styles.content}>
        <Text style={styles.label}>Load Level</Text>
        {/* Load level selector (to be implemented) */}
        <Text style={styles.label}>Notes</Text>
        <TextInput style={styles.input} placeholder="Optional notes..." />
        <Pressable style={styles.ctaButton}>
          <Text style={styles.ctaButtonText}>Submit Answer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  label: { fontWeight: '600', marginTop: 16, marginBottom: 6, color: '#222' },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    marginBottom: 18,
  },
  ctaButton: {
    backgroundColor: '#DC3545',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  ctaButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
