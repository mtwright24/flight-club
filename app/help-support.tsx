import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '../src/styles/theme';
import { usePullToRefresh } from '../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../src/styles/refreshControl';

export default function HelpSupportScreen() {
  const router = useRouter();
  const { refreshing: helpPullRefreshing, onRefresh: onHelpPullRefresh } = usePullToRefresh(async () => {
    /* static screen */
  });
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={styles.headerBack}>{'<'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={helpPullRefreshing}
            onRefresh={onHelpPullRefresh}
            colors={REFRESH_CONTROL_COLORS}
            tintColor={REFRESH_TINT}
          />
        }
      >
        <Pressable style={styles.linkRow}><Text style={styles.linkLabel}>Help Center</Text><Text style={styles.linkArrow}>→</Text></Pressable>
        <Pressable style={styles.linkRow}><Text style={styles.linkLabel}>Contact Support</Text><Text style={styles.linkArrow}>→</Text></Pressable>
        <Pressable style={styles.linkRow}><Text style={styles.linkLabel}>Report a Bug</Text><Text style={styles.linkArrow}>→</Text></Pressable>
        <Pressable style={styles.linkRow}><Text style={styles.linkLabel}>Submit Feedback</Text><Text style={styles.linkArrow}>→</Text></Pressable>
        <Pressable style={styles.linkRow}><Text style={styles.linkLabel}>FAQ</Text><Text style={styles.linkArrow}>→</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.cardBg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerBtn: { padding: spacing.sm },
  headerBack: { fontSize: 18, color: colors.headerRed },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.cardBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  linkLabel: { fontSize: 15, color: colors.textPrimary },
  linkArrow: { fontSize: 18, color: colors.headerRed },
});
