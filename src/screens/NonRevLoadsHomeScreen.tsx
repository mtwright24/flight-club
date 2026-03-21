import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { colors } from '../../src/styles/theme';

export default function NonRevLoadsHomeScreen() {
  const router = useRouter();

  const [airline, setAirline] = useState('B6');
  const [fromAirport, setFromAirport] = useState('');
  const [toAirport, setToAirport] = useState('');
  const [travelDate, setTravelDate] = useState('');
  const [creditsBalance] = useState(0);

  const [showAirlineModal, setShowAirlineModal] = useState(false);
  const [showFromModal, setShowFromModal] = useState(false);
  const [showToModal, setShowToModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);

  const handleSearch = () => {
    if (!fromAirport || !toAirport || !travelDate) {
      alert('Please fill in all fields');
      return;
    }

    router.push({
      pathname: '/loads-results',
      params: {
        airline,
        from: fromAirport,
        to: toAirport,
        date: travelDate,
      },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Non-Rev / Staff Loads</Text>
        <View style={styles.headerRight}>
          <Pressable style={styles.creditsButton}>
            <Ionicons name="wallet" size={18} color="#fff" />
            <Text style={styles.creditsText}>{creditsBalance}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Airline Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Airline</Text>
          <Pressable
            style={styles.pill}
            onPress={() => setShowAirlineModal(true)}
          >
            <Text style={styles.pillText}>{airline}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.headerRed} />
          </Pressable>
        </View>

        {/* Airport Selectors */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Where to?</Text>
          <View style={styles.airportRow}>
            <Pressable
              style={[styles.airportPill, { flex: 1 }]}
              onPress={() => setShowFromModal(true)}
            >
              <Ionicons name="airplane" size={18} color={colors.headerRed} />
              <Text style={[styles.airportPillText, !fromAirport && { color: '#ccc' }]}>
                {fromAirport || 'From'}
              </Text>
            </Pressable>

            <Pressable style={styles.swapButton}>
              <Ionicons name="swap-vertical" size={18} color="#666" />
            </Pressable>

            <Pressable
              style={[styles.airportPill, { flex: 1, marginLeft: 8 }]}
              onPress={() => setShowToModal(true)}
            >
              <Ionicons name="location" size={18} color={colors.headerRed} />
              <Text style={[styles.airportPillText, !toAirport && { color: '#ccc' }]}>
                {toAirport || 'To'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Date Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Travel Date</Text>
          <Pressable
            style={styles.datePill}
            onPress={() => setShowDateModal(true)}
          >
            <Ionicons name="calendar" size={18} color="#DC3545" />
            <Text style={[styles.datePillText, !travelDate && { color: '#ccc' }]}>
              {travelDate || 'Select date'}
            </Text>
          </Pressable>
        </View>

        {/* Quick Chips */}
        <View style={styles.section}>
          <View style={styles.chipRow}>
            <Pressable style={styles.chip}>
              <Text style={styles.chipText}>Recent</Text>
            </Pressable>
            <Pressable style={styles.chip}>
              <Text style={styles.chipText}>Options</Text>
            </Pressable>
          </View>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle" size={16} color="#666" />
          <Text style={styles.disclaimerText}>
            Loads are community-reported and may be inaccurate. Always verify in official systems.
          </Text>
        </View>
      </ScrollView>

      {/* Search Button */}
      <View style={styles.footer}>
        <Pressable
          style={[
            styles.searchButton,
            (!fromAirport || !toAirport || !travelDate) && styles.searchButtonDisabled,
          ]}
          onPress={handleSearch}
          disabled={!fromAirport || !toAirport || !travelDate}
        >
          <Text style={styles.searchButtonText}>Search Loads</Text>
        </Pressable>
      </View>

      {/* Modals */}
      <SimpleAirlineModal
        visible={showAirlineModal}
        onClose={() => setShowAirlineModal(false)}
        onSelect={(code) => setAirline(code)}
        selected={airline}
      />

      <SimpleAirportModal
        visible={showFromModal}
        onClose={() => setShowFromModal(false)}
        onSelect={(code) => setFromAirport(code)}
        selected={fromAirport}
        title="From Airport"
      />

      <SimpleAirportModal
        visible={showToModal}
        onClose={() => setShowToModal(false)}
        onSelect={(code) => setToAirport(code)}
        selected={toAirport}
        title="To Airport"
      />

      {/* Simple Date Modal - MVP */}
      <DatePickerModal
        visible={showDateModal}
        onClose={() => setShowDateModal(false)}
        onSelect={(date) => setTravelDate(date)}
      />
    </View>
  );
}

// Simple Airport Modal
interface SimpleAirportModalProps {
  visible: boolean;
  onSelect: (code: string) => void;
  onClose: () => void;
  selected?: string;
  title: string;
}

const SimpleAirportModal: React.FC<SimpleAirportModalProps> = ({
  visible,
  onSelect,
  onClose,
  selected,
  title,
}) => {
  const airports = ['JFK', 'LAX', 'ORD', 'DFW', 'ATL', 'SFO', 'MIA', 'BOS', 'SEA', 'LAS'];
  
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose}>
              <Text style={{ color: '#DC3545', fontSize: 16 }}>Close</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{title}</Text>
            <View style={{ width: 50 }} />
          </View>
          
          <ScrollView style={{ maxHeight: 300 }}>
            {airports.map((code) => (
              <Pressable
                key={code}
                style={[
                  styles.optionRow,
                  selected === code && { backgroundColor: '#fff5f5' },
                ]}
                onPress={() => {
                  onSelect(code);
                  onClose();
                }}
              >
                <Text style={styles.optionText}>{code}</Text>
                {selected === code && (
                  <Ionicons name="checkmark-circle" size={20} color="#DC3545" />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// Simple Airline Modal
interface SimpleAirlineModalProps {
  visible: boolean;
  onSelect: (code: string) => void;
  onClose: () => void;
  selected?: string;
}

const SimpleAirlineModal: React.FC<SimpleAirlineModalProps> = ({
  visible,
  onSelect,
  onClose,
  selected,
}) => {
  const airlines = [
    { code: 'B6', name: 'JetBlue' },
    { code: 'UA', name: 'United' },
    { code: 'DL', name: 'Delta' },
    { code: 'AA', name: 'American' },
    { code: 'WN', name: 'Southwest' },
  ];
  
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose}>
              <Text style={{ color: '#DC3545', fontSize: 16 }}>Close</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Select Airline</Text>
            <View style={{ width: 50 }} />
          </View>
          
          {airlines.map((airline) => (
            <Pressable
              key={airline.code}
              style={[
                styles.optionRow,
                selected === airline.code && { backgroundColor: '#fff5f5' },
              ]}
              onPress={() => {
                onSelect(airline.code);
                onClose();
              }}
            >
              <View>
                <Text style={styles.optionText}>{airline.name}</Text>
                <Text style={{ fontSize: 12, color: '#999' }}>{airline.code}</Text>
              </View>
              {selected === airline.code && (
                <Ionicons name="checkmark-circle" size={20} color="#DC3545" />
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
};

interface DatePickerModalProps {
  visible: boolean;
  onSelect: (date: string) => void;
  onClose: () => void;
}

const DatePickerModal: React.FC<DatePickerModalProps> = ({ visible, onSelect, onClose }) => {
  const [input, setInput] = React.useState('');

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose}>
              <Text style={{ color: '#DC3545', fontSize: 16 }}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Select Date</Text>
            <Pressable
              onPress={() => {
                if (input.match(/\d{4}-\d{2}-\d{2}/)) {
                  onSelect(input);
                  onClose();
                }
              }}
            >
              <Text style={{ color: '#DC3545', fontSize: 16, fontWeight: '600' }}>Done</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.dateInput}
            placeholder="YYYY-MM-DD"
            value={input}
            onChangeText={setInput}
          />

          <View style={{ height: 1, backgroundColor: '#eee', marginVertical: 16 }} />

          <View style={styles.dateQuickChips}>
            <Pressable
              style={styles.dateQuickChip}
              onPress={() => {
                const today = new Date().toISOString().split('T')[0];
                setInput(today);
              }}
            >
              <Text style={styles.dateQuickChipText}>Today</Text>
            </Pressable>
            <Pressable
              style={styles.dateQuickChip}
              onPress={() => {
                const tomorrow = new Date(Date.now() + 86400000)
                  .toISOString()
                  .split('T')[0];
                setInput(tomorrow);
              }}
            >
              <Text style={styles.dateQuickChipText}>Tomorrow</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 44, // Status bar padding
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#DC3545',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  creditsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
  },
  creditsText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
  },
  pillText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  airportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  airportPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
  },
  airportPillText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  swapButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 18,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
  },
  datePillText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  disclaimerBox: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 20,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  searchButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#DC3545',
    borderRadius: 8,
    alignItems: 'center',
  },
  searchButtonDisabled: {
    backgroundColor: '#ccc',
  },
  searchButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  dateInput: {
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 16,
  },
  dateQuickChips: {
    flexDirection: 'row',
    gap: 8,
  },
  dateQuickChip: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignItems: 'center',
  },
  dateQuickChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
});
