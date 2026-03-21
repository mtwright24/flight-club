import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export default function CrewRestCalculatorScreen() {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <Text style={styles.header}>Crew Rest Calculator</Text>
      <Text style={styles.subtitle}>Plan legal rest windows and duty limits.</Text>
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    color: '#0F172A',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 24,
    textAlign: 'center',
  },
  backBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderColor: '#E5E7EB',
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#B5161E',
  },
});
