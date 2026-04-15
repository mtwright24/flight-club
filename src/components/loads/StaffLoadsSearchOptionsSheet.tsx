import React from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
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
          <Text style={styles.hint}>Applied to your next flight search.</Text>

          <View style={styles.rowBetween}>
            <Text style={styles.label}>Include flights with stops</Text>
            <Switch
              value={options.allowStops}
              onValueChange={(v) => setOptions({ ...options, allowStops: v, maxStops: v ? options.maxStops || 1 : 0 })}
            />
          </View>

          {options.allowStops ? (
            <>
              <Text style={styles.subLabel}>Max stops</Text>
              <View style={styles.row}>
                {([1, 2] as const).map((n) => (
                  <Pressable
                    key={n}
                    style={[styles.segment, options.maxStops === n && styles.segmentActive]}
                    onPress={() => setOptions({ ...options, maxStops: n })}
                  >
                    <Text style={options.maxStops === n ? styles.segmentTextActive : styles.segmentText}>{n}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <View style={styles.rowBetween}>
            <Text style={styles.label}>Nearby departure airports</Text>
            <Switch value={options.nearbyDepartureAirports} onValueChange={(v) => setOptions({ ...options, nearbyDepartureAirports: v })} />
          </View>

          <View style={styles.rowBetween}>
            <Text style={styles.label}>Nearby arrival airports</Text>
            <Switch value={options.nearbyArrivalAirports} onValueChange={(v) => setOptions({ ...options, nearbyArrivalAirports: v })} />
          </View>

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
  hint: { color: '#64748b', fontSize: 13, marginTop: 6, marginBottom: 16 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  label: { flex: 1, fontWeight: '600', color: '#222', fontSize: 15, paddingRight: 12 },
  subLabel: { fontWeight: '600', color: '#555', marginTop: 14, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10 },
  segment: { paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10, backgroundColor: '#f1f5f9' },
  segmentActive: { backgroundColor: colors.headerRed },
  segmentText: { fontWeight: '700', color: '#334155' },
  segmentTextActive: { fontWeight: '800', color: '#fff' },
  done: { marginTop: 22, alignItems: 'center', paddingVertical: 14 },
  doneText: { color: colors.headerRed, fontWeight: '800', fontSize: 16 },
});
