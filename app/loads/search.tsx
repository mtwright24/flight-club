import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AirportPickerModal } from '../../src/components/loads/AirportAirlinePickers';
import { FlightCard } from '../../src/components/loads/FlightCard';
import StaffLoadsSearchOptionsSheet from '../../src/components/loads/StaffLoadsSearchOptionsSheet';
import { useAuth } from '../../src/hooks/useAuth';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import {
  defaultStaffLoadSearchOptions,
  getStaffWalletSummary,
  listMyOpenStaffRequestsPreview,
  postStaffLoadRequests,
  type StaffLoadSearchOptions,
  type StaffRequestKind,
} from '../../src/lib/supabase/staffLoads';
import { searchFlights, type NonRevLoadFlight } from '../../src/lib/supabase/loads';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';
import { colors } from '../../src/styles/theme';
import {
  loadStaffLoadRecentSearches,
  persistStaffLoadRecentSearch,
  type StaffLoadRecentSearch,
} from '../../lib/staffLoadsRecentSearches';

function formatLoadsFlightLabel(item: NonRevLoadFlight): string {
  const code = (item.airline_code || '').toUpperCase();
  const num = (item.flight_number || '').trim();
  if (!num) return code;
  if (num.toUpperCase().startsWith(code)) return num;
  return `${code} ${num}`.trim();
}

