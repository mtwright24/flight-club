import React from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert } from 'react-native';
import FlightClubHeader from '../src/components/FlightClubHeader';
import { supabase, SUPABASE_URL } from '../src/lib/supabaseClient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CreateRoom() {
  const router = useRouter();
  const [name, setName] = useState('');

  const create = async () => {
    if (!name.trim()) return Alert.alert('Enter a room name');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) {
        Alert.alert('Not signed in', 'Not signed in');
        return;
      }

      const payload = { name };
      console.log('Creating room with payload:', payload);
      console.log('Using Supabase URL:', SUPABASE_URL);

      const { data, error } = await supabase.from('rooms').insert(payload).select('id').single();
      if (error) {
        console.error('Supabase insert rooms error:', error);

        // If table 'rooms' doesn't exist, attempt fallback to 'crew_rooms'
        const isMissingTable = error.code === 'PGRST205' || (error.message || '').includes("Could not find the table 'public.rooms'");
        if (isMissingTable) {
          console.warn("'rooms' table not found, attempting fallback to 'crew_rooms'");
          try {
            const { data: data2, error: error2 } = await supabase.from('crew_rooms').insert(payload).select('id').single();
            if (error2) {
              console.error('Supabase insert crew_rooms error:', error2);

              // Detect Postgres policy recursion error
              const isPolicyRecursion = error2.code === '42P17' || (error2.message || '').toLowerCase().includes('infinite recursion');
              if (isPolicyRecursion) {
                const helpMsg = 'Database policy error: infinite recursion detected in policy for relation "crew_room_members". This is a server-side Row Level Security (RLS) or trigger issue.';
                const sqlHints = [
                  "-- Quick debug (run in your Supabase SQL editor):",
                  "-- 1) Inspect policies on the relation:",
                  "SELECT * FROM pg_policies WHERE tablename = 'crew_room_members';",
                  "-- 2) Temporarily disable RLS on the relation to test insertion:",
                  "ALTER TABLE public.crew_room_members DISABLE ROW LEVEL SECURITY;",
                  "-- 3) If you prefer to disable policy temporarily on crew_rooms:",
                  "ALTER TABLE public.crew_rooms DISABLE ROW LEVEL SECURITY;",
                  "-- Remember to re-enable and fix policies after debugging.",
                ].join('\n');

                console.error(sqlHints);
                Alert.alert('DB Policy Error', `${helpMsg}\nOpen console for SQL hints.`);
                return;
              }

              const msg2 = `${error2.message || 'Unknown error'}${error2.code ? ` (code: ${error2.code})` : ''}${error2.details ? `\nDetails: ${error2.details}` : ''}${error2.hint ? `\nHint: ${error2.hint}` : ''}\nURL: ${SUPABASE_URL}`;
              Alert.alert('Error creating room', msg2);
              return;
            }
            // success with crew_rooms
            const roomId2 = data2?.id;
            if (!roomId2) {
              console.error('Create room fallback: no id returned', data2);
              Alert.alert('Error creating room', 'No room id returned from server (fallback).');
              return;
            }
            // add current user to room_members
            try {
              const { error: rmError2 } = await supabase.from('room_members').insert({ room_id: roomId2, user_id: userId });
              if (rmError2) {
                console.error('Supabase insert room_members error (fallback):', rmError2);
              }
            } catch (e) {
              console.error('Unexpected error inserting room_members (fallback)', e);
            }
            router.replace({
              pathname: '/room-home',
              params: { roomId: roomId2 },
            });
            return;
          } catch (e) {
            console.error('Fallback insert to crew_rooms failed', e);
            Alert.alert('Error creating room', `${String(e)}\nURL: ${SUPABASE_URL}`);
            return;
          }
        }

        const msg = `${error.message || 'Unknown error'}${error.code ? ` (code: ${error.code})` : ''}${error.details ? `\nDetails: ${error.details}` : ''}${error.hint ? `\nHint: ${error.hint}` : ''}\nURL: ${SUPABASE_URL}`;
        Alert.alert('Error creating room', msg);
        return;
      }

      const roomId = data?.id;
      if (!roomId) {
        console.error('Create room: no id returned', data);
        Alert.alert('Error creating room', 'No room id returned from server.');
        return;
      }

      // helper: attempt to add member to room_members, fallback to crew_room_members
      const addMember = async (rId: any, uId: any) => {
        try {
          const { error: rmError } = await supabase.from('room_members').insert({ room_id: rId, user_id: uId });
          if (rmError) {
            console.error('Supabase insert room_members error:', rmError);
            const isMissingTable = rmError.code === 'PGRST205' || (rmError.message || '').includes("Could not find the table 'public.room_members'");
            if (isMissingTable) {
              // try crew_room_members
              try {
                const { error: rmError2 } = await supabase.from('crew_room_members').insert({ room_id: rId, user_id: uId });
                if (rmError2) {
                  console.error('Supabase insert crew_room_members error:', rmError2);
                  const msg = `${rmError2.message || 'Unknown error'}${rmError2.code ? ` (code: ${rmError2.code})` : ''}${rmError2.details ? `\nDetails: ${rmError2.details}` : ''}${rmError2.hint ? `\nHint: ${rmError2.hint}` : ''}\nURL: ${SUPABASE_URL}`;
                  Alert.alert('Created room but failed to add you as a member', msg);
                }
              } catch (e) {
                console.error('Unexpected error inserting crew_room_members', e);
              }
            } else {
              const rmMsg = `${rmError.message || 'Unknown error'}${rmError.code ? ` (code: ${rmError.code})` : ''}${rmError.details ? `\nDetails: ${rmError.details}` : ''}`;
              Alert.alert('Created room but failed to add you as a member', rmMsg);
            }
          }
        } catch (e) {
          console.error('Unexpected error inserting room_members', e);
        }
      };

      await addMember(roomId, userId);
      router.replace({
        pathname: '/room-home',
        params: { roomId },
      });
    } catch (err: any) {
      console.error('Create room unexpected error', err);
      const msg = `${err?.message || String(err)}\nURL: ${SUPABASE_URL}`;
      Alert.alert('Error creating room', msg);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <FlightClubHeader title="Create Room" />
      <View style={styles.container}>
        <Text style={styles.h1}>Create a Room</Text>
        <TextInput placeholder="Room name" value={name} onChangeText={setName} style={{ borderWidth:1, borderColor:'#E5E7EB', width: '90%', padding: 12, borderRadius: 8, marginTop: 12 }} />
        <Pressable onPress={create} style={{ marginTop: 12, backgroundColor: '#2F4D83', padding: 12, borderRadius: 8 }}><Text style={{ color: '#fff', fontWeight: '800' }}>Create</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, justifyContent: 'center', alignItems: 'center' }, h1: { fontSize: 18, fontWeight: '800' } });
