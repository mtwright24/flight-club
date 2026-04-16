import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import LoadsSegmentedControl from '../../src/components/loads/LoadsSegmentedControl';
import {
  AirlineMonogram,
  STAFF_LOADS_VISUAL,
  StaffChip,
  StaffLoadsCardShell,
  formatLocalHm,
  formatTravelDateShort,
  staffLoadsListAccentStrip,
} from '../../src/components/loads/StaffLoadsRequestPresentation';
import { useAuth } from '../../src/hooks/useAuth';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import {
  devReseedStaffLoadsDemoFixtures,
  isMarshaDemoUser,
  listStaffLoadRequests,
  listUserAirlineAccess,
  setUserAirlineAccess,
  type StaffLoadRequestRow,
} from '../../src/lib/supabase/staffLoads';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';
import { colors } from '../../src/styles/theme';

function lockLabel(r: StaffLoadRequestRow, now: number): string | null {
  if (!r.locked_by || !r.lock_expires_at) return null;
  const exp = new Date(r.lock_expires_at).getTime();
  if (exp < now) return null;
  return 'Being answered…';
}

function RequestRow({ r, now, userId }: { r: StaffLoadRequestRow; now: number; userId: string | undefined }) {
  const router = useRouter();
  const lock = lockLabel(r, now);
  const mine = r.user_id === userId;
  const canAnswer = !mine && (r.status === 'open' || r.status === 'answered') && !lock;
  const accent = staffLoadsListAccentStrip(r, now);
  const dep = formatLocalHm(r.depart_at);
  const arr = formatLocalHm(r.arrive_at);
  const dateLine = formatTravelDateShort(r.travel_date);

  const statusChip =
    r.status === 'answered'
      ? { label: 'Answered', bg: STAFF_LOADS_VISUAL.chip.bgAnswered, fg: STAFF_LOADS_VISUAL.chip.fgAnswered }
      : r.status === 'stale'
        ? { label: 'Stale', bg: STAFF_LOADS_VISUAL.chip.bgStale, fg: STAFF_LOADS_VISUAL.chip.fgStale }
        : { label: 'Open', bg: STAFF_LOADS_VISUAL.chip.bgOpen, fg: STAFF_LOADS_VISUAL.chip.fgOpen };

  return (
    <Pressable style={styles.cardOuter} onPress={() => router.push(`/loads/request/${r.id}`)}>
      <StaffLoadsCardShell accentColor={accent} style={styles.cardShell}>
        <View style={styles.tileTop}>
          <AirlineMonogram code={r.airline_code} />
          <View style={styles.tileMain}>
            <View style={styles.tileTitleRow}>
              <Text style={styles.tileFlight}>
                {r.airline_code} {r.flight_number || '—'}
              </Text>
              <View style={styles.tileChipsRight}>
                <StaffChip label={statusChip.label} backgroundColor={statusChip.bg} color={statusChip.fg} />
              </View>
            </View>
            <Text style={styles.tileRoute}>
              {r.from_airport} → {r.to_airport}
            </Text>
            <View style={styles.tileMetaLine}>
              <Text style={styles.tileDate}>{dateLine}</Text>
              <Text style={styles.tileDot}>·</Text>
              <Text style={styles.tileTimes}>
                {dep} – {arr}
              </Text>
            </View>
            <View style={styles.tileStateRow}>
              {r.request_kind === 'priority' ? (
                <StaffChip
                  label="Priority"
                  backgroundColor={STAFF_LOADS_VISUAL.chip.bgPriority}
                  color={STAFF_LOADS_VISUAL.chip.fgPriority}
                />
              ) : null}
              {mine ? (
                <StaffChip
                  label="Your request"
                  backgroundColor={STAFF_LOADS_VISUAL.chip.bgMine}
                  color={STAFF_LOADS_VISUAL.chip.fgMine}
                />
              ) : null}
              {r.refresh_requested_at ? (
                <StaffChip
                  label="Needs refresh"
                  backgroundColor={STAFF_LOADS_VISUAL.chip.bgRefresh}
                  color={STAFF_LOADS_VISUAL.chip.fgRefresh}
                />
              ) : null}
              {lock ? (
                <StaffChip
                  label="Being answered"
                  backgroundColor={STAFF_LOADS_VISUAL.chip.bgLock}
                  color={STAFF_LOADS_VISUAL.chip.fgLock}
                />
              ) : null}
            </View>
          </View>
        </View>
        {!mine && r.requester?.display_name ? (
          <Text style={styles.reqBySm} numberOfLines={1}>
            {r.requester.display_name}
          </Text>
        ) : null}
        {canAnswer ? (
          <Pressable style={styles.answerBtn} onPress={() => router.push(`/loads/answer/${r.id}`)}>
            <Text style={styles.answerBtnTx}>Answer</Text>
          </Pressable>
        ) : null}
      </StaffLoadsCardShell>
    </Pressable>
  );
}

