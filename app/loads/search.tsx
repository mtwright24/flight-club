
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList, Platform, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { searchFlights, NonRevLoadFlight } from '../../src/lib/supabase/loads';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';
import { AirportPickerModal, AirlinePickerModal } from '../../src/components/loads/AirportAirlinePickers';

// Wrapper component to match previous usage
function AirportAirlinePickers({ from, setFrom, to, setTo, date, setDate, onSearch, loading }: any) {
  const [airportModalVisible, setAirportModalVisible] = React.useState<null | 'from' | 'to'>(null);
  const [showDatePicker, setShowDatePicker] = React.useState(false);

  // Swap from/to
  const handleSwap = () => {
    const temp = from;
    setFrom(to);
    setTo(temp);
  };

  return (
    <View style={[styles.card, { paddingTop: 24, paddingBottom: 24, borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }]}> 
      {/* Where to? */}
      <Text style={[styles.sectionLabel, { fontSize: 17, fontWeight: '700', marginBottom: 10 }]}>Where to?</Text>
      <View style={styles.row}>
        <Pressable onPress={() => setAirportModalVisible('from')} style={[styles.inputPill, { flex: 1, marginRight: 6, minHeight: 48 }]}> 
          <Ionicons name="location-outline" size={20} color="#DC3545" style={{ marginRight: 10 }} />
          <Text style={from ? styles.inputText : styles.inputPlaceholder}>{from || 'From'}</Text>
        </Pressable>
        <Pressable onPress={handleSwap} style={[styles.swapBtn, { marginHorizontal: 4 }]}> 
          <Ionicons name="swap-horizontal" size={24} color="#DC3545" />
        </Pressable>
        <Pressable onPress={() => setAirportModalVisible('to')} style={[styles.inputPill, { flex: 1, marginLeft: 6, minHeight: 48 }]}> 
          <Ionicons name="flag-outline" size={20} color="#DC3545" style={{ marginRight: 10 }} />
          <Text style={to ? styles.inputText : styles.inputPlaceholder}>{to || 'To'}</Text>
        </Pressable>
      </View>

      {/* Date Picker */}
      <Text style={[styles.sectionLabel, { marginTop: 22, fontSize: 17, fontWeight: '700', marginBottom: 10 }]}>Travel date</Text>
      <Pressable onPress={() => setShowDatePicker(true)} style={[styles.inputPill, { minHeight: 48 }]}> 
        <Ionicons name="calendar" size={20} color="#DC3545" style={{ marginRight: 10 }} />
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

      {/* Recent/Options row */}
      <View style={styles.rowBtns}>
        <Pressable
          style={styles.recentBtn}
          onPress={() => {
            console.log('Recent button pressed');
            // TODO: Implement recent search selection/modal
          }}
        >
          <Ionicons name="time-outline" size={16} color="#DC3545" />
          <Text style={styles.recentBtnText}>Recent</Text>
        </Pressable>
        <Pressable
          style={styles.optionsBtn}
          onPress={() => {
            console.log('Options button pressed');
            // TODO: Implement options modal/sheet
          }}
        >
          <Ionicons name="options-outline" size={16} color="#DC3545" />
          <Text style={styles.optionsBtnText}>Options</Text>
        </Pressable>
      </View>

      {/* Disclaimer */}
      <View style={styles.disclaimerCard}>
        <Ionicons name="information-circle-outline" size={18} color="#DC3545" style={{ marginRight: 8 }} />
        <Text style={styles.disclaimerText}>Community-reported loads. Verify in official airline systems. Flight Club does not access or automate airline systems.</Text>
      </View>

      <Pressable
        style={{
          backgroundColor: from && to && date && !loading ? '#DC3545' : '#D1D5DB',
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
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 17 }}>Search Loads</Text>
        )}
      </Pressable>

      {/* Modals - use SafeAreaView and non-transparent modal for iOS polish */}
      <AirportPickerModal
        visible={airportModalVisible === 'from'}
        selected={from}
        onSelect={a => setFrom(a.code)}
        onClose={() => setAirportModalVisible(null)}
      />
      <AirportPickerModal
        visible={airportModalVisible === 'to'}
        selected={to}
        onSelect={a => setTo(a.code)}
        onClose={() => setAirportModalVisible(null)}
      />
    </View>
  );
}
import { FlightCard } from '../../src/components/loads/FlightCard';

