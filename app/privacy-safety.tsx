import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '../src/styles/theme';
import { usePullToRefresh } from '../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../src/styles/refreshControl';

export default function PrivacySafetyScreen() {
  const router = useRouter();
  const { refreshing: privacyPullRefreshing, onRefresh: onPrivacyPullRefresh } = usePullToRefresh(async () => {
    /* static screen; hook completes spinner */
  });
  // In-memory toggles (TODO: wire to backend/store for persistence)
  const [privateAccount, setPrivateAccount] = useState(false);
  const [showProfileInSearch, setShowProfileInSearch] = useState(true);
  const [allowMessages, setAllowMessages] = useState(true);
  const [allowFollows, setAllowFollows] = useState(true);
  const [showAirline, setShowAirline] = useState(true);
  const [showRole, setShowRole] = useState(true);
  const [showBase, setShowBase] = useState(true);
  const [showFleet, setShowFleet] = useState(true);
  const [showYears, setShowYears] = useState(true);
  const [showCommuter, setShowCommuter] = useState(true);
  const [showLanguages, setShowLanguages] = useState(true);
  const [showHometown, setShowHometown] = useState(true);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={styles.headerBack}>{'<'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Privacy & Safety</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.sectionTitle}>Privacy Controls</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Private Account</Text>
          <Switch value={privateAccount} onValueChange={setPrivateAccount} />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Show Profile in Search</Text>
          <Switch value={showProfileInSearch} onValueChange={setShowProfileInSearch} />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Allow Messages</Text>
          <Switch value={allowMessages} onValueChange={setAllowMessages} />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Allow Follows</Text>
          <Switch value={allowFollows} onValueChange={setAllowFollows} />
        </View>
        <Text style={styles.sectionTitle}>Public Field Visibility</Text>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Show Airline</Text><Switch value={showAirline} onValueChange={setShowAirline} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Show Role</Text><Switch value={showRole} onValueChange={setShowRole} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Show Base</Text><Switch value={showBase} onValueChange={setShowBase} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Show Fleet</Text><Switch value={showFleet} onValueChange={setShowFleet} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Show Years of Service</Text><Switch value={showYears} onValueChange={setShowYears} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Show Commuter Status</Text><Switch value={showCommuter} onValueChange={setShowCommuter} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Show Languages</Text><Switch value={showLanguages} onValueChange={setShowLanguages} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Show Hometown/City</Text><Switch value={showHometown} onValueChange={setShowHometown} /></View>
        <Text style={styles.sectionTitle}>Safety Controls</Text>
        <Pressable style={styles.linkRow} onPress={() => router.push('/blocked-users')}><Text style={styles.linkLabel}>Blocked Users</Text><Text style={styles.linkArrow}>→</Text></Pressable>
        <Pressable style={styles.linkRow} onPress={() => router.push('/muted-users')}><Text style={styles.linkLabel}>Muted Users</Text><Text style={styles.linkArrow}>→</Text></Pressable>
        <Pressable style={styles.linkRow} onPress={() => router.push('/hidden-words')}><Text style={styles.linkLabel}>Hidden Words</Text><Text style={styles.linkArrow}>→</Text></Pressable>
        <Pressable style={styles.linkRow} onPress={() => router.push('/about-flight-club')}><Text style={styles.linkLabel}>Community Guidelines</Text><Text style={styles.linkArrow}>→</Text></Pressable>
        <Pressable style={styles.linkRow} onPress={() => router.push('/help-support')}><Text style={styles.linkLabel}>Report a Problem</Text><Text style={styles.linkArrow}>→</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.cardBg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerBtn: { padding: spacing.sm },
  headerBack: { fontSize: 18, color: colors.headerRed },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.cardBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  toggleLabel: { fontSize: 15, color: colors.textPrimary },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.cardBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  linkLabel: { fontSize: 15, color: colors.textPrimary },
  linkArrow: { fontSize: 18, color: colors.headerRed },
});
