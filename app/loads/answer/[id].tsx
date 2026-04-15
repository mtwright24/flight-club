import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../../../src/components/FlightClubHeader';
import {
  getStaffLoadRequestDetail,
  releaseStaffRequestLock,
  submitStaffLoadAnswer,
  tryAcquireStaffRequestLock,
  type StaffLoadRequestRow,
} from '../../../src/lib/supabase/staffLoads';
import { useAuth } from '../../../src/hooks/useAuth';
import { colors } from '../../../src/styles/theme';

function parseNonNegInt(s: string): number {
  const n = parseInt(s.replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function AnswerStaffLoadRequestScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [request, setRequest] = useState<StaffLoadRequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [lockOk, setLockOk] = useState(false);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [loadLevel, setLoadLevel] = useState('LIGHT');
  const [notes, setNotes] = useState('');
  const [openTotal, setOpenTotal] = useState('');
  const [openFirst, setOpenFirst] = useState('');
  const [openMain, setOpenMain] = useState('');
  const [nonrevTotal, setNonrevTotal] = useState('');
  const [nonrevFirst, setNonrevFirst] = useState('');
  const [nonrevMain, setNonrevMain] = useState('');
  const [busy, setBusy] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLockMessage(null);
    const d = await getStaffLoadRequestDetail(id);
    const r = d.request;
    setRequest(r);
    if (!r) {
      setLockOk(false);
      setLoading(false);
      return;
    }
    if (!userId) {
      setLockOk(false);
      setLockMessage('Sign in to answer requests.');
      setLoading(false);
      return;
    }
    if (r.user_id === userId) {
      setLockOk(false);
      setLoading(false);
      return;
    }
    if (r.status !== 'open' && r.status !== 'answered') {
      setLockOk(false);
      setLockMessage(
        r.status === 'stale'
          ? 'This request is marked stale. Ask the requester to reopen it before new loads can be posted.'
          : `This request is ${r.status} and can’t be answered here.`
      );
      setLoading(false);
      return;
    }

    const lk = await tryAcquireStaffRequestLock(id);
    setLockOk(lk.ok);
    if (!lk.ok) {
      if (lk.lockedByOther) {
        setLockMessage('Another crew member is answering this request right now. Try again shortly.');
      } else if (lk.error === 'airline_not_allowed') {
        setLockMessage(
          'You’re not set up to answer for this airline yet. Add it under “Airlines you can answer for” on the Requests tab.'
        );
      } else if (lk.error === 'not_open') {
        setLockMessage('This request is no longer open.');
      } else {
        setLockMessage('Unable to start answering. Pull to refresh or try again in a moment.');
      }
    }
    setLoading(false);
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!request?.lock_expires_at || !lockOk) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [request?.lock_expires_at, lockOk]);

  useEffect(() => {
    return () => {
      if (id && lockOk) void releaseStaffRequestLock(id);
    };
  }, [id, lockOk]);

  const onSubmit = async () => {
    if (!id || !lockOk) return;

    const oFirst = parseNonNegInt(openFirst);
    const oMain = parseNonNegInt(openMain);
    const oTotIn = parseNonNegInt(openTotal);
    const oSum = oFirst + oMain;
    const openSeatsTotal = oTotIn > 0 ? oTotIn : oSum;

    const nFirst = parseNonNegInt(nonrevFirst);
    const nMain = parseNonNegInt(nonrevMain);
    const nTotIn = parseNonNegInt(nonrevTotal);
    const nSum = nFirst + nMain;
    const nonrevListedTotal = nTotIn > 0 ? nTotIn : nSum;

    const openSeatsByCabin: Record<string, number> = {};
    if (oFirst > 0) openSeatsByCabin.first = oFirst;
    if (oMain > 0) openSeatsByCabin.main = oMain;

    const nonrevByCabin: Record<string, number> = {};
    if (nFirst > 0) nonrevByCabin.first = nFirst;
    if (nMain > 0) nonrevByCabin.main = nMain;

    const hasAnyCount =
      openSeatsTotal > 0 || nonrevListedTotal > 0 || Object.keys(openSeatsByCabin).length > 0 || Object.keys(nonrevByCabin).length > 0;
    if (!hasAnyCount && !notes.trim()) {
      Alert.alert('Add loads', 'Enter seat or non-rev counts, or add a short note.');
      return;
    }

    setBusy(true);
    const res = await submitStaffLoadAnswer(id, {
      loadLevel,
      notes,
      answerSource: 'community',
      openSeatsTotal: openSeatsTotal > 0 ? openSeatsTotal : null,
      openSeatsByCabin: Object.keys(openSeatsByCabin).length ? openSeatsByCabin : null,
      nonrevListedTotal: nonrevListedTotal > 0 ? nonrevListedTotal : null,
      nonrevByCabin: Object.keys(nonrevByCabin).length ? nonrevByCabin : null,
    });
    setBusy(false);
    if (!res.ok) {
      const msg = res.error || '';
      if (msg.includes('not_locked_by_you') || msg.includes('not_locked')) {
        Alert.alert('Lock expired', 'Your answer window closed. Try again to grab a fresh lock.', [
          { text: 'Retry', onPress: () => void load() },
          { text: 'Leave', style: 'cancel', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Could not submit', msg || 'Try again.');
      }
      return;
    }
    setLockOk(false);
    router.replace(`/loads/request/${id}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <FlightClubHeader title="Answer request" showLogo={false} />
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.headerRed} />
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <FlightClubHeader title="Answer request" showLogo={false} />
        <Text style={styles.err}>Request not found.</Text>
      </SafeAreaView>
    );
  }

  if (request.user_id === userId) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <FlightClubHeader title="Answer request" showLogo={false} />
        <Text style={styles.err}>You can’t answer your own request.</Text>
        <Pressable style={styles.btn} onPress={() => router.back()}>
          <Text style={styles.btnText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!userId) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <FlightClubHeader title="Answer request" showLogo={false} />
        <Text style={styles.err}>{lockMessage || 'Sign in to answer.'}</Text>
      </SafeAreaView>
    );
  }

  if (request.status !== 'open' && request.status !== 'answered') {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <FlightClubHeader title="Answer request" showLogo={false} />
        <Text style={styles.err}>{lockMessage || 'This request is not open for answers.'}</Text>
        <Pressable style={styles.btn} onPress={() => router.replace(`/loads/request/${id}`)}>
          <Text style={styles.btnText}>View request</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlightClubHeader title="Answer request" showLogo={false} />
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.card}>
          <Text style={styles.route}>
            {request.airline_code} {request.flight_number || ''} · {request.from_airport} → {request.to_airport}
          </Text>
          <Text style={styles.meta}>{request.travel_date}</Text>
          {!lockOk ? (
            <View style={styles.warn}>
              <Ionicons name="lock-closed" size={18} color="#92400e" />
              <Text style={styles.warnText}>{lockMessage || 'Unable to acquire a lock.'}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.ok}>You have an active lock to submit loads.</Text>
              {request.lock_expires_at ? (
                <Text style={styles.lockEta}>
                  {(() => {
                    const ms = new Date(request.lock_expires_at).getTime() - nowTick;
                    if (ms <= 0) return 'Lock ending — submit now or refresh.';
                    const s = Math.ceil(ms / 1000);
                    const m = Math.floor(s / 60);
                    const r = s % 60;
                    return `About ${m}:${r.toString().padStart(2, '0')} left on this lock`;
                  })()}
                </Text>
              ) : null}
            </>
          )}
          {!lockOk ? (
            <Pressable style={styles.retry} onPress={() => void load()}>
              <Text style={styles.retryTx}>Retry lock</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.label}>Overall load</Text>
        <View style={styles.row}>
          {(['LIGHT', 'MEDIUM', 'HEAVY', 'FULL'] as const).map((s) => (
            <Pressable key={s} style={[styles.pill, loadLevel === s && styles.pillOn]} onPress={() => setLoadLevel(s)}>
              <Text style={[styles.pillTx, loadLevel === s && styles.pillTxOn]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Open seats — total (optional if cabin rows sum)</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={openTotal} onChangeText={setOpenTotal} placeholder="e.g. 12" />

        <Text style={styles.label}>Open seats — first class</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={openFirst} onChangeText={setOpenFirst} placeholder="0" />

        <Text style={styles.label}>Open seats — main / economy</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={openMain} onChangeText={setOpenMain} placeholder="0" />

        <Text style={styles.label}>Listed non-rev — total (optional if cabin rows sum)</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={nonrevTotal} onChangeText={setNonrevTotal} placeholder="e.g. 4" />

        <Text style={styles.label}>Listed non-rev — first class</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={nonrevFirst} onChangeText={setNonrevFirst} placeholder="0" />

        <Text style={styles.label}>Listed non-rev — main / economy</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={nonrevMain} onChangeText={setNonrevMain} placeholder="0" />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          multiline
          value={notes}
          onChangeText={setNotes}
          placeholder="Gate, cabin mix, caveats…"
        />

        <Pressable
          style={[styles.submit, (!lockOk || busy) && styles.submitOff]}
          disabled={!lockOk || busy}
          onPress={() => void onSubmit()}
        >
          <Text style={styles.submitTx}>{busy ? 'Submitting…' : 'Submit answer'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  pad: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  route: { fontWeight: '800', fontSize: 16, color: '#0f172a' },
  meta: { color: '#64748b', marginTop: 6, fontWeight: '600' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: '#fffbeb', padding: 10, borderRadius: 10 },
  warnText: { flex: 1, color: '#92400e', fontWeight: '600', fontSize: 13 },
  ok: { marginTop: 10, color: '#15803d', fontWeight: '700', fontSize: 13 },
  lockEta: { marginTop: 6, color: '#475569', fontWeight: '700', fontSize: 12 },
  retry: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.headerRed,
  },
  retryTx: { fontWeight: '800', color: colors.headerRed, fontSize: 13 },
  label: { fontWeight: '700', color: '#334155', marginTop: 14, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#f1f5f9' },
  pillOn: { backgroundColor: colors.headerRed },
  pillTx: { fontWeight: '700', color: '#475569', fontSize: 12 },
  pillTxOn: { color: '#fff' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#0f172a',
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  submit: { marginTop: 24, backgroundColor: colors.headerRed, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitOff: { opacity: 0.45 },
  submitTx: { color: '#fff', fontWeight: '800', fontSize: 16 },
  err: { textAlign: 'center', marginTop: 24, color: '#64748b', fontWeight: '600', paddingHorizontal: 20 },
  btn: { marginTop: 16, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#e2e8f0', borderRadius: 12 },
  btnText: { fontWeight: '700', color: '#334155' },
});
