
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getCreditsBalance, purchaseCredits, getCreditsLedger } from '../../src/lib/supabase/loads';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';
import { colors } from '../../src/styles/theme';

function ledgerDescription(reason: string | null | undefined, requestId: string | null | undefined): string {
  const r = reason || '';
  const tail = requestId ? ` · ${String(requestId).slice(0, 8)}…` : '';
  switch (r) {
    case 'staff_loads_post':
      return `Posted load request(s)${tail}`;
    case 'staff_loads_priority_upgrade':
      return `Priority upgrade (+1 credit)${tail}`;
    case 'staff_loads_delete_refund':
      return `Refund (request removed)${tail}`;
    case 'Purchase':
    case 'iap':
      return 'Credits purchased';
    default:
      return r ? `${r}${tail}` : 'Entry';
  }
}

const PACKAGES = [
  { id: '1', amount: 1, price: '$0.99' },
  { id: '5', amount: 5, price: '$3.49' },
  { id: '10', amount: 10, price: '$5.99' },
  { id: '30', amount: 30, price: '$15.99' },
  { id: '50', amount: 50, price: '$24.99' },
  { id: '100', amount: 100, price: '$44.99' },
];

export default function LoadsWalletScreen() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [priorityPool, setPriorityPool] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSheet, setShowSheet] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [selected, setSelected] = useState('10');
  const [message, setMessage] = useState('');
  const [ledger, setLedger] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);

  const reloadWallet = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCreditsBalance();
      const row = res.data as { balance?: number; priority_balance?: number } | null;
      setBalance(row?.balance ?? 0);
      setPriorityPool(row?.priority_balance ?? 0);
    } finally {
      setLoading(false);
    }
    setLedgerLoading(true);
    try {
      const res = await getCreditsLedger();
      setLedger(res.data || []);
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadWallet();
  }, [purchasing, reloadWallet]);

  const { refreshing: walletPullRefreshing, onRefresh: onWalletPullRefresh } = usePullToRefresh(reloadWallet);

  const handlePurchase = async () => {
    setPurchasing(true);
    setMessage('');
    const res = await purchaseCredits(selected);
    if (res.error) {
      const err = res.error;
      setMessage(typeof err === 'string' ? err : err.message || 'Purchase failed');
    } else setMessage('Credits purchased!');
    setPurchasing(false);
    setShowSheet(false);
  };

  const header = (
    <>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.headerRed} />
        ) : (
          <>
            <Text style={styles.balanceValue}>{balance ?? 0} standard credits</Text>
            {(priorityPool ?? 0) > 0 ? (
              <Text style={styles.priorityPool}>Priority pool: {priorityPool} (reserved for future use)</Text>
            ) : null}
            <Text style={styles.rateHint}>Posting: 1 credit standard · 2 credits priority per flight</Text>
          </>
        )}
        <Pressable style={styles.ctaButton} onPress={() => setShowSheet(true)}>
          <Text style={styles.ctaButtonText}>Buy Credits</Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={() => router.push('/loads?tab=loads' as any)} style={styles.linkLoads}>
          <Text style={styles.linkLoadsTx}>Back to search</Text>
        </Pressable>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>

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
                {selected === pkg.id && <Ionicons name="checkmark-circle" size={20} color={colors.headerRed} style={{ marginLeft: 8 }} />}
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

      <View style={styles.ledgerCard}>
        <Text style={styles.ledgerTitle}>Credits History</Text>
        {ledgerLoading ? (
          <ActivityIndicator size="small" color={colors.headerRed} style={{ marginTop: 12 }} />
        ) : ledger.length === 0 ? (
          <View style={styles.emptyLedger}>
            <Ionicons name="receipt-outline" size={32} color="#ddd" />
            <Text style={styles.emptyLedgerText}>No credits history yet.</Text>
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <FlatList
      style={styles.container}
      data={ledger}
      keyExtractor={item => item.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <View style={styles.ledgerRow}>
          <Text style={styles.ledgerAmount}>
            {item.amount > 0 ? '+' : ''}
            {item.amount}
          </Text>
          <View style={styles.ledgerMid}>
            <Text style={styles.ledgerReason}>{ledgerDescription(item.reason, item.request_id)}</Text>
            <Text style={styles.ledgerSource}>{item.source || '—'}</Text>
          </View>
          <Text style={styles.ledgerDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
        </View>
      )}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={walletPullRefreshing}
          onRefresh={onWalletPullRefresh}
          colors={REFRESH_CONTROL_COLORS}
          tintColor={REFRESH_TINT}
        />
      }
    />
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
  balanceValue: { color: '#222', fontWeight: '700', fontSize: 28, marginTop: 6, marginBottom: 6 },
  priorityPool: { color: '#64748b', fontWeight: '600', fontSize: 13, textAlign: 'center', marginBottom: 6 },
  rateHint: { color: '#94a3b8', fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  linkLoads: { marginTop: 8, paddingVertical: 6 },
  linkLoadsTx: { color: colors.headerRed, fontWeight: '800', fontSize: 14, textAlign: 'center' },
  ctaButton: {
    backgroundColor: colors.headerRed,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    minWidth: 140,
  },
  ctaButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  message: { color: colors.headerRed, fontWeight: '600', marginTop: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 },
  sheetTitle: { fontWeight: '700', fontSize: 18, marginBottom: 12, textAlign: 'center' },
  packageRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 8, backgroundColor: '#f5f5f5' },
  selectedRow: { backgroundColor: 'rgba(181, 22, 30, 0.06)', borderColor: colors.headerRed, borderWidth: 1 },
  amount: { fontWeight: '700', fontSize: 16, flex: 1 },
  price: { color: '#222', fontWeight: '600', fontSize: 16 },
  closeBtn: { alignItems: 'center', marginTop: 18 },
  closeText: { color: colors.headerRed, fontWeight: '800', fontSize: 16 },
  ledgerCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
  ledgerTitle: { fontWeight: '700', fontSize: 16, marginBottom: 10 },
  emptyLedger: { alignItems: 'center', marginTop: 12, paddingBottom: 24 },
  emptyLedgerText: { color: '#888', fontSize: 15, marginTop: 8 },
  ledgerRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  ledgerAmount: { fontWeight: '800', fontSize: 15, color: colors.headerRed, width: 52, paddingTop: 2 },
  ledgerMid: { flex: 1, paddingRight: 8 },
  ledgerReason: { color: '#222', fontSize: 14, fontWeight: '600' },
  ledgerSource: { color: '#94a3b8', fontSize: 11, marginTop: 2, fontWeight: '600' },
  ledgerDate: { color: '#888', fontSize: 12, paddingTop: 2 },
});
