import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CrewConnect() {
  return (
    <SafeAreaView style={styles.wrap}>
      <Text style={styles.h1}>Crew Connect (Placeholder)</Text>
      <Text style={styles.sub}>This is a minimal placeholder screen.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  h1: { fontSize: 22, fontWeight: '800' },
  sub: { marginTop: 12, color: '#475569' },
});
