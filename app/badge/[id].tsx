import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

export default function BadgeDetail() {
  const params = useLocalSearchParams();
  const id = params.id ?? '—';
  return (
    <SafeAreaView style={styles.wrap}>
      <Text style={styles.h1}>Badge Detail</Text>
      <Text style={styles.sub}>Badge id: {id}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  h1: { fontSize: 22, fontWeight: '800' },
  sub: { marginTop: 8, color: '#475569' },
});
