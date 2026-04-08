import React from 'react';
import { Modal, View, Text, StyleSheet, FlatList, Pressable, TextInput } from 'react-native';
import { colors } from '../../styles/theme';

const AIRPORTS = [
  { code: 'JFK', name: 'New York JFK' },
  { code: 'LGA', name: 'New York LaGuardia' },
  { code: 'EWR', name: 'Newark Liberty' },
  { code: 'LAX', name: 'Los Angeles' },
  { code: 'ORD', name: "Chicago O'Hare" },
  { code: 'DFW', name: 'Dallas/Fort Worth' },
  { code: 'ATL', name: 'Atlanta' },
  { code: 'SFO', name: 'San Francisco' },
  { code: 'MIA', name: 'Miami' },
  { code: 'SEA', name: 'Seattle' },
  // ...add more as needed
];

export default function AirportPickerModal({ visible, onSelect, onClose, selected }: any) {
  const [search, setSearch] = React.useState('');
  const filtered = AIRPORTS.filter(a =>
    a.code.toLowerCase().includes(search.toLowerCase()) ||
    a.name.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <TextInput
            style={styles.input}
            placeholder="Search airport..."
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          <FlatList
            data={filtered}
            keyExtractor={item => item.code}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.row, selected === item.code && styles.selectedRow]}
                onPress={() => { onSelect(item.code); onClose(); }}
              >
                <Text style={styles.code}>{item.code}</Text>
                <Text style={styles.name}>{item.name}</Text>
              </Pressable>
            )}
          />
          <Pressable style={styles.closeBtn} onPress={onClose}><Text style={styles.closeText}>Cancel</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, maxHeight: '80%' },
  input: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 10, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  selectedRow: { backgroundColor: 'rgba(181, 22, 30, 0.06)' },
  code: { fontWeight: '700', fontSize: 16, width: 60 },
  name: { fontSize: 15, color: '#333' },
  closeBtn: { alignItems: 'center', marginTop: 12 },
  closeText: { color: colors.headerRed, fontWeight: '700', fontSize: 16 },
});