function AirportAirlinePickers({
  from,
  setFrom,
  to,
  setTo,
  date,
  setDate,
  onSearch,
  loading,
  onOpenOptions,
  onOpenRecent,
}: {
  from: string;
  setFrom: (s: string) => void;
  to: string;
  setTo: (s: string) => void;
  date: string;
  setDate: (s: string) => void;
  onSearch: () => void;
  loading: boolean;
  onOpenOptions: () => void;
  onOpenRecent: () => void;
}) {
  const [airportModalVisible, setAirportModalVisible] = React.useState<null | 'from' | 'to'>(null);
  const [showDatePicker, setShowDatePicker] = React.useState(false);

  const handleSwap = () => {
    const temp = from;
    setFrom(to);
    setTo(temp);
  };

  return (
    <View style={pickerStyles.card}>
      <Text style={pickerStyles.sectionLabel}>Where to?</Text>
      <View style={pickerStyles.row}>
        <Pressable onPress={() => setAirportModalVisible('from')} style={[pickerStyles.inputPill, { flex: 1, marginRight: 6 }]}>
          <Ionicons name="location-outline" size={20} color={colors.headerRed} style={{ marginRight: 10 }} />
          <Text style={from ? pickerStyles.inputText : pickerStyles.inputPlaceholder}>{from || 'From'}</Text>
        </Pressable>
        <Pressable
          onPress={handleSwap}
          style={pickerStyles.swapBtn}
          accessibilityLabel="Swap origin and destination"
          hitSlop={8}
        >
          <Ionicons name="swap-horizontal" size={24} color={colors.headerRed} />
        </Pressable>
        <Pressable onPress={() => setAirportModalVisible('to')} style={[pickerStyles.inputPill, { flex: 1, marginLeft: 6 }]}>
          <Ionicons name="flag-outline" size={20} color={colors.headerRed} style={{ marginRight: 10 }} />
          <Text style={to ? pickerStyles.inputText : pickerStyles.inputPlaceholder}>{to || 'To'}</Text>
        </Pressable>
      </View>

      <Text style={[pickerStyles.sectionLabel, { marginTop: 22 }]}>Travel date</Text>
      <Pressable onPress={() => setShowDatePicker(true)} style={pickerStyles.inputPill}>
        <Ionicons name="calendar" size={20} color={colors.headerRed} style={{ marginRight: 10 }} />
        <Text style={date ? pickerStyles.inputText : pickerStyles.inputPlaceholder}>{date || 'Select date'}</Text>
      </Pressable>
      {showDatePicker && (
        <View style={pickerStyles.datePickerWrap}>
          <DateTimePicker
            value={date ? new Date(`${date}T12:00:00`) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(_e, d) => {
              if (Platform.OS === 'android') setShowDatePicker(false);
              if (d) setDate(d.toISOString().slice(0, 10));
            }}
            style={{ backgroundColor: '#fff', borderRadius: 16 }}
            textColor={Platform.OS === 'ios' ? '#222' : undefined}
            themeVariant={Platform.OS === 'ios' ? 'light' : undefined}
          />
          {Platform.OS === 'ios' ? (
            <Pressable style={pickerStyles.dateDone} onPress={() => setShowDatePicker(false)}>
              <Text style={pickerStyles.dateDoneTx}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={pickerStyles.rowBtns}>
        <Pressable style={pickerStyles.recentBtn} onPress={onOpenRecent}>
          <Ionicons name="time-outline" size={16} color={colors.headerRed} />
          <Text style={pickerStyles.recentBtnText}>Recent</Text>
        </Pressable>
        <Pressable style={pickerStyles.optionsBtn} onPress={onOpenOptions}>
          <Ionicons name="options-outline" size={16} color={colors.headerRed} />
          <Text style={pickerStyles.optionsBtnText}>Options</Text>
        </Pressable>
      </View>

      <View style={pickerStyles.disclaimerCard}>
        <Ionicons name="information-circle-outline" size={18} color={colors.headerRed} style={{ marginRight: 8 }} />
        <Text style={pickerStyles.disclaimerText}>
          Community-reported loads. Verify in official airline systems. Flight Club does not access or automate airline systems.
        </Text>
      </View>

      <Pressable
        style={[pickerStyles.searchCta, !(from && to && date && !loading) && pickerStyles.searchCtaOff]}
        onPress={() => from && to && date && !loading && onSearch()}
        disabled={!(from && to && date) || loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={pickerStyles.searchCtaTx}>Search flights</Text>}
      </Pressable>

      <AirportPickerModal
        visible={airportModalVisible === 'from'}
        selected={from}
        onSelect={(a) => setFrom(a.code)}
        onClose={() => setAirportModalVisible(null)}
      />
      <AirportPickerModal
        visible={airportModalVisible === 'to'}
        selected={to}
        onSelect={(a) => setTo(a.code)}
        onClose={() => setAirportModalVisible(null)}
      />
    </View>
  );
}

export default function LoadsSearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [flights, setFlights] = useState<NonRevLoadFlight[]>([]);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [optionsSheet, setOptionsSheet] = useState(false);
  const [searchOptions, setSearchOptions] = useState<StaffLoadSearchOptions>(defaultStaffLoadSearchOptions);
  const [credits, setCredits] = useState(0);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [priority, setPriority] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<'depart' | 'arrive'>('depart');
  const [posting, setPosting] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [recents, setRecents] = useState<StaffLoadRecentSearch[]>([]);

  const openRecentModal = useCallback(async () => {
    const list = await loadStaffLoadRecentSearches();
    setRecents(list);
    setRecentOpen(true);
  }, []);

  const refreshHeader = useCallback(async () => {
    if (!userId) return;
    const w = await getStaffWalletSummary(userId);
    setCredits(w.standardCredits);
    const prev = await listMyOpenStaffRequestsPreview(userId, 5);
    setPreviewRows(prev);
  }, [userId]);

  useEffect(() => {
    void refreshHeader();
  }, [refreshHeader]);

  const performSearch = useCallback(async () => {
    setError('');
    setSearched(true);
    const res = await searchFlights(userId, '', from, to, date);
    setFlights(res.flights);
    setError(res.error || '');
    setSelected({});
    setPriority({});
    if (from && to && date && !(res.error || '').trim()) {
      void persistStaffLoadRecentSearch({ from, to, date });
    }
  }, [from, to, date, userId]);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    try {
      await performSearch();
    } finally {
      setLoading(false);
    }
  }, [performSearch]);

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await refreshHeader();
    if (from && to && date) await performSearch();
  });

  const sortedFlights = useMemo(() => {
    const arr = [...flights];
    arr.sort((a, b) =>
      sortBy === 'depart'
        ? new Date(a.depart_at).getTime() - new Date(b.depart_at).getTime()
        : new Date(a.arrive_at).getTime() - new Date(b.arrive_at).getTime()
    );
    return arr;
  }, [flights, sortBy]);

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const selectedFlights = useMemo(() => sortedFlights.filter((f) => selected[f.id]), [sortedFlights, selected]);
  const costPreview = useMemo(() => {
    let t = 0;
    for (const f of selectedFlights) {
      t += priority[f.id] ? 2 : 1;
    }
    return t;
  }, [selectedFlights, priority]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) {
        setPriority((p) => {
          const q = { ...p };
          delete q[id];
          return q;
        });
      }
      return next;
    });
  };

  const togglePriority = (id: string) => {
    setPriority((p) => ({ ...p, [id]: !p[id] }));
  };

  const selectAll = () => {
    const next: Record<string, boolean> = {};
    for (const f of sortedFlights) next[f.id] = true;
    setSelected(next);
  };

  const clearSelection = () => {
    setSelected({});
    setPriority({});
  };

  const onPostRequests = async () => {
    if (!userId || !selectedFlights.length) return;
    if (costPreview > credits) {
      Alert.alert('Not enough credits', `You need ${costPreview} credits (${selectedFlights.length} request(s)). Open Wallet to add credits.`);
      return;
    }
    setPosting(true);
    const kindMap: Record<string, StaffRequestKind> = {};
    for (const f of selectedFlights) {
      kindMap[f.id] = priority[f.id] ? 'priority' : 'standard';
    }
    const selection = Object.fromEntries(selectedFlights.map((f) => [f.id, kindMap[f.id]]));
    const res = await postStaffLoadRequests(selectedFlights, selection as any, searchOptions);
    setPosting(false);
    if (!res.ok) {
      const msg = res.error || 'Try again.';
      if (msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('credit')) {
        Alert.alert('Not enough credits', msg, [
          { text: 'Wallet', onPress: () => router.push('/loads?tab=wallet' as any) },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Could not post', msg);
      }
      return;
    }
    clearSelection();
    void refreshHeader();
    router.push('/loads?tab=requests' as any);
  };

  const STICKY_BAR_HEIGHT = userId ? 112 : 88;
  const canSearch = !!from && !!to && !!date && !loading;
  const selectionMode = searched && sortedFlights.length > 0;

  const listHeader = useMemo(
    () => (
      <View style={{ paddingHorizontal: 16 }}>
        <AirportAirlinePickers
          from={from}
          setFrom={setFrom}
          to={to}
          setTo={setTo}
          date={date}
          setDate={setDate}
          onSearch={handleSearch}
          loading={loading}
          onOpenOptions={() => setOptionsSheet(true)}
          onOpenRecent={() => void openRecentModal()}
        />

        {previewRows.length > 0 ? (
          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>Active requests</Text>
            {previewRows.map((r) => (
              <Pressable key={r.id} onPress={() => router.push(`/loads/request/${r.id}`)} style={styles.previewRow}>
                <Text style={styles.previewTx} numberOfLines={1}>
                  {r.airline_code} {r.flight_number || ''} · {r.from_airport}→{r.to_airport} · {r.travel_date}
                </Text>
                {r.request_kind === 'priority' ? <Text style={styles.pri}>P</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {loading ? <ActivityIndicator style={{ marginTop: 24 }} size="large" color={colors.headerRed} /> : null}
        {searched && !loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
        {searched && !loading && !error && flights.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="airplane-outline" size={48} color="#ddd" />
            <Text style={styles.emptyText}>No flights found for this search.</Text>
            <Text style={styles.emptySub}>Try another date or nearby airports in Options.</Text>
          </View>
        ) : null}

        {selectionMode ? (
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>
              {from} → {to} · {date}
            </Text>
            <View style={styles.selectionSummary}>
              <Text style={styles.selectionSummaryNum}>{selectedIds.length}</Text>
              <Text style={styles.selectionSummaryTx}>
                selected · {sortedFlights.filter((f) => selected[f.id] && priority[f.id]).length} priority (2 credits each) ·{' '}
                {costPreview} credits if posted
              </Text>
            </View>
            <View style={styles.sortRow}>
              <Pressable style={[styles.sortPill, sortBy === 'depart' && styles.sortPillOn]} onPress={() => setSortBy('depart')}>
                <Text style={[styles.sortPillTx, sortBy === 'depart' && styles.sortPillTxOn]}>Depart</Text>
              </Pressable>
              <Pressable style={[styles.sortPill, sortBy === 'arrive' && styles.sortPillOn]} onPress={() => setSortBy('arrive')}>
                <Text style={[styles.sortPillTx, sortBy === 'arrive' && styles.sortPillTxOn]}>Arrive</Text>
              </Pressable>
              <Pressable style={styles.sortPill} onPress={selectAll}>
                <Text style={styles.sortPillTx}>Select all</Text>
              </Pressable>
              <Pressable style={styles.sortPill} onPress={clearSelection}>
                <Text style={styles.sortPillTx}>Clear</Text>
              </Pressable>
            </View>
            <Text style={styles.longPressHint}>Tap a row to select. Long-press a selected row for priority (2 credits).</Text>
            {selectedIds.length > 0 && costPreview > credits ? (
              <Text style={styles.insufficientCredits}>
                Not enough credits: you have {credits}, but this selection needs {costPreview}. Open the Wallet tab to add
                credits.
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    ),
    [
      from,
      to,
      date,
      loading,
      searched,
      error,
      flights.length,
      handleSearch,
      previewRows,
      router,
      selectionMode,
      sortBy,
      openRecentModal,
      selectedIds.length,
      selected,
      sortedFlights,
      priority,
      costPreview,
      credits,
    ]
  );

  const renderItem = useCallback(
    ({ item }: { item: NonRevLoadFlight }) => {
      const depart = new Date(item.depart_at);
      const arrive = new Date(item.arrive_at);
      const durMs = Math.max(0, arrive.getTime() - depart.getTime());
      const durH = Math.floor(durMs / 3600000);
      const durM = Math.floor((durMs % 3600000) / 60000);
      const label = formatLoadsFlightLabel(item);
      const sel = !!selected[item.id];
      const pri = !!priority[item.id];
      return (
        <View>
          <FlightCard
            flightNumber={label}
            airline={item.airline_code}
            route={`${item.from_airport} → ${item.to_airport}`}
            departTime={depart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            arriveTime={arrive.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            duration={`${durH}h ${durM}m`}
            reportCount={0}
            selectionMode={selectionMode}
            selected={sel}
            prioritySelected={pri}
            onPress={() => router.push(`/load-details/${encodeURIComponent(item.id)}`)}
            onToggleSelect={() => toggleSelect(item.id)}
            onTogglePriority={() => togglePriority(item.id)}
          />
        </View>
      );
    },
    [router, selectionMode, selected, priority]
  );

  return (
    <View style={styles.container}>
      <StaffLoadsSearchOptionsSheet
        visible={optionsSheet}
        onClose={() => setOptionsSheet(false)}
        options={searchOptions}
        setOptions={setSearchOptions}
      />
      <FlatList
        style={{ flex: 1 }}
        data={selectionMode ? sortedFlights : []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={REFRESH_CONTROL_COLORS} tintColor={REFRESH_TINT} />
        }
        ListFooterComponent={
          selectionMode ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}>
              <Pressable
                style={[
                  styles.postCta,
                  (posting || selectedIds.length === 0 || costPreview > credits) && styles.postCtaOff,
                ]}
                disabled={posting || selectedIds.length === 0 || costPreview > credits}
                onPress={() => void onPostRequests()}
              >
                <Text style={styles.postCtaTx}>
                  {posting
                    ? 'Posting…'
                    : selectedIds.length === 0
                      ? 'Select flights to post'
                      : costPreview > credits
                        ? `Need ${costPreview} credits (you have ${credits})`
                        : `Post ${selectedIds.length} request${selectedIds.length > 1 ? 's' : ''} · ${costPreview} credit${costPreview === 1 ? '' : 's'}`}
                </Text>
              </Pressable>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: STICKY_BAR_HEIGHT + insets.bottom + 24 }}
      />
      <View style={[styles.stickyBar, { paddingBottom: 12 + insets.bottom }]}>
        <Pressable
          onPress={() => void handleSearch()}
          disabled={!canSearch}
          style={({ pressed }) => [styles.primaryButton, !canSearch && styles.primaryButtonDisabled, pressed && canSearch && { opacity: 0.85 }]}
        >
          <Text style={styles.primaryButtonText}>
            {!canSearch
              ? 'Add route & date'
              : searched && sortedFlights.length > 0
                ? 'Refresh results'
                : 'Search flights'}
          </Text>
        </Pressable>
        {userId ? (
          <Pressable onPress={() => router.push('/loads?tab=wallet' as any)} hitSlop={8} style={styles.stickyBalWrap}>
            <Text style={styles.stickyBalText}>
              Credits: <Text style={styles.stickyBalNum}>{credits}</Text> · Standard 1 · Priority 2
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={recentOpen} animationType="slide" transparent onRequestClose={() => setRecentOpen(false)}>
        <Pressable style={styles.recentOverlay} onPress={() => setRecentOpen(false)}>
          <View style={styles.recentSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.recentTitle}>Recent searches</Text>
            {recents.length === 0 ? (
              <Text style={styles.recentEmpty}>No saved routes yet. Run a successful search to save one here.</Text>
            ) : (
              recents.map((r) => (
                <Pressable
                  key={`${r.from}-${r.to}-${r.date}-${r.savedAt}`}
                  style={styles.recentRow}
                  onPress={() => {
                    setFrom(r.from);
                    setTo(r.to);
                    setDate(r.date);
                    setRecentOpen(false);
                  }}
                >
                  <Text style={styles.recentRoute}>
                    {r.from} → {r.to}
                  </Text>
                  <Text style={styles.recentDate}>{r.date}</Text>
                </Pressable>
              ))
            )}
            <Pressable style={styles.recentClose} onPress={() => setRecentOpen(false)}>
              <Text style={styles.recentCloseTx}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  previewBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  previewTitle: { fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  previewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0' },
  previewTx: { flex: 1, fontWeight: '600', color: '#334155', fontSize: 13 },
  pri: { fontWeight: '900', color: '#b45309', marginLeft: 8 },
  resultsHeader: { marginTop: 8, marginBottom: 8 },
  resultsTitle: { fontWeight: '800', fontSize: 16, color: '#0f172a', marginBottom: 10 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sortPill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#f1f5f9' },
  sortPillOn: { backgroundColor: colors.headerRed },
  sortPillTx: { fontWeight: '700', fontSize: 13, color: '#334155' },
  sortPillTxOn: { color: '#fff' },
  selectionSummary: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  selectionSummaryNum: {
    minWidth: 28,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 16,
    color: '#fff',
    backgroundColor: colors.headerRed,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  selectionSummaryTx: { flex: 1, fontSize: 13, fontWeight: '700', color: '#475569', lineHeight: 18 },
  longPressHint: { fontSize: 12, color: '#64748b', marginTop: 8, fontWeight: '600' },
  insufficientCredits: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: colors.headerRed,
    lineHeight: 18,
  },
  postCta: { backgroundColor: colors.headerRed, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  postCtaOff: { opacity: 0.45 },
  postCtaTx: { color: '#fff', fontWeight: '900', fontSize: 16 },
  errorText: { color: colors.headerRed, fontWeight: '700', fontSize: 16, textAlign: 'center', marginTop: 24 },
  emptyState: { alignItems: 'center', marginTop: 32 },
  emptyText: { color: '#888', fontSize: 16, marginTop: 12 },
  emptySub: { color: '#94a3b8', fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 24, fontWeight: '600' },
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    zIndex: 50,
    elevation: 20,
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.headerRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { backgroundColor: '#D1D5DB' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  stickyBalWrap: { marginTop: 8, alignItems: 'center', paddingVertical: 4 },
  stickyBalText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  stickyBalNum: { fontWeight: '900', color: colors.headerRed },
  recentOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  recentSheet: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  recentTitle: { fontWeight: '900', fontSize: 18, color: '#0f172a', marginBottom: 12 },
  recentEmpty: { color: '#64748b', fontWeight: '600', lineHeight: 20, marginBottom: 12 },
  recentRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  recentRoute: { fontWeight: '800', fontSize: 16, color: '#0f172a' },
  recentDate: { color: '#64748b', marginTop: 4, fontWeight: '600', fontSize: 14 },
  recentClose: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  recentCloseTx: { color: colors.headerRed, fontWeight: '800', fontSize: 16 },
});

const pickerStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: '#eee',
  },
  sectionLabel: { color: '#888', fontWeight: '700', fontSize: 17, marginBottom: 10 },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    minHeight: 48,
  },
  inputText: { color: '#222', fontWeight: '600', fontSize: 16 },
  inputPlaceholder: { color: '#bbb', fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  swapBtn: { marginHorizontal: 8, backgroundColor: '#fff5f5', borderRadius: 20, padding: 8, borderWidth: 1, borderColor: '#eee' },
  rowBtns: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 8 },
  recentBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14 },
  recentBtnText: { color: colors.headerRed, fontWeight: '600', marginLeft: 6 },
  optionsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14 },
  optionsBtnText: { color: colors.headerRed, fontWeight: '600', marginLeft: 6 },
  disclaimerCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(181, 22, 30, 0.06)', borderRadius: 10, padding: 12, marginTop: 16 },
  disclaimerText: { color: colors.headerRed, fontSize: 13, flex: 1 },
  searchCta: {
    backgroundColor: colors.headerRed,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  searchCtaOff: { backgroundColor: '#D1D5DB' },
  searchCtaTx: { color: '#fff', fontWeight: '800', fontSize: 17 },
  datePickerWrap: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', padding: 4, marginTop: 4 },
  dateDone: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  dateDoneTx: { fontWeight: '900', color: colors.headerRed, fontSize: 16 },
});
