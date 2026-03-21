import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const AIRPORTS = [
  { code: 'JFK', city: 'New York', name: 'John F. Kennedy Intl' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles Intl' },
  { code: 'ORD', city: 'Chicago', name: "Chicago O'Hare Intl" },
  { code: 'DFW', city: 'Dallas', name: 'Dallas/Fort Worth Intl' },
  { code: 'DEN', city: 'Denver', name: 'Denver Intl' },
  { code: 'SFO', city: 'San Francisco', name: 'San Francisco Intl' },
  { code: 'LAS', city: 'Las Vegas', name: 'Harry Reid Intl' },
  { code: 'MIA', city: 'Miami', name: 'Miami Intl' },
  { code: 'ATL', city: 'Atlanta', name: 'Hartsfield-Jackson Intl' },
  { code: 'BOS', city: 'Boston', name: 'Boston Logan Intl' },
  { code: 'SEA', city: 'Seattle', name: 'Seattle-Tacoma Intl' },
  { code: 'FLL', city: 'Fort Lauderdale', name: 'Fort Lauderdale-Hollywood' },
  { code: 'MSP', city: 'Minneapolis', name: 'Minneapolis-St Paul Intl' },
  { code: 'DTW', city: 'Detroit', name: 'Detroit Metro' },
  { code: 'PHX', city: 'Phoenix', name: 'Phoenix Sky Harbor Intl' },
  { code: 'PHL', city: 'Philadelphia', name: 'Philadelphia Intl' },
  { code: 'IAH', city: 'Houston', name: 'Houston Intl' },
  { code: 'IAD', city: 'Washington DC', name: 'Washington Dulles Intl' },
  { code: 'LGA', city: 'New York', name: 'LaGuardia' },
  { code: 'MCO', city: 'Orlando', name: 'Orlando Intl' },
  { code: 'EWR', city: 'Newark', name: 'Newark Liberty Intl' },
  { code: 'MSY', city: 'New Orleans', name: 'Louis Armstrong Intl' },
  { code: 'SAN', city: 'San Diego', name: 'San Diego Intl' },
  { code: 'LIH', city: 'Kauai', name: 'Lihue Airport' },
  { code: 'OGG', city: 'Maui', name: 'Kahului Airport' },
  { code: 'HNL', city: 'Honolulu', name: 'Honolulu Intl' },
  { code: 'SJC', city: 'San Jose', name: 'San Jose Intl' },
  { code: 'MEX', city: 'Mexico City', name: 'Mexico City Intl' },
  { code: 'TUN', city: 'Turks & Caicos', name: 'Providenciales Intl' },
  { code: 'SXM', city: 'St. Martin', name: 'Princess Juliana Intl' },
];

interface AirportPickerModalProps {
  visible: boolean;
  onSelect: (airport: { code: string; city: string; name: string }) => void;
  onClose: () => void;
  selected?: string;
}

export const AirportPickerModal: React.FC<AirportPickerModalProps> = ({
  visible,
  onSelect,
  onClose,
  selected,
}) => {
  const [search, setSearch] = React.useState('');

  const filtered = useMemo(() => {
    if (!search) return AIRPORTS;
    const q = search.toLowerCase();
    return AIRPORTS.filter(
      (a) => a.code.toLowerCase().includes(q) || a.city.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', paddingTop: 20 }} edges={['top']}> 
        <View style={styles.header}>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color="#DC3545" />
          </Pressable>
          <Text style={styles.headerTitle}>Select Airport</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by code or city..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#ccc"
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.airportRow,
                selected === item.code && styles.airportRowSelected,
              ]}
              onPress={() => {
                onSelect(item);
                onClose();
              }}
            >
              <View style={styles.airportInfo}>
                <Text style={styles.airportCode}>{item.code}</Text>
                <Text style={styles.airportCity}>{item.city}</Text>
              </View>
              {selected === item.code && (
                <Ionicons name="checkmark-circle" size={24} color="#DC3545" />
              )}
            </Pressable>
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      </SafeAreaView>
    </Modal>
  );
};

interface AirlinePickerModalProps {
  visible: boolean;
  onSelect: (airline: { code: string; name: string }) => void;
  onClose: () => void;
  selected?: string;
}

const AIRLINES = [
  { code: 'B6', name: 'JetBlue' },
  { code: 'UA', name: 'United' },
  { code: 'DL', name: 'Delta' },
  { code: 'AA', name: 'American' },
  { code: 'WN', name: 'Southwest' },
  { code: 'AS', name: 'Alaska' },
  { code: 'F9', name: 'Frontier' },
  { code: 'SY', name: 'Sun Country' },
  { code: 'NK', name: 'Spirit' },
  { code: 'G4', name: 'Allegiant' },
];

export const AirlinePickerModal: React.FC<AirlinePickerModalProps> = ({
  visible,
  onSelect,
  onClose,
  selected,
}) => {
  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.header}>
        <Pressable onPress={onClose}>
          <Ionicons name="close" size={24} color="#DC3545" />
        </Pressable>
        <Text style={styles.headerTitle}>Select Airline</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={AIRLINES}
        keyExtractor={(item) => item.code}
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.airlineRow,
              selected === item.code && styles.airlineRowSelected,
            ]}
            onPress={() => {
              onSelect(item);
              onClose();
            }}
          >
            <View>
              <Text style={styles.airlineName}>{item.name}</Text>
              <Text style={styles.airlineCode}>{item.code}</Text>
            </View>
            {selected === item.code && (
              <Ionicons name="checkmark-circle" size={24} color="#DC3545" />
            )}
          </Pressable>
        )}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 20 }}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#000',
  },
  airportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  airportRowSelected: {
    backgroundColor: '#fff5f5',
  },
  airportInfo: {
    flex: 1,
  },
  airportCode: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  airportCity: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  airlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  airlineRowSelected: {
    backgroundColor: '#fff5f5',
  },
  airlineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  airlineCode: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
});
