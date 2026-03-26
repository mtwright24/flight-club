
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabaseClient';
import { useAuth } from '../src/hooks/useAuth';
import { colors, spacing, radius } from '../src/styles/theme';
import { usePullToRefresh } from '../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../src/styles/refreshControl';

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState({
    masterPush: true,
    messages: true,
    crewRooms: true,
    follows: true,
    comments: true,
    replies: true,
    mentions: true,
    tags: true,
    likes: true,
    updates: true,
    email: true,
  });

  const loadPrefs = useCallback(async (opts?: { silent?: boolean }) => {
    if (!userId) return;
    if (!opts?.silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (error) {
        setPrefs({
          masterPush: true,
          messages: true,
          crewRooms: true,
          follows: true,
          comments: true,
          replies: true,
          mentions: true,
          tags: true,
          likes: true,
          updates: true,
          email: true,
        });
      } else {
        setPrefs({
          masterPush: data.master_push ?? true,
          messages: data.messages ?? true,
          crewRooms: data.crew_rooms ?? true,
          follows: data.follows ?? true,
          comments: data.comments ?? true,
          replies: data.replies ?? true,
          mentions: data.mentions ?? true,
          tags: data.tags ?? true,
          likes: data.likes ?? true,
          updates: data.updates ?? true,
          email: data.email ?? true,
        });
      }
    } catch {
      Alert.alert('Error', 'Failed to load notification preferences');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadPrefs();
  }, [loadPrefs]);

  const { refreshing: notifSettingsPullRefreshing, onRefresh: onNotifSettingsPullRefresh } =
    usePullToRefresh(async () => {
      await loadPrefs({ silent: true });
    });

  const handleToggle = (key: keyof typeof prefs, value: boolean) => {
    setPrefs((prev: typeof prefs) => ({ ...prev, [key]: value }));
    savePrefs({ ...prefs, [key]: value });
  };

  const savePrefs = async (newPrefs: typeof prefs) => {
    if (!userId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: userId,
          master_push: newPrefs.masterPush,
          messages: newPrefs.messages,
          crew_rooms: newPrefs.crewRooms,
          follows: newPrefs.follows,
          comments: newPrefs.comments,
          replies: newPrefs.replies,
          mentions: newPrefs.mentions,
          tags: newPrefs.tags,
          likes: newPrefs.likes,
          updates: newPrefs.updates,
          email: newPrefs.email,
        });
      if (error) {
        Alert.alert('Error', 'Failed to save preferences');
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn}>
            <Text style={styles.headerBack}>{'<'}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Notification Settings</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView
          contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          refreshControl={
            <RefreshControl
              refreshing={notifSettingsPullRefreshing}
              onRefresh={onNotifSettingsPullRefresh}
              colors={REFRESH_CONTROL_COLORS}
              tintColor={REFRESH_TINT}
            />
          }
        >
          <ActivityIndicator size="large" color={colors.headerRed} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={styles.headerBack}>{'<'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={notifSettingsPullRefreshing}
            onRefresh={onNotifSettingsPullRefresh}
            colors={REFRESH_CONTROL_COLORS}
            tintColor={REFRESH_TINT}
          />
        }
      >
        <Text style={styles.sectionTitle}>Push Notifications</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Enable Push Notifications</Text>
          <Switch value={prefs.masterPush} onValueChange={(v: boolean) => handleToggle('masterPush', v)} disabled={saving} />
        </View>
        <Text style={styles.sectionTitle}>Activity Notifications</Text>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Messages</Text><Switch value={prefs.messages} onValueChange={(v: boolean) => handleToggle('messages', v)} disabled={!prefs.masterPush || saving} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Crew Rooms</Text><Switch value={prefs.crewRooms} onValueChange={(v: boolean) => handleToggle('crewRooms', v)} disabled={!prefs.masterPush || saving} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Follows</Text><Switch value={prefs.follows} onValueChange={(v: boolean) => handleToggle('follows', v)} disabled={!prefs.masterPush || saving} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Comments</Text><Switch value={prefs.comments} onValueChange={(v: boolean) => handleToggle('comments', v)} disabled={!prefs.masterPush || saving} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Replies</Text><Switch value={prefs.replies} onValueChange={(v: boolean) => handleToggle('replies', v)} disabled={!prefs.masterPush || saving} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Mentions</Text><Switch value={prefs.mentions} onValueChange={(v: boolean) => handleToggle('mentions', v)} disabled={!prefs.masterPush || saving} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Tags</Text><Switch value={prefs.tags} onValueChange={(v: boolean) => handleToggle('tags', v)} disabled={!prefs.masterPush || saving} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Likes/Reactions</Text><Switch value={prefs.likes} onValueChange={(v: boolean) => handleToggle('likes', v)} disabled={!prefs.masterPush || saving} /></View>
        <Text style={styles.sectionTitle}>App / System Notifications</Text>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>App/Product Updates</Text><Switch value={prefs.updates} onValueChange={(v: boolean) => handleToggle('updates', v)} disabled={saving} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Email Notifications</Text><Switch value={prefs.email} onValueChange={(v: boolean) => handleToggle('email', v)} disabled={saving} /></View>
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
});
