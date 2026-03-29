import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleTheme as T } from '../../src/features/crew-schedule/scheduleTheme';
import CrewScheduleHeader from '../../src/features/crew-schedule/components/CrewScheduleHeader';

type Source = 'screenshot' | 'camera' | 'pdf' | null;

/**
 * Import entry — choose source; processing + review are stubbed for OCR / pipeline integration.
 */
export default function ImportScheduleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Source>(null);

  const goReview = () => {
    router.push({
      pathname: '/crew-schedule/import-review',
      params: { source: selected ?? 'screenshot' },
    });
  };

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title="Import schedule" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.lead}>
          Choose how you want to bring in your roster. Parsing and OCR will connect here in a future release.
        </Text>

        <Text style={styles.h2}>Source</Text>
        <View style={styles.options}>
          {(
            [
              { id: 'screenshot' as const, label: 'Screenshot / photo library', icon: 'images-outline' },
              { id: 'camera' as const, label: 'Camera scan', icon: 'camera-outline' },
              { id: 'pdf' as const, label: 'PDF upload', icon: 'document-text-outline' },
            ] as const
          ).map((opt) => {
            const active = selected === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSelected(opt.id)}
                style={[styles.opt, active && styles.optActive]}
              >
                <Text style={styles.optText}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.note}>ICS calendar import will be added later.</Text>

        <Pressable
          style={[styles.continue, !selected && styles.continueDisabled]}
          onPress={goReview}
          disabled={!selected}
        >
          <Text style={styles.continueText}>Continue to review</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16 },
  lead: { fontSize: 15, color: T.text, lineHeight: 22, marginBottom: 20 },
  h2: { fontSize: 13, fontWeight: '800', color: T.textSecondary, marginBottom: 10, textTransform: 'uppercase' },
  options: { gap: 10 },
  opt: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
  },
  optActive: { borderColor: T.accent, backgroundColor: '#FEF2F2' },
  optText: { fontSize: 15, fontWeight: '700', color: T.text },
  note: { fontSize: 13, color: T.textSecondary, marginTop: 16, fontStyle: 'italic' },
  continue: {
    marginTop: 28,
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  continueDisabled: { opacity: 0.45 },
  continueText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
