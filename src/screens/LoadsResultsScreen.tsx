import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { FlightCard } from '../components/loads/FlightCard';
import { NonRevLoadFlight, searchFlights } from '../lib/supabase/loads';
import { colors } from '../styles/theme';

export default function LoadsResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const airline = params.airline as string;
  const from = params.from as string;
  const to = params.to as string;
  const date = params.date as string;

  const [flights, setFlights] = useState<NonRevLoadFlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'depart' | 'arrive' | 'reports'>('depart');
  const [nonstopOnly, setNonstopOnly] = useState(false);

  useEffect(() => {
    loadFlights();
  }, [airline, from, to, date]);

  const loadFlights = async () => {
    try {
      setLoading(true);
      setError(null);

      // For MVP, we don't have user ID yet - will get it from auth context in full impl
      const { flights: data, error: searchError } = await searchFlights(
        'mock-user-id',
        airline,
        from,
        to,
        date
      );

      if (searchError) {
        setError(searchError);
        setFlights([]);
      } else {
        setFlights(data);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load flights');
    } finally {
      setLoading(false);
    }
  };

  const sorted = [...flights].sort((a, b) => {
    switch (sortBy) {
      case 'depart':
        return new Date(a.depart_at).getTime() - new Date(b.depart_at).getTime();
      case 'arrive':
        return new Date(a.arrive_at).getTime() - new Date(b.arrive_at).getTime();
      case 'reports':
        // Would need report counts from API
        return 0;
      default:
        return 0;
    }
  });

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const calculateDuration = (from: string, to: string) => {
    const durationMs = new Date(to).getTime() - new Date(from).getTime();
    const hours = Math.floor(durationMs / 3600000);
    const minutes = Math.floor((durationMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Results</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search Summary */}
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {airline} • {from} → {to} • {date}
        </Text>
      </View>

      {/* Sort/Filter Row */}
      <View style={styles.controlsRow}>
        <Pressable
          style={[styles.sortButton, sortBy === 'depart' && styles.sortButtonActive]}
          onPress={() => setSortBy('depart')}
        >
          <Text
            style={[
              styles.sortButtonText,
              sortBy === 'depart' && styles.sortButtonTextActive,
            ]}
          >
            Depart
          </Text>
        </Pressable>
        <Pressable
          style={[styles.sortButton, sortBy === 'arrive' && styles.sortButtonActive]}
          onPress={() => setSortBy('arrive')}
        >
          <Text
            style={[
              styles.sortButtonText,
              sortBy === 'arrive' && styles.sortButtonTextActive,
            ]}
          >
            Arrive
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterButton, nonstopOnly && styles.filterButtonActive]}
          onPress={() => setNonstopOnly(!nonstopOnly)}
        >
          <Ionicons
            name="settings-outline"
            size={16}
            color={nonstopOnly ? '#DC3545' : '#666'}
          />
          <Text
            style={[
              styles.filterButtonText,
              nonstopOnly && styles.filterButtonTextActive,
            ]}
          >
            Nonstop
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#DC3545" />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#DC3545" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={loadFlights}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="airplane-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No flights found</Text>
          <Text style={styles.emptySubtext}>Try another date or route</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/load-details/${item.id}`)}>
              <FlightCard
                flightNumber={item.flight_number}
                route={`${item.from_airport} → ${item.to_airport}`}
                departTime={formatTime(item.depart_at)}
                arriveTime={formatTime(item.arrive_at)}
                duration={calculateDuration(item.depart_at, item.arrive_at)}
                reportCount={0} // Will be populated from reports in full impl
                onPress={() => router.push(`/load-details/${item.id}`)}
              />
            </Pressable>
          )}
          contentContainerStyle={{ paddingVertical: 8 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 44,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.headerRed,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  summary: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#f9f9f9',
  },
  summaryText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  sortButtonActive: {
    backgroundColor: '#DC3545',
  },
  sortButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  sortButtonTextActive: {
    color: '#fff',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    marginLeft: 'auto',
  },
  filterButtonActive: {
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: colors.headerRed,
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  filterButtonTextActive: {
    color: colors.headerRed,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    color: colors.headerRed,
    marginTop: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.headerRed,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
});
