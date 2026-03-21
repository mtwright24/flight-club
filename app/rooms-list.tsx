import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../src/components/FlightClubHeader';

export default function RoomsList() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <FlightClubHeader title="Rooms" />
      <View style={styles.container}>
        <Text style={styles.h1}>Rooms List (placeholder)</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, justifyContent: 'center', alignItems: 'center' }, h1: { fontSize: 18, fontWeight: '800' } });
