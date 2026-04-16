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
  Text,
  View,
} from 'react-native';
import LoadsSegmentedControl from '../../src/components/loads/LoadsSegmentedControl';
import {
  STAFF_LOADS_VISUAL,
  StaffChip,
  StaffLoadsCardShell,
  formatAnswerLoadPreviewLine,
  staffLoadsListAccentStrip,
} from '../../src/components/loads/StaffLoadsRequestPresentation';
import { StaffLoadsTileInner } from '../../src/components/loads/StaffLoadsTileInner';
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

function RequestRow({ r, now }: { r: StaffLoadRequestRow; now: number }) {
  const router = useRouter();
  const lock = lockLabel(r, now);
  const canAnswer = (r.status === 'open' || r.status === 'answered') && !lock;
  const accent = staffLoadsListAccentStrip(r, now);

  const preview =
    r.status === 'answered'
      ? formatAnswerLoadPreviewLine(r.latest_answer_open_seats_total, r.latest_answer_nonrev_listed_total) ??
        '— open · — listed'
      : null;

  return (
    <Pressable style={styles.cardOuter} onPress={() => router.push(`/loads/request/${r.id}`)}>
      <StaffLoadsCardShell accentColor={accent} style={styles.cardShell} compact>
        <View>
          <StaffLoadsTileInner
            airlineCode={r.airline_code}
            flightNumber={r.flight_number}
            fromAirport={r.from_airport}
            toAirport={r.to_airport}
            travelDate={r.travel_date}
            departAt={r.depart_at}
            arriveAt={r.arrive_at}
            aircraftType={r.aircraft_type ?? null}
            flightIdForPlaceholder={r.id}
            previewLine={preview}
            trailingBadge={
              r.request_kind === 'priority' ? (
                <StaffChip
                  label="Priority"
                  backgroundColor={STAFF_LOADS_VISUAL.chip.bgPriority}
                  color={STAFF_LOADS_VISUAL.chip.fgPriority}
                />
              ) : null
            }
          />
          {r.refresh_requested_at ? (
            <View style={styles.refreshChipRow}>
              <StaffChip
                label="Needs refresh"
                backgroundColor={STAFF_LOADS_VISUAL.chip.bgRefresh}
                color={STAFF_LOADS_VISUAL.chip.fgRefresh}
              />
            </View>
          ) : null}
        </View>
        {r.requester?.display_name ? (
          <Text style={styles.reqBySm} numberOfLines={1}>
            Requested by {r.requester.display_name}
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

function airlineMatchesAccess(code: string, airAccess: string[]): boolean {
  if (airAccess.length >= ALL_AIR.length && ALL_AIR.every((a) => airAccess.includes(a))) return true;
  return airAccess.includes(code);
}

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

  const responderQueue = useMemo(() => {
    return rows.filter((r) => {
      if (userId && r.user_id === userId) return false;
      if (!userId) return true;
      return airlineMatchesAccess(r.airline_code, airAccess);
    });
  }, [rows, userId, airAccess]);

  const sections = useMemo(() => {
    const pri = responderQueue.filter((r) => r.request_kind === 'priority');
    const rest = responderQueue.filter((r) => r.request_kind !== 'priority');
    const byAirline: Record<string, StaffLoadRequestRow[]> = {};
    for (const r of rest) {
      const k = r.airline_code || 'Other';
      if (!byAirline[k]) byAirline[k] = [];
      byAirline[k].push(r);
    }
    const out: { title: string; data: StaffLoadRequestRow[] }[] = [];
    if (pri.length) out.push({ title: 'Priority · needs your help', data: pri });
    const airlines = Object.keys(byAirline).sort();
    for (const a of airlines) {
      out.push({ title: `${a} · ${tab} · for you`, data: byAirline[a] });
    }
    return out;
  }, [responderQueue, tab]);

  const listHeader = (
    <>
      <LoadsSegmentedControl
        tabs={['Open', 'Answered']}
        selectedIndex={tab === 'open' ? 0 : 1}
        onTabPress={(i) => setTab(i === 0 ? 'open' : 'answered')}
      />
      <Text style={styles.queueExplainer}>
        Other crew members’ requests you can answer — not your own. Your own posts stay on the Loads tab.
      </Text>
      <Pressable style={styles.airBtn} onPress={() => setAirModal(true)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.airBtnTx}>Carriers in your queue</Text>
          <Text style={styles.airBtnSub}>Tap to add or remove airlines you report loads for.</Text>
        </View>
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
      {!loading && error && responderQueue.length > 0 ? <Text style={styles.errorText}>{error}</Text> : null}
    </>
  );

  return (
    <View style={styles.container}>
      <Modal visible={airModal} transparent animationType="fade" onRequestClose={() => setAirModal(false)}>
        <Pressable style={styles.modalBg} onPress={() => setAirModal(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Additional carriers</Text>
            <Text style={styles.modalSub}>
              Choose which airlines’ requests appear in your queue. Select all to see every carrier; remove carriers you do not
              answer for.
            </Text>
            {ALL_AIR_LIST.map((code) => {
              const on = airAccess.includes(code);
              return (
                <Pressable
                  key={code}
                  style={styles.airlinePickRow}
                  onPress={() => {
                    setAirAccess((prev) => {
                      const next = !on ? [...new Set([...prev, code])] : prev.filter((c) => c !== code);
                      return next.length ? next : [...ALL_AIR];
                    });
                  }}
                >
                  <Text style={styles.swLabel}>{code}</Text>
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? colors.headerRed : '#cbd5e1'} />
                </Pressable>
              );
            })}
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
        renderItem={({ item }) => <RequestRow r={item} now={now} />}
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
                    When other crew post requests on carriers you answer for, they’ll show here. Widen “Airlines you can answer
                    for” if needed. Your own requests stay on the Loads tab.
                  </Text>
                </>
              )}
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
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
  refreshChipRow: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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
  queueExplainer: {
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    lineHeight: 19,
  },
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
  airBtnSub: { fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: '500', lineHeight: 16 },
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
  airlinePickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  swLabel: { fontWeight: '800', fontSize: 16, color: '#334155' },
  saveAir: { marginTop: 16, backgroundColor: colors.headerRed, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveAirTx: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
