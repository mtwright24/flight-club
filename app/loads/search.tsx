
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList, Platform, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { searchFlights, NonRevLoadFlight } from '../../src/lib/supabase/loads';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';
import { AirportPickerModal } from '../../src/components/loads/AirportAirlinePickers';
import { FlightCard } from '../../src/components/loads/FlightCard';
import { useAuth } from '../../src/hooks/useAuth';
import { colors } from '../../src/styles/theme';

/** Display label for a staff-loads row (avoid duplicated airline + flight number). */
function formatLoadsFlightLabel(item: NonRevLoadFlight): string {
  const code = (item.airline_code || '').toUpperCase();
  const num = (item.flight_number || '').trim();
  if (!num) return code;
  if (num.toUpperCase().startsWith(code)) return num;
  return `${code} ${num}`.trim();
}

// Wrapper component to match previous usage
function AirportAirlinePickers({ from, setFrom, to, setTo, date, setDate, onSearch, loading }: any) {
  const [airportModalVisible, setAirportModalVisible] = React.useState<null | 'from' | 'to'>(null);
  const [showDatePicker, setShowDatePicker] = React.useState(false);

  const handleSwap = () => {
    const temp = from;
    setFrom(to);
    setTo(temp);
  };

  return (
    <View style={[styles.card, { paddingTop: 24, paddingBottom: 24, borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }]}>
      <Text style={[styles.sectionLabel, { fontSize: 17, fontWeight: '700', marginBottom: 10 }]}>Where to?</Text>
      <View style={styles.row}>
        <Pressable onPress={() => setAirportModalVisible('from')} style={[styles.inputPill, { flex: 1, marginRight: 6, minHeight: 48 }]}>
          <Ionicons name="location-outline" size={20} color={colors.headerRed} style={{ marginRight: 10 }} />
          <Text style={from ? styles.inputText : styles.inputPlaceholder}>{from || 'From'}</Text>
        </Pressable>
        <Pressable onPress={handleSwap} style={[styles.swapBtn, { marginHorizontal: 4 }]}>
          <Ionicons name="swap-horizontal" size={24} color={colors.headerRed} />
        </Pressable>
        <Pressable onPress={() => setAirportModalVisible('to')} style={[styles.inputPill, { flex: 1, marginLeft: 6, minHeight: 48 }]}>
          <Ionicons name="flag-outline" size={20} color={colors.headerRed} style={{ marginRight: 10 }} />
          <Text style={to ? styles.inputText : styles.inputPlaceholder}>{to || 'To'}</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 22, fontSize: 17, fontWeight: '700', marginBottom: 10 }]}>Travel date</Text>
      <Pressable onPress={() => setShowDatePicker(true)} style={[styles.inputPill, { minHeight: 48 }]}>
        <Ionicons name="calendar" size={20} color={colors.headerRed} style={{ marginRight: 10 }} />
        <Text style={date ? styles.inputText : styles.inputPlaceholder}>{date || 'Select date'}</Text>
      </Pressable>
      {showDatePicker && (
        <View style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', padding: 4 }}>
          <DateTimePicker
            value={date ? new Date(date) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(e, d) => {
              setShowDatePicker(false);
              if (d) setDate(d.toISOString().slice(0, 10));
            }}
            style={{ backgroundColor: '#fff', borderRadius: 16 }}
            textColor={Platform.OS === 'ios' ? '#222' : undefined}
            themeVariant={Platform.OS === 'ios' ? 'light' : undefined}
          />
        </View>
      )}

      <View style={styles.rowBtns}>
        <Pressable
          style={styles.recentBtn}
          onPress={() => {
            console.log('Recent button pressed');
          }}
        >
          <Ionicons name="time-outline" size={16} color={colors.headerRed} />
          <Text style={styles.recentBtnText}>Recent</Text>
        </Pressable>
        <Pressable
          style={styles.optionsBtn}
          onPress={() => {
            console.log('Options button pressed');
          }}
        >
          <Ionicons name="options-outline" size={16} color={colors.headerRed} />
          <Text style={styles.optionsBtnText}>Options</Text>
        </Pressable>
      </View>

      <View style={styles.disclaimerCard}>
        <Ionicons name="information-circle-outline" size={18} color={colors.headerRed} style={{ marginRight: 8 }} />
        <Text style={styles.disclaimerText}>
          Community-reported loads. Verify in official airline systems. Flight Club does not access or automate airline systems.
        </Text>
      </View>

      <Pressable
        style={{
          backgroundColor: from && to && date && !loading ? colors.headerRed : '#D1D5DB',
          borderRadius: 12,
          paddingVertical: 16,
          paddingHorizontal: 32,
          marginTop: 20,
          alignSelf: 'center',
          minWidth: 220,
          alignItems: 'center',
          opacity: loading ? 0.7 : 1,
        }}
        onPress={() => {
          if (from && to && date && !loading && onSearch) {
            onSearch();
          }
        }}
        disabled={!(from && to && date) || loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>Search Loads</Text>
        )}
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

  const performSearch = useCallback(async () => {
    setError('');
    setSearched(true);
    const res = await searchFlights(userId, '', from, to, date);
    setFlights(res.flights);
    setError(res.error || '');
  }, [from, to, date, userId]);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    try {
      await performSearch();
    } finally {
      setLoading(false);
    }
  }, [performSearch]);

  const { refreshing: loadsSearchPullRefreshing, onRefresh: onLoadsSearchPullRefresh } = usePullToRefresh(async () => {
    if (!from || !to || !date) return;
    await performSearch();
  });

  const STICKY_BAR_HEIGHT = 88;
  const canSearch = !!from && !!to && !!date && !loading;

  const listHeader = useMemo(
    () => (
      <View style={{ paddingHorizontal: 16, paddingTop: 0 }}>
        <AirportAirlinePickers
          from={from}
          setFrom={setFrom}
          to={to}
          setTo={setTo}
          date={date}
          setDate={setDate}
          onSearch={handleSearch}
          loading={loading}
        />
        {loading ? <ActivityIndicator style={{ marginTop: 24 }} size="large" color={colors.headerRed} /> : null}
        {searched && !loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
        {searched && !loading && !error && flights.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="airplane-outline" size={48} color="#ddd" />
            <Text style={styles.emptyText}>No flights found for this search.</Text>
          </View>
        ) : null}
        {searched && !loading && !error && flights.length > 0 ? (
          <Pressable style={styles.postRequestBtn}>
            <Text style={styles.postRequestBtnText}>Post Load Request</Text>
          </Pressable>
        ) : null}
      </View>
    ),
    [from, to, date, loading, searched, error, flights.length, handleSearch]
  );

  const renderItem = useCallback(
    ({ item }: { item: NonRevLoadFlight }) => {
      const depart = new Date(item.depart_at);
      const arrive = new Date(item.arrive_at);
      const durMs = Math.max(0, arrive.getTime() - depart.getTime());
      const durH = Math.floor(durMs / 3600000);
      const durM = Math.floor((durMs % 3600000) / 60000);
      const label = formatLoadsFlightLabel(item);
      return (
        <View style={{ paddingHorizontal: 16 }}>
          <FlightCard
            flightNumber={label}
            route={`${item.from_airport} → ${item.to_airport}`}
            departTime={depart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            arriveTime={arrive.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            duration={`${durH}h ${durM}m`}
            reportCount={0}
            onPress={() => router.push(`/load-details/${encodeURIComponent(item.id)}`)}
          />
        </View>
      );
    },
    [router]
  );

  return (
    <View style={[styles.container, { flex: 1 }]}>
      <FlatList
        style={{ flex: 1 }}
        data={searched && !error && flights.length > 0 ? flights : []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={loadsSearchPullRefreshing}
            onRefresh={onLoadsSearchPullRefresh}
            colors={REFRESH_CONTROL_COLORS}
            tintColor={REFRESH_TINT}
          />
        }
        contentContainerStyle={{ paddingBottom: STICKY_BAR_HEIGHT + insets.bottom + 24 }}
      />
      <View style={[styles.stickyBar, { paddingBottom: 12 + insets.bottom }]}>
        <Pressable
          onPress={() => {
            void handleSearch();
          }}
          disabled={!canSearch}
          style={({ pressed }) => [
            styles.primaryButton,
            !canSearch && styles.primaryButtonDisabled,
            pressed && canSearch && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.primaryButtonText}>Search Loads</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1,
    borderColor: '#eee',
  },
  sectionLabel: { color: '#888', fontWeight: '600', fontSize: 15, marginBottom: 6 },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
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
  postRequestBtn: {
    backgroundColor: 'rgba(181, 22, 30, 0.06)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.headerRed,
  },
  postRequestBtnText: { color: colors.headerRed, fontWeight: '800', fontSize: 16 },
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
  primaryButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  errorText: { color: colors.headerRed, fontWeight: '700', fontSize: 16, textAlign: 'center', marginTop: 24 },
  emptyState: { alignItems: 'center', marginTop: 32 },
  emptyText: { color: '#888', fontSize: 16, marginTop: 12 },
});
