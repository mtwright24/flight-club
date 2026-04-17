import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../../styles/theme';
import { useAuth } from '../../hooks/useAuth';
import {
  deleteStaffLoadRequest,
  getStaffLoadRequestDetail,
  isStaffRequestPinned,
  pinStaffRequestForUser,
  updateStaffRequestSettings,
  upgradeStaffRequestToPriority,
} from '../../lib/supabase/staffLoads';

export type StaffLoadsRequestActionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  request: {
    id: string;
    user_id: string;
    airline_code: string;
    from_airport: string;
    to_airport: string;
    travel_date: string;
    request_kind: 'standard' | 'priority';
    enable_status_updates: boolean;
    enable_auto_updates: boolean;
    status: string;
  } | null;
  mine: boolean;
  onAfterMutation?: () => void;
  /** If delete succeeds, e.g. `() => router.back()` when this sheet was opened from request detail. */
  onDeleted?: () => void;
};

/**
 * Shared “More actions” sheet — same entries as load-request detail (kebab / footer).
 */
export function StaffLoadsRequestActionsSheet({
  visible,
  onClose,
  request,
  mine,
  onAfterMutation,
  onDeleted,
}: StaffLoadsRequestActionsSheetProps) {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!visible || !request || !userId) return;
    void (async () => {
      const p = await isStaffRequestPinned(userId, request.id);
      if (!cancelled) setPinned(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, request, userId]);

  if (!request) return null;

  const mutate = () => {
    onAfterMutation?.();
  };

  const run = async (action: string) => {
    if (!userId) return;

    if (action === 'delete' && mine) {
      onClose();
      Alert.alert('Delete request?', 'Credits will be refunded if there are no answers yet.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const d = await deleteStaffLoadRequest(request.id);
            if (!d.ok) Alert.alert('Delete', d.error || 'Failed');
            else {
              mutate();
              onDeleted?.();
            }
          },
        },
      ]);
      return;
    }

    onClose();

    if (action === 'upgrade' && mine) {
      const r = await upgradeStaffRequestToPriority(request.id);
      if (!r.ok) {
        const e = r.error || '';
        if (e.includes('insufficient') || e.includes('credit')) {
          Alert.alert('Not enough credits', 'Upgrade costs 1 additional credit. Add credits in the Wallet tab.', [
            { text: 'Wallet', onPress: () => router.push('/loads?tab=wallet' as const) },
            { text: 'OK', style: 'cancel' },
          ]);
        } else Alert.alert('Upgrade', e || 'Could not upgrade.');
      }
      mutate();
      return;
    }

    if (action === 'pin') {
      const next = !pinned;
      const r = await pinStaffRequestForUser(userId, request.id, next);
      if (r.ok) setPinned(next);
      mutate();
      return;
    }

    if (action === 'status' && mine) {
      await updateStaffRequestSettings(request.id, {
        enable_status_updates: !request.enable_status_updates,
      });
      mutate();
      return;
    }

    if (action === 'auto' && mine) {
      await updateStaffRequestSettings(request.id, { enable_auto_updates: !request.enable_auto_updates });
      mutate();
      return;
    }

    if (action === 'share') {
      const url = `flightclub://loads/request/${request.id}`;
      await Share.share({
        message: `${request.airline_code} ${request.from_airport}→${request.to_airport} ${request.travel_date}\n${url}`,
      });
      return;
    }

    if (action === 'report') {
      const d = await getStaffLoadRequestDetail(request.id);
      const answers = d.answers || [];
      const latest = answers.find((a) => a.is_latest) ?? answers[0];
      if (!latest) {
        Alert.alert('Nothing to report', 'There is no loads answer on this request yet.');
        return;
      }
      router.push(`/loads/request/${request.id}?focusReport=1`);
      mutate();
      return;
    }

    if (action === 'history') {
      router.push(`/loads/request/${request.id}/history`);
      mutate();
      return;
    }

    if (action === 'update' && mine) {
      router.push(`/loads/request/${request.id}?focusRefresh=1`);
      mutate();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>More actions</Text>
          {mine ? (
            <>
              <Pressable style={styles.row} onPress={() => void run('update')}>
                <Text style={styles.tx}>Request update</Text>
              </Pressable>
              {request.request_kind === 'standard' ? (
                <Pressable style={styles.row} onPress={() => void run('upgrade')}>
                  <Text style={styles.tx}>Upgrade to priority (+1 credit)</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.row} onPress={() => void run('status')}>
                <Text style={styles.tx}>Status updates: {request.enable_status_updates ? 'On' : 'Off'}</Text>
              </Pressable>
              <Pressable style={styles.row} onPress={() => void run('auto')}>
                <Text style={styles.tx}>Auto updates: {request.enable_auto_updates ? 'On' : 'Off'}</Text>
              </Pressable>
              <Pressable style={styles.row} onPress={() => void run('delete')}>
                <Text style={[styles.tx, { color: '#b91c1c' }]}>Delete request</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable style={styles.row} onPress={() => void run('history')}>
            <Text style={styles.tx}>View loads history</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => void run('pin')}>
            <Text style={styles.tx}>{pinned ? 'Unpin' : 'Pin'} flight</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => void run('report')}>
            <Text style={styles.tx}>Report inaccurate loads</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => void run('share')}>
            <Text style={styles.tx}>Share request</Text>
          </Pressable>
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeTx}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 28 },
  title: { fontWeight: '900', fontSize: 17, marginBottom: 8, color: '#0f172a' },
  row: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  tx: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  close: { marginTop: 12, alignItems: 'center', paddingVertical: 12 },
  closeTx: { color: colors.headerRed, fontWeight: '800', fontSize: 16 },
});
