
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCreditsBalance, purchaseCredits, getCreditsLedger } from '../../src/lib/supabase/loads';

const PACKAGES = [
  { id: '1', amount: 1, price: '$0.99' },
  { id: '5', amount: 5, price: '$3.49' },
  { id: '10', amount: 10, price: '$5.99' },
  { id: '30', amount: 30, price: '$15.99' },
  { id: '50', amount: 50, price: '$24.99' },
  { id: '100', amount: 100, price: '$44.99' },
];


export default function LoadsWalletScreen() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSheet, setShowSheet] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [selected, setSelected] = useState('10');
  const [message, setMessage] = useState('');
  const [ledger, setLedger] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCreditsBalance().then(res => {
      setBalance(res.data?.balance ?? 0);
      setLoading(false);
    });
    setLedgerLoading(true);
    getCreditsLedger().then(res => {
      setLedger(res.data || []);
      setLedgerLoading(false);
    });
  }, [purchasing]);

  const handlePurchase = async () => {
    setPurchasing(true);
    setMessage('');
    const res = await purchaseCredits(selected);
    if (res.error) {
      const err = res.error;
      setMessage(typeof err === 'string' ? err : err.message || 'Purchase failed');
    }
    else setMessage('Credits purchased!');
    setPurchasing(false);
    setShowSheet(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#DC3545" />
        ) : (
          <Text style={styles.balanceValue}>{balance ?? 0} credits</Text>
        )}
        <Pressable style={styles.ctaButton} onPress={() => setShowSheet(true)}>
          <Text style={styles.ctaButtonText}>Buy Credits</Text>
        </Pressable>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>

      {/* Purchase Sheet */}
      <Modal visible={showSheet} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Buy Credits</Text>
            {PACKAGES.map(pkg => (
              <Pressable
                key={pkg.id}
                style={[styles.packageRow, selected === pkg.id && styles.selectedRow]}
                onPress={() => setSelected(pkg.id)}
              >
                <Text style={styles.amount}>{pkg.amount}</Text>
                <Text style={styles.price}>{pkg.price}</Text>
                {selected === pkg.id && <Ionicons name="checkmark-circle" size={20} color="#DC3545" style={{ marginLeft: 8 }} />}
              </Pressable>
            ))}
            <Pressable style={styles.ctaButton} onPress={handlePurchase} disabled={purchasing}>
              <Text style={styles.ctaButtonText}>{purchasing ? 'Purchasing...' : 'Purchase'}</Text>
            </Pressable>
            <Pressable style={styles.closeBtn} onPress={() => setShowSheet(false)}>
              <Text style={styles.closeText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Credits history/ledger */}
      <View style={styles.ledgerCard}>
        <Text style={styles.ledgerTitle}>Credits History</Text>
        {ledgerLoading ? (
          <ActivityIndicator size="small" color="#DC3545" style={{ marginTop: 12 }} />
        ) : ledger.length === 0 ? (
          <View style={styles.emptyLedger}>
            <Ionicons name="receipt-outline" size={32} color="#ddd" />
            <Text style={styles.emptyLedgerText}>No credits history yet.</Text>
          </View>
        ) : (
          <FlatList
            data={ledger}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={styles.ledgerRow}>
                <Text style={styles.ledgerAmount}>{item.amount > 0 ? '+' : ''}{item.amount}</Text>
                <Text style={styles.ledgerReason}>{item.reason}</Text>
                <Text style={styles.ledgerDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
              </View>
            )}
            contentContainerStyle={{ paddingBottom: 8 }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  balanceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1,
    borderColor: '#eee',
  },
  balanceLabel: { color: '#888', fontWeight: '600', fontSize: 15 },
  balanceValue: { color: '#222', fontWeight: '700', fontSize: 28, marginTop: 6, marginBottom: 12 },
  ctaButton: {
    backgroundColor: '#DC3545',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    minWidth: 140,
  },
  ctaButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  message: { color: '#DC3545', fontWeight: '600', marginTop: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 },
  sheetTitle: { fontWeight: '700', fontSize: 18, marginBottom: 12, textAlign: 'center' },
  packageRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 8, backgroundColor: '#f5f5f5' },
  selectedRow: { backgroundColor: '#fff5f5', borderColor: '#DC3545', borderWidth: 1 },
  amount: { fontWeight: '700', fontSize: 16, flex: 1 },
  price: { color: '#222', fontWeight: '600', fontSize: 16 },
  closeBtn: { alignItems: 'center', marginTop: 18 },
  closeText: { color: '#DC3545', fontWeight: '700', fontSize: 16 },
  ledgerCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#eee' },
  ledgerTitle: { fontWeight: '700', fontSize: 16, marginBottom: 10 },
  emptyLedger: { alignItems: 'center', marginTop: 12 },
  emptyLedgerText: { color: '#888', fontSize: 15, marginTop: 8 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  ledgerAmount: { fontWeight: '700', fontSize: 15, color: '#DC3545', width: 48 },
  ledgerReason: { color: '#222', fontSize: 14, flex: 1 },
  ledgerDate: { color: '#888', fontSize: 13, marginLeft: 8 },
});
