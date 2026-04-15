import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import LoadsSegmentedControl from '../../src/components/loads/LoadsSegmentedControl';
import LoadsSearchScreen from './search';
import LoadsRequestsScreen from './requests';
import LoadsWalletScreen from './wallet';
import FlightClubHeader from '../../src/components/FlightClubHeader';

export default function LoadsScreen() {
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string | string[] }>();
  const [tab, setTab] = useState<'loads' | 'requests' | 'wallet'>('loads');

  useEffect(() => {
    const t = Array.isArray(tabParam) ? tabParam[0] : tabParam;
    if (t === 'wallet') setTab('wallet');
    else if (t === 'requests') setTab('requests');
    else if (t === 'loads') setTab('loads');
  }, [tabParam]);

  return (
    <View style={styles.safe}>
      <View style={styles.stickyHeader}>
        <FlightClubHeader title="Staff Loads" />
        <LoadsSegmentedControl
          tabs={['Loads', 'Requests', 'Wallet']}
          selectedIndex={tab === 'loads' ? 0 : tab === 'requests' ? 1 : 2}
          onTabPress={i => setTab(i === 0 ? 'loads' : i === 1 ? 'requests' : 'wallet')}
        />
      </View>
      <View style={styles.flex1}>
        {tab === 'loads' ? (
          <LoadsSearchScreen />
        ) : tab === 'requests' ? (
          <LoadsRequestsScreen />
        ) : (
          <LoadsWalletScreen />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  stickyHeader: {
    backgroundColor: '#fff',
    zIndex: 10,
    // Add shadow for iOS
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    // Add elevation for Android
    elevation: 2,
  },
  flex1: { flex: 1 },
});