const ALL_AIR_LIST = ['B6', 'AA', 'DL', 'UA', 'WN'] as const;
const ALL_AIR = [...ALL_AIR_LIST];

export default function LoadsRequestsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  const [tab, setTab] = useState<'open' | 'answered'>('open');
  const [rows, setRows] = useState<StaffLoadRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [airModal, setAirModal] = useState(false);
  const [airAccess, setAirAccess] = useState<string[]>(ALL_AIR);
  const [devSeedBusy, setDevSeedBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await listStaffLoadRequests(tab);
    if (userId) {
      const { codes } = await listUserAirlineAccess(userId);
      setAirAccess(codes.length ? [...codes] : [...ALL_AIR]);
    } else {
      setAirAccess([...ALL_AIR]);
    }
    setRows(res.data || []);
    setError(res.error || '');
    setNow(Date.now());
    setLoading(false);
  }, [tab, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const sections = useMemo(() => {
    const pri = rows.filter((r) => r.request_kind === 'priority');
    const rest = rows.filter((r) => r.request_kind !== 'priority');
    const byAirline: Record<string, StaffLoadRequestRow[]> = {};
    for (const r of rest) {
      const k = r.airline_code || 'Other';
      if (!byAirline[k]) byAirline[k] = [];
      byAirline[k].push(r);
    }
    const out: { title: string; data: StaffLoadRequestRow[] }[] = [];
    if (pri.length) out.push({ title: 'Priority requests', data: pri });
    const airlines = Object.keys(byAirline).sort();
    for (const a of airlines) {
      out.push({ title: `${a} · ${tab} requests`, data: byAirline[a] });
    }
    return out;
  }, [rows, tab]);

  const listHeader = (
    <>
      <LoadsSegmentedControl
        tabs={['Open', 'Answered']}
        selectedIndex={tab === 'open' ? 0 : 1}
        onTabPress={(i) => setTab(i === 0 ? 'open' : 'answered')}
      />
      <Pressable style={styles.airBtn} onPress={() => setAirModal(true)}>
        <Text style={styles.airBtnTx}>Airlines you can answer for</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.headerRed} />
      </Pressable>
      {__DEV__ && isMarshaDemoUser(userId, userEmail) ? (
        <Pressable
          style={styles.devSeedBtn}
          disabled={devSeedBusy}
          onPress={async () => {
            setDevSeedBusy(true);
            try {
              const r = await devReseedStaffLoadsDemoFixtures();
              if (!r.ok) {
                Alert.alert('Demo seed', r.error || 'RPC failed. Apply latest Supabase migrations (includes rpc_staff_loads_dev_reseed_demos).');
              } else {
                const msg = r.result?.skipped ? 'Already present (skipped).' : JSON.stringify(r.result ?? {});
                Alert.alert('Demo seed', String(msg));
              }
              void load();
            } finally {
              setDevSeedBusy(false);
            }
          }}
        >
          <Text style={styles.devSeedTx}>{devSeedBusy ? 'Seeding…' : 'Re-seed Staff Loads demos (dev)'}</Text>
        </Pressable>
      ) : null}
      {loading ? <ActivityIndicator style={{ marginTop: 20 }} color={colors.headerRed} /> : null}
      {!loading && error && rows.length > 0 ? <Text style={styles.errorText}>{error}</Text> : null}
    </>
  );

  return (
    <View style={styles.container}>
      <Modal visible={airModal} transparent animationType="fade" onRequestClose={() => setAirModal(false)}>
        <Pressable style={styles.modalBg} onPress={() => setAirModal(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Additional airlines</Text>
            <Text style={styles.modalSub}>
              Saved airlines control which open requests you see (besides your own). Leave all on to answer any carrier,
              or turn off carriers you don’t report for.
            </Text>
            {ALL_AIR_LIST.map((code) => (
              <View key={code} style={styles.swRow}>
                <Text style={styles.swLabel}>{code}</Text>
                <Switch
                  value={airAccess.includes(code)}
                  onValueChange={(v) => {
                    setAirAccess((prev) => {
                      const next = v ? [...new Set([...prev, code])] : prev.filter((c) => c !== code);
                      return next.length ? next : [...ALL_AIR];
                    });
                  }}
                />
              </View>
            ))}
            <Pressable
              style={styles.saveAir}
              onPress={async () => {
                if (userId) await setUserAirlineAccess(userId, airAccess);
                setAirModal(false);
                void load();
              }}
            >
              <Text style={styles.saveAirTx}>Save</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <SectionList
        sections={sections.length ? sections : [{ title: '', data: [] }]}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RequestRow r={item} now={now} userId={userId} />}
        renderSectionHeader={({ section: { title } }) =>
          title ? (
            <View style={styles.sectionHeadWrap} key={title}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionHead}>{title}</Text>
            </View>
          ) : (
            <View key="empty-head" />
          )
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              {error ? (
                <>
                  <Ionicons name="warning-outline" size={44} color={colors.headerRed} />
                  <Text style={styles.errorText}>{error}</Text>
                  <Text style={styles.emptySub}>Pull to refresh after migrations or network issues.</Text>
                </>
              ) : (
                <>
                  <Ionicons name="list-outline" size={48} color="#ddd" />
                  <Text style={styles.emptyText}>No {tab} requests right now.</Text>
                  <Text style={styles.emptySub}>
                    Search on the Loads tab to post, or widen “Airlines you can answer for” if the list looks empty.
                  </Text>
                </>
              )}
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={REFRESH_CONTROL_COLORS} tintColor={REFRESH_TINT} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 8 },
  sectionHeadWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 4,
    marginLeft: 8,
    marginRight: 8,
  },
  sectionAccent: { width: 3, height: 14, borderRadius: 2, backgroundColor: colors.headerRed, opacity: 0.85 },
  sectionHead: { fontWeight: '800', fontSize: 12, color: '#64748b', letterSpacing: 0.6, textTransform: 'uppercase' },
  errorText: { color: colors.headerRed, fontWeight: '700', fontSize: 15, textAlign: 'center', marginTop: 16 },
  emptyState: { alignItems: 'center', marginTop: 40, paddingHorizontal: 24 },
  emptyText: { color: '#64748b', fontSize: 16, marginTop: 12, fontWeight: '700' },
  emptySub: { color: '#94a3b8', fontSize: 14, marginTop: 8, textAlign: 'center' },
  cardOuter: { marginVertical: 5, marginHorizontal: 8 },
  cardShell: { marginHorizontal: 0 },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tileMain: { flex: 1, minWidth: 0 },
  tileTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tileFlight: { fontWeight: '900', fontSize: 17, color: '#0f172a', letterSpacing: -0.3 },
  tileChipsRight: { flexShrink: 0 },
  tileRoute: { fontWeight: '700', fontSize: 15, color: '#334155', marginTop: 4, letterSpacing: 0.2 },
  tileMetaLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tileDate: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  tileDot: { fontSize: 13, color: '#cbd5e1', fontWeight: '700' },
  tileTimes: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  tileStateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' },
  reqBySm: { marginTop: 10, fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  answerBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: colors.headerRed,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  answerBtnTx: { color: '#fff', fontWeight: '800', fontSize: 14 },
  airBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 8,
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  airBtnTx: { fontWeight: '800', color: colors.headerRed, fontSize: 14 },
  devSeedBtn: {
    marginHorizontal: 8,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    alignItems: 'center',
  },
  devSeedTx: { color: '#fff', fontWeight: '800', fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  modalTitle: { fontWeight: '900', fontSize: 18, color: '#0f172a' },
  modalSub: { color: '#64748b', marginTop: 8, marginBottom: 12, lineHeight: 20 },
  swRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  swLabel: { fontWeight: '800', fontSize: 16, color: '#334155' },
  saveAir: { marginTop: 16, backgroundColor: colors.headerRed, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveAirTx: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
