import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AirportPickerModal } from '../../src/components/loads/AirportAirlinePickers';
import { FlightCard } from '../../src/components/loads/FlightCard';
import { StaffLoadsMyActiveRequestCard } from '../../src/components/loads/StaffLoadsMyActiveRequestCard';
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
import { formatTravelDateShort } from '../../src/components/loads/StaffLoadsRequestPresentation';
import {
  loadStaffLoadRecentSearches,
  persistStaffLoadRecentSearch,
  type StaffLoadRecentSearch,
} from '../../lib/staffLoadsRecentSearches';

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
  showDisclaimer = true,
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
  showDisclaimer?: boolean;
}) {
  const [airportModalVisible, setAirportModalVisible] = React.useState<null | 'from' | 'to'>(null);
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const [datePickerValue, setDatePickerValue] = React.useState(() => new Date());

  const openDatePicker = () => {
    setDatePickerValue(date ? new Date(`${date}T12:00:00`) : new Date());
    setShowDatePicker(true);
  };

  const confirmTravelDate = () => {
    const d = datePickerValue;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setDate(`${y}-${m}-${day}`);
    setShowDatePicker(false);
  };

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
      <Pressable onPress={openDatePicker} style={pickerStyles.inputPill}>
        <Ionicons name="calendar" size={20} color={colors.headerRed} style={{ marginRight: 10 }} />
        <Text style={date ? pickerStyles.inputText : pickerStyles.inputPlaceholder}>{date || 'Select date'}</Text>
      </Pressable>

      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable style={pickerStyles.dateOverlay} onPress={() => setShowDatePicker(false)}>
          <Pressable style={pickerStyles.dateSheet} onPress={() => {}}>
            <Text style={pickerStyles.dateSheetTitle}>Travel date</Text>
            <DateTimePicker
              value={datePickerValue}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_event, selected) => {
                if (selected) setDatePickerValue(selected);
              }}
              style={Platform.OS === 'ios' ? pickerStyles.datePickerIos : pickerStyles.datePickerAndroid}
              textColor={Platform.OS === 'ios' ? '#222' : undefined}
              themeVariant={Platform.OS === 'ios' ? 'light' : undefined}
            />
            <View style={pickerStyles.dateActions}>
              <Pressable onPress={() => setShowDatePicker(false)} hitSlop={8}>
                <Text style={pickerStyles.dateActionCancel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={confirmTravelDate} hitSlop={8}>
                <Text style={pickerStyles.dateActionDone}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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

      {showDisclaimer ? (
        <View style={pickerStyles.disclaimerCard}>
          <Ionicons name="information-circle-outline" size={18} color={colors.headerRed} style={{ marginRight: 8 }} />
          <Text style={pickerStyles.disclaimerText}>
            Community-reported loads. Verify in official airline systems.
          </Text>
        </View>
      ) : null}

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
  /** Default order is earliest departure — no separate Depart/Arrive filter controls. */
  const [sortByDuration, setSortByDuration] = useState(false);
  const [airlineFilter, setAirlineFilter] = useState('');
  const [airlineModalOpen, setAirlineModalOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [recents, setRecents] = useState<StaffLoadRecentSearch[]>([]);
  const [searchFormExpanded, setSearchFormExpanded] = useState(true);
  const listRef = useRef<FlatList<NonRevLoadFlight>>(null);

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
    return res;
  }, [from, to, date, userId]);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await performSearch();
      if (res.flights.length > 0 && !(res.error || '').trim()) {
        setSearchFormExpanded(false);
      }
    } finally {
      setLoading(false);
    }
  }, [performSearch]);

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await refreshHeader();
    if (from && to && date) void performSearch();
  });

  const sortedFlights = useMemo(() => {
    const arr = [...flights];
    arr.sort((a, b) => {
      if (sortByDuration) {
        const da = new Date(a.depart_at).getTime();
        const db = new Date(b.depart_at).getTime();
        const aa = new Date(a.arrive_at).getTime();
        const ab = new Date(b.arrive_at).getTime();
        return aa - da - (ab - db);
      }
      return new Date(a.depart_at).getTime() - new Date(b.depart_at).getTime();
    });
    return arr;
  }, [flights, sortByDuration]);

  const visibleFlights = useMemo(() => {
    const q = airlineFilter.trim().toUpperCase();
    if (!q) return sortedFlights;
    return sortedFlights.filter((f) => (f.airline_code || '').toUpperCase().includes(q));
  }, [sortedFlights, airlineFilter]);

  const selectAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const f of visibleFlights) next[f.id] = true;
      return next;
    });
  }, [visibleFlights]);

  const cycleStops = useCallback(() => {
    setSearchOptions((prev) => {
      if (!prev.allowStops) return { ...prev, allowStops: true, maxStops: 1 };
      if (prev.maxStops === 1) return { ...prev, maxStops: 2 };
      return { ...prev, allowStops: false, maxStops: 0 };
    });
  }, []);

  const stopsPillLabel = !searchOptions.allowStops ? 'Nonstop' : `≤ ${searchOptions.maxStops} stop${searchOptions.maxStops === 1 ? '' : 's'}`;

  const resultsMode = searched && !loading && sortedFlights.length > 0;

  useEffect(() => {
    if (!resultsMode) return;
    const id = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return () => cancelAnimationFrame(id);
  }, [resultsMode]);

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
    setSelected({});
    setPriority({});
    void refreshHeader();
    Alert.alert('Requests posted', 'Your active requests are listed below on the Loads tab. Check the Requests tab to help other crew.');
  };

  const STICKY_BAR_HEIGHT = resultsMode ? 56 + insets.bottom + 8 : 72;
  const canSearch = !!from && !!to && !!date && !loading;
  const selectionMode = resultsMode;

  const previewCards = useMemo(
    () =>
      previewRows.map((r: Record<string, unknown>) => (
        <StaffLoadsMyActiveRequestCard
          key={String(r.id)}
          row={{
            id: String(r.id),
            airline_code: String(r.airline_code ?? ''),
            flight_number: (r.flight_number as string | null) ?? null,
            from_airport: String(r.from_airport ?? ''),
            to_airport: String(r.to_airport ?? ''),
            travel_date: String(r.travel_date ?? ''),
            request_kind: String(r.request_kind ?? 'standard'),
            status: String(r.status ?? 'open'),
            depart_at: (r.depart_at as string | null) ?? null,
            arrive_at: (r.arrive_at as string | null) ?? null,
            refresh_requested_at: (r.refresh_requested_at as string | null) ?? null,
            aircraft_type: (r.aircraft_type as string | null) ?? null,
            locked_by: (r.locked_by as string | null) ?? null,
            lock_expires_at: (r.lock_expires_at as string | null) ?? null,
            latest_answer_load_level: (r.latest_answer_load_level as string | null) ?? null,
            latest_answer_open_seats_total: (r.latest_answer_open_seats_total as number | null | undefined) ?? null,
            latest_answer_nonrev_listed_total: (r.latest_answer_nonrev_listed_total as number | null | undefined) ?? null,
            options: r.options,
          }}
        />
      )),
    [previewRows]
  );

  const listHeader = useMemo(
    () => (
      <View style={{ paddingHorizontal: 16 }}>
        {!resultsMode ? (
          <>
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
              showDisclaimer
            />
            {previewRows.length > 0 ? (
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle}>Your active requests</Text>
                {previewCards}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.compactSearchBar}>
              <View style={styles.compactSearchMain}>
                <Text style={styles.compactRoute} numberOfLines={1}>
                  {from} · {to}
                </Text>
                <Text style={styles.compactDateSub}>{date ? formatTravelDateShort(date) : '—'}</Text>
              </View>
              <Pressable
                style={styles.compactIconBtn}
                onPress={() => void handleSearch()}
                accessibilityLabel="Refresh results"
              >
                <Ionicons name="refresh" size={22} color={colors.headerRed} />
              </Pressable>
              <Pressable style={styles.compactIconBtn} onPress={() => setOptionsSheet(true)} accessibilityLabel="Search options">
                <Ionicons name="options-outline" size={22} color={colors.headerRed} />
              </Pressable>
              <Pressable
                style={styles.compactEditBtn}
                onPress={() => setSearchFormExpanded((v: boolean) => !v)}
                accessibilityLabel={searchFormExpanded ? 'Done editing search' : 'Edit search'}
              >
                <Text style={styles.compactEditTx}>{searchFormExpanded ? 'Done' : 'Edit'}</Text>
              </Pressable>
            </View>
            {searchFormExpanded ? (
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
                showDisclaimer={false}
              />
            ) : null}
            <View style={styles.resultsToolbar}>
              <Text style={styles.resultsDateHead}>{date ? formatTravelDateShort(date) : '—'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillRow}>
                <Pressable style={styles.filterPill} onPress={cycleStops}>
                  <Text style={styles.filterPillTx}>Stops · {stopsPillLabel}</Text>
                </Pressable>
                <Pressable style={styles.filterPill} onPress={() => setOptionsSheet(true)}>
                  <Text style={styles.filterPillTx}>Options</Text>
                </Pressable>
                <Pressable style={styles.filterPill} onPress={() => setAirlineModalOpen(true)}>
                  <Text style={styles.filterPillTx}>{airlineFilter.trim() ? `Airlines · ${airlineFilter.trim()}` : 'Airlines'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.filterPill, sortByDuration && styles.filterPillOn]}
                  onPress={() => setSortByDuration((v) => !v)}
                >
                  <Text style={[styles.filterPillTx, sortByDuration && styles.filterPillTxOn]}>Duration</Text>
                </Pressable>
                <Pressable style={styles.filterPill} onPress={selectAllVisible}>
                  <Text style={styles.filterPillTx}>Select all</Text>
                </Pressable>
              </ScrollView>
            </View>
          </>
        )}

        {loading ? <ActivityIndicator style={{ marginTop: 20 }} size="large" color={colors.headerRed} /> : null}
        {searched && !loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
        {searched && !loading && !error && flights.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="airplane-outline" size={40} color="#ddd" />
            <Text style={styles.emptyText}>No flights found</Text>
            <Text style={styles.emptySub}>Try another date or Options.</Text>
          </View>
        ) : null}
        {searched && !loading && !error && flights.length > 0 && visibleFlights.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="funnel-outline" size={36} color="#cbd5e1" />
            <Text style={styles.emptyText}>No flights match this airline filter</Text>
            <Text style={styles.emptySub}>Clear the filter in Airlines or change the code.</Text>
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
      previewRows.length,
      previewCards,
      resultsMode,
      searchFormExpanded,
      sortByDuration,
      openRecentModal,
      cycleStops,
      stopsPillLabel,
      airlineFilter,
      selectAllVisible,
    ]
  );

  const renderItem = useCallback(
    ({ item }: { item: NonRevLoadFlight }) => {
      const sel = !!selected[item.id];
      const pri = !!priority[item.id];
      return (
        <FlightCard
          variant="staff"
          staffMeta={{
            airlineCode: item.airline_code,
            flightNumber: item.flight_number,
            from: item.from_airport,
            to: item.to_airport,
            travelDate: item.travel_date,
            departAt: item.depart_at,
            arriveAt: item.arrive_at,
            aircraft: null,
            flightId: item.id,
          }}
          onPress={() => router.push(`/load-details/${encodeURIComponent(item.id)}`)}
          selectionMode={selectionMode}
          selected={sel}
          prioritySelected={pri}
          onToggleSelect={() => toggleSelect(item.id)}
          onTogglePriority={() => togglePriority(item.id)}
        />
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
        ref={listRef}
        style={{ flex: 1 }}
        data={selectionMode ? visibleFlights : []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={REFRESH_CONTROL_COLORS} tintColor={REFRESH_TINT} />
        }
        contentContainerStyle={{ paddingBottom: STICKY_BAR_HEIGHT }}
      />
      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
        {resultsMode ? (
          <>
            <Pressable
              style={[
                styles.primaryButton,
                (posting || selectedIds.length === 0 || costPreview > credits) && styles.primaryButtonDisabled,
              ]}
              disabled={posting || selectedIds.length === 0 || costPreview > credits}
              onPress={() => void onPostRequests()}
            >
              <Text style={styles.primaryButtonText}>
                {posting
                  ? 'Posting…'
                  : selectedIds.length === 0
                    ? 'Select flights'
                    : costPreview > credits
                      ? `Need ${costPreview} credits`
                      : `Post ${selectedIds.length} request${selectedIds.length === 1 ? '' : 's'}`}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => void handleSearch()}
              disabled={!canSearch}
              style={({ pressed }) => [
                styles.primaryButton,
                !canSearch && styles.primaryButtonDisabled,
                pressed && canSearch && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {!canSearch ? 'Add route & date' : 'Search flights'}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      <Modal visible={airlineModalOpen} transparent animationType="fade" onRequestClose={() => setAirlineModalOpen(false)}>
        <Pressable style={styles.airlineModalOverlay} onPress={() => setAirlineModalOpen(false)}>
          <Pressable style={styles.airlineModalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.airlineModalTitle}>Airline filter</Text>
            <Text style={styles.airlineModalHint}>Match carrier code (e.g. DL, B6). Leave empty for all.</Text>
            <TextInput
              value={airlineFilter}
              onChangeText={setAirlineFilter}
              autoCapitalize="characters"
              placeholder="e.g. DL"
              placeholderTextColor="#94a3b8"
              style={styles.airlineModalInput}
            />
            <View style={styles.airlineModalActions}>
              <Pressable onPress={() => setAirlineFilter('')}>
                <Text style={styles.airlineModalClear}>Clear</Text>
              </Pressable>
              <Pressable style={styles.airlineModalDone} onPress={() => setAirlineModalOpen(false)}>
                <Text style={styles.airlineModalDoneTx}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
    marginBottom: 8,
  },
  previewTitle: { fontWeight: '800', fontSize: 15, color: '#64748b', marginBottom: 8, letterSpacing: 0.3 },
  compactSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 2,
  },
  compactSearchMain: { flex: 1, minWidth: 0 },
  compactRoute: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  compactDateSub: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 2 },
  compactIconBtn: { padding: 8 },
  compactEditBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  compactEditTx: { fontSize: 14, fontWeight: '800', color: colors.headerRed },
  resultsToolbar: { marginBottom: 6 },
  resultsDateHead: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  filterPillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterPillOn: { backgroundColor: 'rgba(181, 22, 30, 0.1)', borderColor: colors.headerRed },
  filterPillTx: { fontWeight: '600', fontSize: 12, color: '#334155' },
  filterPillTxOn: { color: colors.headerRed },
  airlineModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  airlineModalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  airlineModalTitle: { fontWeight: '800', fontSize: 17, color: '#0f172a' },
  airlineModalHint: { color: '#64748b', fontSize: 13, marginTop: 6, marginBottom: 12, lineHeight: 18 },
  airlineModalInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  airlineModalActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  airlineModalClear: { fontSize: 16, fontWeight: '600', color: '#64748b' },
  airlineModalDone: { backgroundColor: colors.headerRed, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  airlineModalDoneTx: { color: '#fff', fontWeight: '800', fontSize: 15 },
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
  dateOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  dateSheet: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  dateSheetTitle: {
    fontWeight: '800',
    fontSize: 17,
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  datePickerIos: {
    alignSelf: 'stretch',
    height: Platform.OS === 'ios' ? 380 : 216,
  },
  datePickerAndroid: {
    alignSelf: 'stretch',
    minHeight: 178,
  },
  dateActions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  dateActionCancel: { fontSize: 17, fontWeight: '600', color: '#64748b' },
  dateActionDone: { fontSize: 17, fontWeight: '800', color: colors.headerRed },
});
