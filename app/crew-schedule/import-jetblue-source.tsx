import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleTheme as T } from '../../src/features/crew-schedule/scheduleTheme';
import CrewScheduleHeader from '../../src/features/crew-schedule/components/CrewScheduleHeader';

/**
 * JetBlue FA FLICA guided import — confirms template scope before upload (v1).
 */
export default function ImportJetBlueSourceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title="JetBlue FLICA import" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.h1}>Flight Attendant · FLICA</Text>
        <Text style={styles.lead}>
          Monthly detailed list from jetblue.flica.net. Next, pick the month and upload screenshots (1–4), a PDF export, or
          scanned pages. We run template detection, OCR / text extraction, and confidence scoring — then you review before
          anything is saved to your calendar.
        </Text>
        <View style={styles.box}>
          <Text style={styles.boxLabel}>Locked for this flow</Text>
          <Text style={styles.boxLine}>Airline: JetBlue (B6)</Text>
          <Text style={styles.boxLine}>Role: Flight Attendant / IFC</Text>
          <Text style={styles.boxLine}>System: FLICA</Text>
          <Text style={styles.boxLine}>View: Detailed month list</Text>
          <Text style={styles.boxLine}>Source: Screenshot, PDF, or document scan</Text>
        </View>

        <Pressable style={styles.optionCard} onPress={() => router.push('/crew-schedule/import-flica-direct')}>
          <View style={styles.badgeRec}>
            <Text style={styles.badgeRecText}>RECOMMENDED</Text>
          </View>
          <Text style={styles.optionTitle}>FLICA Direct Sync</Text>
          <Text style={styles.optionSub}>
            Automatically import directly from FLICA — faster and more accurate than screenshots
          </Text>
        </Pressable>

        <Pressable style={styles.btn} onPress={() => router.push('/crew-schedule/import-jetblue-upload')}>
          <Text style={styles.btnText}>Continue to upload</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => router.back()}>
          <Text style={styles.ghostText}>Back</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16 },
  h1: { fontSize: 20, fontWeight: '800', color: T.text, marginBottom: 10 },
  lead: { fontSize: 14, color: T.textSecondary, lineHeight: 21, marginBottom: 16 },
  optionCard: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: T.accent,
    backgroundColor: T.surface,
    padding: 14,
    marginBottom: 16,
  },
  badgeRec: {
    alignSelf: 'flex-start',
    backgroundColor: T.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  badgeRecText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  optionTitle: { fontSize: 17, fontWeight: '800', color: T.text, marginBottom: 6 },
  optionSub: { fontSize: 14, color: T.textSecondary, lineHeight: 21 },
  box: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
    padding: 14,
    marginBottom: 20,
    gap: 6,
  },
  boxLabel: { fontSize: 11, fontWeight: '800', color: T.textSecondary, marginBottom: 4 },
  boxLine: { fontSize: 14, color: T.text },
  btn: {
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ghost: { paddingVertical: 14, alignItems: 'center' },
  ghostText: { color: T.textSecondary, fontWeight: '700', fontSize: 15 },
});
