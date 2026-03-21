import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LoadsSegmentedControl from '../../src/components/loads/LoadsSegmentedControl';
import LoadsSearchScreen from './search';
import LoadsRequestsScreen from './requests';
import LoadsWalletScreen from './wallet';
import FlightClubHeader from '../../src/components/FlightClubHeader';
export default function LoadsScreen() {
  const [tab, setTab] = useState<'loads' | 'requests' | 'wallet'>('loads');

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
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <LoadsSearchScreen />
          </ScrollView>
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
  scrollContent: {
    paddingBottom: 32,
    minHeight: 400,
  },
});
