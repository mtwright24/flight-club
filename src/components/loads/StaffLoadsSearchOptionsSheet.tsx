import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../styles/theme';
import type { StaffLoadSearchOptions } from '../../lib/supabase/staffLoads';

type Props = {
  visible: boolean;
  onClose: () => void;
  options: StaffLoadSearchOptions;
  setOptions: (o: StaffLoadSearchOptions) => void;
};

export default function StaffLoadsSearchOptionsSheet({ visible, onClose, options, setOptions }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Search options</Text>
          <Text style={styles.hint}>These apply to your next search and to posted requests.</Text>

          <Text style={styles.sectionLabel}>Stops</Text>
          <View style={styles.segRow}>
            <Pressable
              style={[styles.seg, !options.allowStops && styles.segOn]}
              onPress={() => setOptions({ ...options, allowStops: false, maxStops: 0 })}
            >
              <Text style={!options.allowStops ? styles.segTxOn : styles.segTx}>Nonstop</Text>
            </Pressable>
            <Pressable
              style={[styles.seg, options.allowStops && options.maxStops === 1 && styles.segOn]}
              onPress={() => setOptions({ ...options, allowStops: true, maxStops: 1 })}
            >
              <Text style={options.allowStops && options.maxStops === 1 ? styles.segTxOn : styles.segTx}>≤ 1</Text>
            </Pressable>
            <Pressable
              style={[styles.seg, options.allowStops && options.maxStops === 2 && styles.segOn]}
              onPress={() => setOptions({ ...options, allowStops: true, maxStops: 2 })}
            >
              <Text style={options.allowStops && options.maxStops === 2 ? styles.segTxOn : styles.segTx}>≤ 2</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Airports</Text>
          <Pressable
            style={styles.choiceRow}
            onPress={() => setOptions({ ...options, nearbyDepartureAirports: !options.nearbyDepartureAirports })}
          >
            <View style={styles.choiceTextCol}>
              <Text style={styles.choiceTitle}>Nearby departure airports</Text>
              <Text style={styles.choiceSub}>Include alternate origins when searching.</Text>
            </View>
            <Ionicons
              name={options.nearbyDepartureAirports ? 'checkmark-circle' : 'ellipse-outline'}
              size={26}
              color={options.nearbyDepartureAirports ? colors.headerRed : '#cbd5e1'}
            />
          </Pressable>
          <Pressable
            style={styles.choiceRow}
            onPress={() => setOptions({ ...options, nearbyArrivalAirports: !options.nearbyArrivalAirports })}
          >
            <View style={styles.choiceTextCol}>
              <Text style={styles.choiceTitle}>Nearby arrival airports</Text>
              <Text style={styles.choiceSub}>Include alternate destinations when searching.</Text>
            </View>
            <Ionicons
              name={options.nearbyArrivalAirports ? 'checkmark-circle' : 'ellipse-outline'}
              size={26}
              color={options.nearbyArrivalAirports ? colors.headerRed : '#cbd5e1'}
            />
          </Pressable>

          <Pressable style={styles.done} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28 },
  title: { fontWeight: '800', fontSize: 18, color: '#111' },
  hint: { color: '#64748b', fontSize: 13, marginTop: 6, marginBottom: 16, lineHeight: 18 },
  sectionLabel: { fontWeight: '700', fontSize: 12, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  segRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  seg: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  segOn: { backgroundColor: 'rgba(181, 22, 30, 0.1)', borderColor: colors.headerRed },
  segTx: { fontWeight: '700', fontSize: 14, color: '#334155' },
  segTxOn: { fontWeight: '800', fontSize: 14, color: colors.headerRed },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    gap: 12,
  },
  choiceTextCol: { flex: 1 },
  choiceTitle: { fontWeight: '600', fontSize: 15, color: '#0f172a' },
  choiceSub: { fontSize: 12, color: '#94a3b8', marginTop: 4, lineHeight: 16 },
  done: { marginTop: 18, alignItems: 'center', paddingVertical: 14 },
  doneText: { color: colors.headerRed, fontWeight: '800', fontSize: 16 },
});
