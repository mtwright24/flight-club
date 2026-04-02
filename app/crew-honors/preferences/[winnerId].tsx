import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../../../src/components/FlightClubHeader';
import { COLORS, RADIUS } from '../../../src/styles/theme';
import { updateCrewHonorWinnerPreference } from '../../../lib/crewHonors';

export default function CrewHonorPreferenceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ winnerId?: string | string[] }>();
  const winnerId = typeof params.winnerId === 'string' ? params.winnerId : params.winnerId?.[0] || '';
  const [useProfilePhoto, setUseProfilePhoto] = useState(true);
  const [altPhotoUrl, setAltPhotoUrl] = useState('');
  const [useInitialsAvatar, setUseInitialsAvatar] = useState(false);
  const [nameDisplay, setNameDisplay] = useState<'full_name' | 'first_name_last_initial'>('full_name');
  const [declined, setDeclined] = useState(false);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!winnerId) return;
    setSaving(true);
    const res = await updateCrewHonorWinnerPreference({
      winnerId,
      useProfilePhoto,
      altPhotoUrl: altPhotoUrl.trim() || null,
      useInitialsAvatar,
      nameDisplay,
      declinedPublicDisplay: declined,
    });
    setSaving(false);
    if (!res.ok) {
      Alert.alert('Could not save', res.error);
      return;
    }
    Alert.alert('Saved', 'Your Crew Honors display preferences were updated.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <FlightClubHeader title="Honor Display Settings" showLogo={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Winner consent & display</Text>

          <Row
            title="Use profile photo"
            body="Use your current profile avatar on your public honor card."
            value={useProfilePhoto}
            onChange={setUseProfilePhoto}
          />
          <Text style={styles.label}>Alternate honor photo URL (optional)</Text>
          <TextInput
            value={altPhotoUrl}
            onChangeText={setAltPhotoUrl}
            placeholder="https://..."
            placeholderTextColor={COLORS.text2}
            style={styles.input}
          />
          <Row
            title="Use initials avatar fallback"
            body="If photo is hidden/unavailable, allow initials avatar."
            value={useInitialsAvatar}
            onChange={setUseInitialsAvatar}
          />

          <Text style={styles.label}>Name visibility</Text>
          <View style={styles.pills}>
            <Pressable
              style={[styles.pill, nameDisplay === 'full_name' && styles.pillActive]}
              onPress={() => setNameDisplay('full_name')}
            >
              <Text style={[styles.pillText, nameDisplay === 'full_name' && styles.pillTextActive]}>Show full name</Text>
            </Pressable>
            <Pressable
              style={[styles.pill, nameDisplay === 'first_name_last_initial' && styles.pillActive]}
              onPress={() => setNameDisplay('first_name_last_initial')}
            >
              <Text style={[styles.pillText, nameDisplay === 'first_name_last_initial' && styles.pillTextActive]}>
                First name + last initial
              </Text>
            </Pressable>
          </View>

          <Row
            title="Decline public display"
            body="Hide this winner card publicly. Editorial records remain internally."
            value={declined}
            onChange={setDeclined}
          />

          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={() => void onSave()} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Preferences'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ title, body, value, onChange }: { title: string; body: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowBody}>{body}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 12, paddingBottom: 30 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.lg, padding: 12 },
  title: { color: COLORS.navy, fontWeight: '800', fontSize: 17, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#EEF2F6', paddingVertical: 10 },
  rowTitle: { color: COLORS.navy, fontWeight: '700', fontSize: 13 },
  rowBody: { color: COLORS.text2, fontWeight: '600', fontSize: 11, lineHeight: 16, marginTop: 3 },
  label: { color: COLORS.red, fontWeight: '800', fontSize: 12, marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: COLORS.navy, fontWeight: '600' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  pillActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  pillText: { color: COLORS.navy, fontWeight: '700', fontSize: 12 },
  pillTextActive: { color: '#fff' },
  saveBtn: { marginTop: 14, borderRadius: 999, backgroundColor: COLORS.red, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10 },
  saveBtnText: { color: '#fff', fontWeight: '800' },
});
