import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { PermissionStatus } from 'expo-modules-core';
import { getPermissionsAsync } from '../../lib/push/expoNotificationsApi';
import { Ionicons } from '@expo/vector-icons';

import {
  requestLocalNotificationPermissions,
  scheduleTestLocalNotification,
  type LocalNotificationPermissionResult,
} from '../../lib/notifications/localNotificationTest';
import { scheduleDevSimulatedPushPayload } from '../../lib/notifications/devNotificationSimulations';
import { colors, radius, spacing } from '../../src/styles/theme';

export default function LocalNotificationTestScreen() {
  const router = useRouter();
  const [permission, setPermission] = useState<'granted' | 'denied' | 'unknown' | 'undetermined'>('unknown');

  const refreshPermissionLabel = useCallback(async () => {
    try {
      const { status } = await getPermissionsAsync();
      if (status === PermissionStatus.GRANTED) setPermission('granted');
      else if (status === PermissionStatus.DENIED) setPermission('denied');
      else setPermission('undetermined');
    } catch {
      setPermission('unknown');
    }
  }, []);

  useEffect(() => {
    void refreshPermissionLabel();
  }, [refreshPermissionLabel]);

  const mapResult = (r: LocalNotificationPermissionResult) => {
    if (r === 'granted') return 'granted' as const;
    if (r === 'denied') return 'denied' as const;
    return 'undetermined' as const;
  };

  const onRequestPermission = async () => {
    const result = await requestLocalNotificationPermissions();
    setPermission(mapResult(result));
    console.log('[LocalNotifTest] permission flow result', result);
  };

  const onSendTest = async () => {
    const result = await requestLocalNotificationPermissions();
    setPermission(mapResult(result));
    if (result !== 'granted') {
      Alert.alert(
        'Notifications required',
        'Allow notifications for Flight Club to receive the test alert.',
        [{ text: 'OK' }]
      );
      console.log('[LocalNotifTest] schedule skipped — permission not granted', result);
      return;
    }

    const id = await scheduleTestLocalNotification();
    if (id) {
      console.log('[LocalNotifTest] test schedule success', id);
    } else {
      Alert.alert('Schedule failed', 'Could not schedule the test notification. See Metro logs for details.', [
        { text: 'OK' },
      ]);
    }
  };

  const statusLine =
    permission === 'unknown'
      ? 'Permission: unknown (tap Request to refresh)'
      : permission === 'granted'
        ? 'Permission: granted'
        : permission === 'denied'
          ? 'Permission: denied'
          : 'Permission: undetermined';

  const sim = async (label: string, fn: () => Promise<string | null>) => {
    const perm = await requestLocalNotificationPermissions();
    setPermission(mapResult(perm));
    if (perm !== 'granted') {
      Alert.alert('Notifications required', `Allow notifications to run "${label}".`, [{ text: 'OK' }]);
      return;
    }
    const nid = await fn();
    console.log('[DevSim]', label, nid ?? 'failed');
  };

  return (
    <SafeAreaView style={styles.wrap} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Local notification test</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollInner}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notification Test</Text>
          <Text style={styles.status}>{statusLine}</Text>

          <Pressable style={styles.btn} onPress={onRequestPermission}>
            <Text style={styles.btnText}>Request Notification Permission</Text>
          </Pressable>

          <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onSendTest}>
            <Text style={styles.btnText}>Send Test Notification (5s)</Text>
          </Pressable>
        </View>

        {__DEV__ ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Simulate push payload (3s)</Text>
            <Text style={styles.hint}>
              Schedules local alerts using the same data shape as remote Expo pushes — tap to verify routing.
            </Text>
            <Pressable style={styles.btnOutline} onPress={() => sim('DM', () => scheduleDevSimulatedPushPayload('dm'))}>
              <Text style={styles.btnOutlineText}>Simulate DM</Text>
            </Pressable>
            <Pressable
              style={styles.btnOutline}
              onPress={() => sim('Comment', () => scheduleDevSimulatedPushPayload('comment'))}
            >
              <Text style={styles.btnOutlineText}>Simulate comment</Text>
            </Pressable>
            <Pressable
              style={styles.btnOutline}
              onPress={() => sim('Room reply', () => scheduleDevSimulatedPushPayload('room_reply'))}
            >
              <Text style={styles.btnOutlineText}>Simulate room reply</Text>
            </Pressable>
            <Pressable style={styles.btnOutline} onPress={() => sim('Trade', () => scheduleDevSimulatedPushPayload('trade'))}>
              <Text style={styles.btnOutlineText}>Simulate trade interest</Text>
            </Pressable>
            <Pressable
              style={styles.btnOutline}
              onPress={() => sim('Housing', () => scheduleDevSimulatedPushPayload('housing'))}
            >
              <Text style={styles.btnOutlineText}>Simulate housing alert</Text>
            </Pressable>
            <Pressable
              style={styles.btnOutline}
              onPress={() => sim('System', () => scheduleDevSimulatedPushPayload('system'))}
            >
              <Text style={styles.btnOutlineText}>Simulate system / inbox</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollInner: { paddingBottom: spacing.xl },
  wrap: { flex: 1, backgroundColor: colors.screenBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { paddingVertical: spacing.xs },
  headerSpacer: { width: 36 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  card: {
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  status: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md },
  btn: {
    backgroundColor: colors.textPrimary,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  btnSecondary: { backgroundColor: '#B5161E' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
  btnOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginBottom: spacing.xs,
    backgroundColor: colors.screenBg,
  },
  btnOutlineText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
});
