import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../../../src/components/FlightClubHeader';
import { supabase } from '../../../src/lib/supabaseClient';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function RoomInfo() {
  const params = useLocalSearchParams();
  const { id: roomId } = params as any;
  const [members, setMembers] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('room_members').select('user_id, role').eq('room_id', roomId);
      setMembers(data || []);
    };
    load();
  }, [roomId]);

  const leave = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id || null;
    await supabase.from('room_members').delete().match({ room_id: roomId, user_id: userId });
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <FlightClubHeader title="Room Info" />
      <View style={styles.container}>
        <Text style={styles.h1}>Members</Text>
        <FlatList data={members} keyExtractor={(i) => i.user_id} renderItem={({ item }) => <View style={styles.row}><Text>{item.user_id}</Text><Text style={styles.role}>{item.role}</Text></View>} />
        <Pressable onPress={leave} style={styles.leave}><Text style={{ color: '#fff', fontWeight: '800' }}>Leave Room</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 16 }, h1: { fontSize: 18, fontWeight: '800', marginBottom: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F1F5F9' }, role: { color: '#64748b' }, leave: { marginTop: 20, backgroundColor: '#B5161E', padding: 12, borderRadius: 8, alignItems: 'center' } });
