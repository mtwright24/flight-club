import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../styles/theme';

/** Search-result flight row (no Staff Loads request): ⋮ opens sheet; primary row navigates to flight detail. */
export function StaffLoadsFlightSearchActionsSheet({
  visible,
  onClose,
  onViewFlightDetails,
}: {
  visible: boolean;
  onClose: () => void;
  onViewFlightDetails: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Flight</Text>
          <Pressable
            style={styles.row}
            onPress={() => {
              onClose();
              onViewFlightDetails();
            }}
          >
            <Text style={styles.tx}>View flight details</Text>
          </Pressable>
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeTx}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 28 },
  title: { fontWeight: '900', fontSize: 17, marginBottom: 8, color: '#0f172a' },
  row: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  tx: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  close: { marginTop: 12, alignItems: 'center', paddingVertical: 12 },
  closeTx: { color: colors.headerRed, fontWeight: '800', fontSize: 16 },
});