export default function LoadsSearchScreen({ refreshToken = 0 }: { refreshToken?: number }) {
    const insets = useSafeAreaInsets();
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
    const userId = 'demo-user';
    const res = await searchFlights(userId, '', from, to, date);
    setFlights(res.flights);
    setError(res.error || '');
  }, [from, to, date]);

  const handleSearch = async () => {
    setLoading(true);
    try {
      await performSearch();
    } finally {
      setLoading(false);
    }
  };

  const { refreshing: loadsSearchPullRefreshing, onRefresh: onLoadsSearchPullRefresh } = usePullToRefresh(async () => {
    if (!from || !to || !date) return;
    await performSearch();
  });

  useEffect(() => {
    if (!refreshToken) return;
    if (!from || !to || !date) return;
    void performSearch();
  }, [refreshToken, from, to, date, performSearch]);

  const STICKY_BAR_HEIGHT = 88;
  const canSearch = !!from && !!to && !!date && !loading;
  return (
    <View style={[styles.container, { flex: 1 }]}> 
      <View style={{ flex: 1, paddingBottom: STICKY_BAR_HEIGHT }}>
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
        {loading && <ActivityIndicator style={{ marginTop: 24 }} size="large" color="#DC3545" />}
        {searched && !loading && (
          <View style={styles.resultsContainer}>
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : flights.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="airplane-outline" size={48} color="#ddd" />
                <Text style={styles.emptyText}>No flights found for this search.</Text>
              </View>
            ) : (
              <>
                <Pressable style={styles.postRequestBtn}><Text style={styles.postRequestBtnText}>Post Load Request</Text></Pressable>
                <FlatList
                  data={flights}
                  keyExtractor={item => item.id}
                  refreshControl={
                    <RefreshControl
                      refreshing={loadsSearchPullRefreshing}
                      onRefresh={onLoadsSearchPullRefresh}
                      colors={REFRESH_CONTROL_COLORS}
                      tintColor={REFRESH_TINT}
                    />
                  }
                  renderItem={({ item }) => {
                    const depart = new Date(item.depart_at);
                    const arrive = new Date(item.arrive_at);
                    const durMs = Math.max(0, arrive.getTime() - depart.getTime());
                    const durH = Math.floor(durMs / 3600000);
                    const durM = Math.floor((durMs % 3600000) / 60000);
                    return (
                      <FlightCard
                        flightNumber={[item.airline_code, item.flight_number].filter(Boolean).join(' ')}
                        route={`${item.from_airport} → ${item.to_airport}`}
                        departTime={depart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        arriveTime={arrive.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        duration={`${durH}h ${durM}m`}
                        reportCount={0}
                        onPress={() => {}}
                      />
                    );
                  }}
                  contentContainerStyle={{ paddingBottom: 32 }}
                />
              </>
            )}
          </View>
        )}
      </View>
      {/* Sticky Search Loads button bar */}
      <View style={[styles.stickyBar, { paddingBottom: 12 + insets.bottom }]}> 
        <Pressable
          onPress={() => {
            console.log('Search Loads pressed');
            handleSearch();
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
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
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
  recentBtnText: { color: '#DC3545', fontWeight: '600', marginLeft: 6 },
  optionsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14 },
  optionsBtnText: { color: '#DC3545', fontWeight: '600', marginLeft: 6 },
  disclaimerCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff5f5', borderRadius: 10, padding: 12, marginTop: 16 },
  disclaimerText: { color: '#DC3545', fontSize: 13, flex: 1 },
  postRequestBtn: { backgroundColor: '#fff5f5', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#DC3545' },
  postRequestBtnText: { color: '#DC3545', fontWeight: '700', fontSize: 16 },
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
    backgroundColor: '#B3121A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  resultsContainer: { flex: 1, marginTop: 16 },
  errorText: { color: '#DC3545', fontWeight: '700', fontSize: 16, textAlign: 'center', marginTop: 24 },
  emptyState: { alignItems: 'center', marginTop: 32 },
  emptyText: { color: '#888', fontSize: 16, marginTop: 12 },
});
