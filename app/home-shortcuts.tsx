import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getHomeToolShortcutIds,
  MAX_HOME_TOOL_SHORTCUTS,
  setHomeToolShortcutIds,
} from '../lib/homeShortcutsStorage';
import { toolsRegistry } from '../lib/toolsRegistry';
import { COLORS, RADIUS, SPACING } from '../src/styles/theme';
import { useAuth } from '../src/hooks/useAuth';

export default function HomeShortcutsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) {
      setSelected([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getHomeToolShortcutIds(userId)
      .then(setSelected)
      .finally(() => setLoading(false));
  }, [userId]);

  const toggle = useCallback(
    (toolId: string, on: boolean) => {
      setSelected((prev) => {
        if (on) {
          if (prev.includes(toolId)) return prev;
          if (prev.length >= MAX_HOME_TOOL_SHORTCUTS) {
            Alert.alert(
              'Limit reached',
              `You can pin up to ${MAX_HOME_TOOL_SHORTCUTS} tools on Home. Turn one off to add another.`,
            );
            return prev;
          }
          return [...prev, toolId];
        }
        const next = prev.filter((id) => id !== toolId);
        if (next.length === 0) {
          Alert.alert('Keep at least one', 'Choose at least one shortcut for Home.');
          return prev;
        }
        return next;
      });
    },
    [],
  );

  const save = async () => {
    if (!userId) {
      Alert.alert('Sign in required', 'Sign in to save Home shortcuts.');
      return;
    }
    if (selected.length === 0) {
      Alert.alert('Keep at least one', 'Choose at least one shortcut.');
      return;
    }
    setSaving(true);
    try {
      await setHomeToolShortcutIds(userId, selected);
      Alert.alert('Saved', 'Your Home shortcuts are updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'Could not save shortcuts. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={COLORS.navy} />
        </Pressable>
        <Text style={styles.headerTitle}>Home shortcuts</Text>
        <View style={{ width: 26 }} />
      </View>
      <Text style={styles.subtitle}>
        Choose up to {MAX_HOME_TOOL_SHORTCUTS} tools to show on your Home screen. Pinned crew rooms you set in Crew
        Rooms still appear there automatically.
      </Text>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.red} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {toolsRegistry.map((tool) => {
            const on = selected.includes(tool.id);
            return (
              <View key={tool.id} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.toolTitle}>{tool.title}</Text>
                  <Text style={styles.toolDesc} numberOfLines={2}>
                    {tool.description}
                  </Text>
                </View>
                <Switch
                  value={on}
                  onValueChange={(v) => toggle(tool.id, v)}
                  trackColor={{ false: '#D1D5DB', true: '#FCA5A5' }}
                  thumbColor={on ? COLORS.red : '#f4f3f4'}
                />
              </View>
            );
          })}
          <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    backgroundColor: COLORS.card,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.navy },
  subtitle: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: 14,
    color: COLORS.text2,
    lineHeight: 20,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    gap: SPACING.md,
  },
  rowText: { flex: 1 },
  toolTitle: { fontSize: 16, fontWeight: '700', color: COLORS.navy },
  toolDesc: { fontSize: 13, color: COLORS.text2, marginTop: 4 },
  saveBtn: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.red,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
