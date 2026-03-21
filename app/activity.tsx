import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function ActivityScreen() {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <Text style={styles.header}>Activity</Text>
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 24 },
  header: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  backBtn: { borderWidth: 1, borderRadius: 10, padding: 12 },
  backText: { fontSize: 16, fontWeight: '600' },
});
