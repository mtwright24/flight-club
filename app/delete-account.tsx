import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '../src/styles/theme';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const handleDelete = () => {
    Alert.alert('Delete Account', 'This feature is not yet available.');
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={styles.headerBack}>{'<'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Delete Account</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.content}>
        <Text style={styles.info}>Account deletion is not yet available. Please contact support for assistance.</Text>
        <Pressable style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete My Account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.cardBg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerBtn: { padding: spacing.sm },
  headerBack: { fontSize: 18, color: colors.headerRed },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  info: { color: colors.textSecondary, fontSize: 16, marginBottom: spacing.lg, textAlign: 'center' },
  deleteBtn: { backgroundColor: '#E63946', borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
