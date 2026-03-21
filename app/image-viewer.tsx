import React from 'react';
import { View, Image, StyleSheet, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../src/components/FlightClubHeader';

export default function ImageViewer() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const uri = (params as any).uri as string;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <FlightClubHeader title="" />
      <View style={styles.wrap}>
        <Pressable style={styles.close} onPress={() => router.back()} />
        {uri ? <Image source={{ uri }} style={styles.img} resizeMode="contain" /> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1, justifyContent: 'center', alignItems: 'center' }, img: { width: '100%', height: '100%' }, close: { position: 'absolute', top: 16, right: 16, width: 44, height: 44 } });
