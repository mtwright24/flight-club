import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DEFAULT_AIRPORTS = [
  { code: 'JFK', name: 'New York (JFK)' },
  { code: 'LGA', name: 'New York (LGA)' },
  { code: 'EWR', name: 'Newark (EWR)' },
  { code: 'BOS', name: 'Boston (BOS)' },
  { code: 'FLL', name: 'Fort Lauderdale (FLL)' },
  { code: 'MCO', name: 'Orlando (MCO)' },
  { code: 'MIA', name: 'Miami (MIA)' },
  { code: 'LAX', name: 'Los Angeles (LAX)' },
  { code: 'SFO', name: 'San Francisco (SFO)' },
  { code: 'SEA', name: 'Seattle (SEA)' },
  { code: 'PDX', name: 'Portland (PDX)' },
  { code: 'DEN', name: 'Denver (DEN)' },
  { code: 'ORD', name: 'Chicago (ORD)' },
  { code: 'IAH', name: 'Houston (IAH)' },
  { code: 'ATL', name: 'Atlanta (ATL)' },
  { code: 'DTW', name: 'Detroit (DTW)' },
  { code: 'MSP', name: 'Minneapolis (MSP)' },
  { code: 'SLC', name: 'Salt Lake City (SLC)' },
  { code: 'PHX', name: 'Phoenix (PHX)' },
  { code: 'LAS', name: 'Las Vegas (LAS)' },
  { code: 'CLT', name: 'Charlotte (CLT)' },
  { code: 'DFW', name: 'Dallas/Fort Worth (DFW)' },
  { code: 'DAL', name: 'Dallas Love (DAL)' },
  { code: 'MDW', name: 'Chicago Midway (MDW)' },
  { code: 'BWI', name: 'Baltimore (BWI)' },
  { code: 'ANC', name: 'Anchorage (ANC)' },
];

interface AirportPickerFieldProps {
  label?: string;
  value?: string;
  values?: string[];
  placeholder?: string;
  multiSelect?: boolean;
  onChange: (value: string | string[]) => void;
}

export const AirportPickerField: React.FC<AirportPickerFieldProps> = ({
  label,
  value,
  values,
  placeholder = 'Select airport',
  multiSelect = false,
  onChange,
}) => {
  const styles = getStyles();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [multiValues, setMultiValues] = useState<string[]>(values || []);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return DEFAULT_AIRPORTS;
    return DEFAULT_AIRPORTS.filter(
      (airport) =>
        airport.code.toLowerCase().includes(term) || airport.name.toLowerCase().includes(term)
    );
  }, [search]);

  const openModal = () => {
    setSearch('');
    setMultiValues(values || []);
    setOpen(true);
  };

  const confirmMulti = () => {
    onChange(multiValues);
    setOpen(false);
  };

  const toggleMulti = (code: string) => {
    setMultiValues((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const renderPills = (list: string[]) => (
    <View style={styles.pillRow}>
      {list.map((code) => (
        <View key={code} style={styles.pill}>
          <Text style={styles.pillText}>{code}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.field} onPress={openModal}>
        {multiSelect ? (
          values && values.length > 0 ? (
            renderPills(values)
          ) : (
            <Text style={styles.placeholder}>{placeholder}</Text>
          )
        ) : (
          <Text style={value ? styles.valueText : styles.placeholder}>{value || placeholder}</Text>
        )}
        <Ionicons name="chevron-down" size={18} color="#000000" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.modal}>
            <Text style={styles.title}>Select Airport</Text>
            <TextInput
              style={styles.search}
              placeholder="Search by code or city"
              placeholderTextColor="#999"
              value={search}
              onChangeText={setSearch}
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => {
                    if (multiSelect) toggleMulti(item.code);
                    else {
                      onChange(item.code);
                      setOpen(false);
                    }
                  }}
                >
                  <Text style={styles.code}>{item.code}</Text>
                  <Text style={styles.name}>{item.name}</Text>
                  {multiSelect && multiValues.includes(item.code) && (
                    <Ionicons name="checkmark-circle" size={16} color="#DC3545" />
                  )}
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
            {multiSelect && (
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => setOpen(false)}>
                  <Text style={styles.actionText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmMulti}>
                  <Text style={[styles.actionText, styles.actionPrimary]}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const getStyles = () =>
  StyleSheet.create({
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: '#666666',
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    field: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#E0E0E0',
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: '#F9F9F9',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    valueText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#000000',
    },
    placeholder: {
      fontSize: 13,
      color: '#999999',
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      flex: 1,
    },
    pill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: '#EEEEEE',
    },
    pillText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#000000',
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    modal: {
      width: '100%',
      maxWidth: 420,
      maxHeight: 520,
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      padding: 16,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: '#000000',
      marginBottom: 10,
    },
    search: {
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#E0E0E0',
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: '#000000',
      backgroundColor: '#F9F9F9',
      marginBottom: 10,
    },
    item: {
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#F0F0F0',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    code: {
      fontSize: 13,
      fontWeight: '700',
      color: '#DC3545',
      width: 50,
    },
    name: {
      fontSize: 13,
      color: '#000000',
      flex: 1,
    },
    actions: {
      marginTop: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    actionText: {
      fontSize: 14,
      color: '#000000',
    },
    actionPrimary: {
      color: '#DC3545',
      fontWeight: '700',
    },
  });
