import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../styles/theme';

const PACKAGES = [
  { amount: 1, price: '$0.99' },
  { amount: 5, price: '$3.49', badge: 'save' },
  { amount: 10, price: '$5.99', selected: true },
  { amount: 30, price: '$15.99' },
  { amount: 50, price: '$24.99' },
  { amount: 100, price: '$44.99' },
];

export default function CreditsPurchaseSheet({ visible, onClose, onPurchase }: any) {
  const [selected, setSelected] = React.useState(10);
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>How many credits would you like?</Text>
          {PACKAGES.map(pkg => (
            <Pressable key={pkg.amount} style={[styles.row, selected===pkg.amount && styles.selectedRow]} onPress={()=>setSelected(pkg.amount)}>
              <Text style={styles.amount}>{pkg.amount}</Text>
              <Text style={styles.price}>{pkg.price}</Text>
              {pkg.badge && <Text style={styles.badge}>{pkg.badge}</Text>}
              {pkg.selected && <Text style={styles.default}>default</Text>}
            </Pressable>
          ))}
          <Pressable style={styles.ctaButton} onPress={()=>onPurchase(selected)}>
            <Text style={styles.ctaButtonText}>Purchase for {PACKAGES.find(p=>p.amount===selected)?.price}</Text>
          </Pressable>
          <Pressable style={styles.closeBtn} onPress={onClose}><Text style={styles.closeText}>Cancel</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 },
  title: { fontWeight: '700', fontSize: 18, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  selectedRow: { backgroundColor: '#fff5f5' },
  amount: { fontWeight: '700', fontSize: 16, width: 60 },
  price: { fontSize: 15, color: '#333', flex: 1 },
  badge: { backgroundColor: colors.headerRed, color: '#fff', borderRadius: 8, paddingHorizontal: 6, marginLeft: 8 },
  default: { color: '#888', fontSize: 12, marginLeft: 8 },
  ctaButton: { backgroundColor: colors.headerRed, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  ctaButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  closeBtn: { alignItems: 'center', marginTop: 18 },
  closeText: { color: colors.headerRed, fontWeight: '700', fontSize: 16 },
});
