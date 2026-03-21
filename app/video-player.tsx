import React from 'react';
import { View, StyleSheet, Text, Pressable, Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../src/components/FlightClubHeader';

export default function VideoPlayer() {
  const params = useLocalSearchParams();
  const uri = (params as any).uri as string;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <FlightClubHeader title="" />
      <View style={styles.wrap}>
        {uri ? (
          <Pressable onPress={() => Linking.openURL(uri)} style={styles.playBtn}><Text style={{ color: '#fff', fontWeight: '800' }}>Open Video</Text></Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1, justifyContent: 'center', alignItems: 'center' }, video: { width: '100%', height: '100%' }, playBtn: { padding: 12, backgroundColor: '#111', borderRadius: 8 } });
