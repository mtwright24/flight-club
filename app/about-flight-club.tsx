import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '../src/styles/theme';
import { usePullToRefresh } from '../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../src/styles/refreshControl';

export default function AboutFlightClubScreen() {
  const router = useRouter();
  const { refreshing: aboutPullRefreshing, onRefresh: onAboutPullRefresh } = usePullToRefresh(async () => {
    /* static screen */
  });
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={styles.headerBack}>{'<'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>About Flight Club</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={aboutPullRefreshing}
            onRefresh={onAboutPullRefresh}
            colors={REFRESH_CONTROL_COLORS}
            tintColor={REFRESH_TINT}
          />
        }
      >
        <Text style={styles.brandTitle}>Flight Club</Text>
        <Text style={styles.brandDesc}>A community for airline crew to connect, share, and support each other. Built for pilots, flight attendants, and all crew members.</Text>
        <View style={{ height: spacing.lg }} />
        <Text style={styles.sectionTitle}>Legal</Text>
        <Pressable style={styles.linkRow}><Text style={styles.linkLabel}>Privacy Policy</Text><Text style={styles.linkArrow}>→</Text></Pressable>
        <Pressable style={styles.linkRow}><Text style={styles.linkLabel}>Terms of Service</Text><Text style={styles.linkArrow}>→</Text></Pressable>
        <Pressable style={styles.linkRow}><Text style={styles.linkLabel}>Community Guidelines</Text><Text style={styles.linkArrow}>→</Text></Pressable>
        <View style={{ height: spacing.lg }} />
        <Text style={styles.version}>Version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.cardBg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerBtn: { padding: spacing.sm },
  headerBack: { fontSize: 18, color: colors.headerRed },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  brandTitle: { fontSize: 22, fontWeight: '700', color: colors.headerRed, marginBottom: spacing.md },
  brandDesc: { fontSize: 15, color: colors.textPrimary, marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.cardBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  linkLabel: { fontSize: 15, color: colors.textPrimary },
  linkArrow: { fontSize: 18, color: colors.headerRed },
  version: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.md },
});
