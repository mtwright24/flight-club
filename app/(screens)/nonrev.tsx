import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../src/components/AppHeader';
import AirportPickerModal from '../../src/components/loads/AirportPickerModal';
import OptionsSheet from '../../src/components/loads/OptionsSheet';
import CreditsPurchaseSheet from '../../src/components/credits/CreditsPurchaseSheet';
import { createLoadRequest, getCreditsBalance, spendCredit, grantCredits } from '../../src/lib/supabase/loads';

export default function NonRevScreen() {
  const [airline, setAirline] = useState('B6');
  const [fromAirport, setFromAirport] = useState('');
  const [toAirport, setToAirport] = useState('');
  const [travelDate, setTravelDate] = useState('');
  const [options, setOptions] = useState({ cabin: 'Any', travelerType: 'Non-rev', timeWindow: 'Any', maxConnections: 0, directOnly: false, saveDefault: false });
  const [showFromModal, setShowFromModal] = useState(false);
  const [showToModal, setShowToModal] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [loading, setLoading] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [error, setError] = useState('');

  React.useEffect(() => {
    getCreditsBalance().then(res => setCredits(res.data?.balance ?? 0));
  }, []);

  const handleSwap = () => {
    setFromAirport(toAirport);
    setToAirport(fromAirport);
  };

  const handleSearch = async () => {
    setError('');
    if (!fromAirport || !toAirport || !travelDate) return;
    setLoading(true);
    try {
      if ((credits ?? 0) < 1) {
        setShowCredits(true);
        setLoading(false);
        return;
      }
      // Spend credit and create request
      await spendCredit(1, 'Post load request', 'loads');
      await createLoadRequest({ airline_code: airline, from_airport: fromAirport, to_airport: toAirport, travel_date: travelDate, options });
      // TODO: Navigate to results screen
    } catch (e: any) {
      setError(e.message || 'Error posting request');
    }
    setLoading(false);
  };

  const handlePurchase = async (amount: number) => {
    setLoading(true);
    await grantCredits(amount, 'Purchase', 'iap');
    setShowCredits(false);
    setCredits((c) => (c ?? 0) + amount);
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Non-Rev Loads" />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.modalTitle}>Where to?</Text>
          {/* Airline Picker */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Airline</Text>
            <Pressable style={styles.pill} onPress={() => setShowOptions(true)}>
              <Text style={styles.pillText}>{airline}</Text>
              <Ionicons name="chevron-down" size={18} color="#DC3545" />
            </Pressable>
          </View>
          {/* From/To Airport */}
          <View style={styles.airportRow}>
            <Text style={styles.sectionLabel}>From</Text>
            <Pressable style={styles.pill} onPress={() => setShowFromModal(true)}>
              <Text style={styles.pillText}>{fromAirport || 'Select'}</Text>
            </Pressable>
            <Pressable style={styles.swapButton} onPress={handleSwap}>
              <Ionicons name="swap-horizontal" size={20} color="#DC3545" />
            </Pressable>
            <Text style={styles.sectionLabel}>To</Text>
            <Pressable style={styles.pill} onPress={() => setShowToModal(true)}>
              <Text style={styles.pillText}>{toAirport || 'Select'}</Text>
            </Pressable>
          </View>
          {/* Date Picker */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Date</Text>
            <Pressable style={styles.pill}>
              <Text style={styles.pillText}>{travelDate || 'Select'}</Text>
            </Pressable>
          </View>
        </View>
        {/* Options/Recent/Disclaimer */}
        <View style={styles.chipRow}>
          <Pressable style={styles.chip}><Text style={styles.chipText}>Recent</Text></Pressable>
          <Pressable style={styles.chip} onPress={() => setShowOptions(true)}><Text style={styles.chipText}>Options</Text></Pressable>
        </View>
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle" size={16} color="#666" />
          <Text style={styles.disclaimerText}>Community-reported loads. Verify in official airline systems. Flight Club does not access or automate airline systems.</Text>
        </View>
        {!!error && <Text style={{ color: '#DC3545', marginTop: 12 }}>{error}</Text>}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          style={[styles.searchButton, (!fromAirport || !toAirport || !travelDate || loading) && styles.searchButtonDisabled]}
          onPress={handleSearch}
          disabled={!fromAirport || !toAirport || !travelDate || loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchButtonText}>Search Loads</Text>}
        </Pressable>
      </View>
      {/* Modals */}
      <AirportPickerModal visible={showFromModal} onSelect={setFromAirport} onClose={() => setShowFromModal(false)} selected={fromAirport} />
      <AirportPickerModal visible={showToModal} onSelect={setToAirport} onClose={() => setShowToModal(false)} selected={toAirport} />
      <OptionsSheet visible={showOptions} onClose={() => setShowOptions(false)} options={options} setOptions={setOptions} />
      <CreditsPurchaseSheet visible={showCredits} onClose={() => setShowCredits(false)} onPurchase={handlePurchase} />
    </View>
  );
}

// Simple Airport Modal
const SimpleAirportModal = ({ visible, onSelect, onClose, selected, title }: any) => {
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
                style={[styles.optionRow, selected === code && { backgroundColor: '#fff5f5' }]}
                onPress={() => {
                  onSelect(code);
                  onClose();
                }}
              >
                <Text style={styles.optionText}>{code}</Text>
                {selected === code && <Ionicons name="checkmark-circle" size={20} color="#DC3545" />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// Simple Airline Modal
const SimpleAirlineModal = ({ visible, onSelect, onClose, selected }: any) => {
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
              style={[styles.optionRow, selected === airline.code && { backgroundColor: '#fff5f5' }]}
              onPress={() => {
                onSelect(airline.code);
                onClose();
              }}
            >
              <View>
                <Text style={styles.optionText}>{airline.name}</Text>
                <Text style={{ fontSize: 12, color: '#999' }}>{airline.code}</Text>
              </View>
              {selected === airline.code && <Ionicons name="checkmark-circle" size={20} color="#DC3545" />}
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
};

// Date Picker Modal
const DatePickerModal = ({ visible, onSelect, onClose }: any) => {
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
                const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#DC3545',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  creditsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  creditsText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  section: {
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
  },
  pillText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  airportRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  airportPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
  },
  airportPillText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  swapButton: {
    marginHorizontal: 6,
    padding: 4,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
  },
  datePillText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
  },
  chipText: {
    fontSize: 13,
    color: '#666',
  },
  disclaimerBox: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  searchButton: {
    backgroundColor: '#DC3545',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  searchButtonDisabled: {
    backgroundColor: '#ccc',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
  dateInput: {
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginTop: 8,
  },
  dateQuickChips: {
    flexDirection: 'row',
    gap: 8,
  },
  dateQuickChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  dateQuickChipText: {
    fontSize: 14,
    color: '#333',
  },
});
