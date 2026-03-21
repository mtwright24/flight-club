import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Switch } from 'react-native';

export default function OptionsSheet({ visible, onClose, options, setOptions }: any) {
  // Example options state: { cabin: 'Any', travelerType: 'Non-rev', timeWindow: 'Any', maxConnections: 0, directOnly: false, saveDefault: false }
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Options</Text>
          {/* Cabin */}
          <Text style={styles.label}>Cabin</Text>
          <View style={styles.row}>
            {['Any','Economy','Premium','Business','First'].map(c => (
              <Pressable key={c} style={[styles.segment, options.cabin===c && styles.segmentActive]} onPress={()=>setOptions({ ...options, cabin: c })}>
                <Text style={options.cabin===c ? styles.segmentTextActive : styles.segmentText}>{c}</Text>
              </Pressable>
            ))}
          </View>
          {/* Traveler Type */}
          <Text style={styles.label}>Traveler Type</Text>
          <View style={styles.row}>
            {['Non-rev','Staff','Jumpseat'].map(t => (
              <Pressable key={t} style={[styles.segment, options.travelerType===t && styles.segmentActive]} onPress={()=>setOptions({ ...options, travelerType: t })}>
                <Text style={options.travelerType===t ? styles.segmentTextActive : styles.segmentText}>{t}</Text>
              </Pressable>
            ))}
          </View>
          {/* Time Window */}
          <Text style={styles.label}>Time Window</Text>
          <View style={styles.row}>
            {['Any','Morning','Afternoon','Evening'].map(t => (
              <Pressable key={t} style={[styles.segment, options.timeWindow===t && styles.segmentActive]} onPress={()=>setOptions({ ...options, timeWindow: t })}>
                <Text style={options.timeWindow===t ? styles.segmentTextActive : styles.segmentText}>{t}</Text>
              </Pressable>
            ))}
          </View>
          {/* Max Connections */}
          <Text style={styles.label}>Max Connections</Text>
          <View style={styles.row}>
            {[0,1,2].map(n => (
              <Pressable key={n} style={[styles.segment, options.maxConnections===n && styles.segmentActive]} onPress={()=>setOptions({ ...options, maxConnections: n })}>
                <Text style={options.maxConnections===n ? styles.segmentTextActive : styles.segmentText}>{n}</Text>
              </Pressable>
            ))}
          </View>
          {/* Direct Only */}
          <View style={styles.switchRow}>
            <Text style={styles.label}>Show only direct flights</Text>
            <Switch value={options.directOnly} onValueChange={v=>setOptions({ ...options, directOnly: v })} />
          </View>
          {/* Save as default */}
          <View style={styles.switchRow}>
            <Text style={styles.label}>Save as default</Text>
            <Switch value={options.saveDefault} onValueChange={v=>setOptions({ ...options, saveDefault: v })} />
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose}><Text style={styles.closeText}>Done</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 },
  title: { fontWeight: '700', fontSize: 18, marginBottom: 12 },
  label: { fontWeight: '600', marginTop: 16, marginBottom: 6, color: '#222' },
  row: { flexDirection: 'row', marginBottom: 8 },
  segment: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#f5f5f5', marginHorizontal: 2, alignItems: 'center' },
  segmentActive: { backgroundColor: '#DC3545' },
  segmentText: { color: '#333', fontWeight: '600' },
  segmentTextActive: { color: '#fff', fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  closeBtn: { alignItems: 'center', marginTop: 18 },
  closeText: { color: '#DC3545', fontWeight: '700', fontSize: 16 },
});
