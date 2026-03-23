import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { createHousingNeedPost } from '../../src/lib/housing';
import { colors, radius, spacing } from '../../src/styles/theme';

export default function PostHousingNeedScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [baseAirport, setBaseAirport] = useState('JFK');
  const [area, setArea] = useState('');
  const [needType, setNeedType] = useState('hot_bed');
  const [budget, setBudget] = useState('');
  const [startDate, setStartDate] = useState('');
  const [needTonight, setNeedTonight] = useState(false);
  const [duration, setDuration] = useState('month-to-month');
  const [crewType, setCrewType] = useState('Flight attendant');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!userId) return;
    setSubmitting(true);
    await createHousingNeedPost({
      user_id: userId,
      base_airport: baseAirport,
      area: area || null,
      need_type: needType,
      budget: budget ? Number(budget) : null,
      start_date: startDate || null,
      need_tonight: needTonight,
      duration,
      crew_type: crewType,
      preference_rules: null,
      notes: notes || null,
    } as any);
    setSubmitting(false);
    setSubmitted(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom', 'left', 'right']}>
      <FlightClubHeader title="Post Housing Need" showLogo={false} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
        <Text style={styles.helper}>
          Tell Flight Club what you''re looking for. Pad leaders and hosts can reach out when they have a match.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Trip basics</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Base / Airport</Text>
            <TextInput
              value={baseAirport}
              onChangeText={setBaseAirport}
              style={styles.input}
              placeholder="JFK, LGA, IAH, FLL..."
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Preferred Area / Neighborhood</Text>
            <TextInput
              value={area}
              onChangeText={setArea}
              style={styles.input}
              placeholder="Jamaica, Queens / Houston near IAH..."
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What you need</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Need Type</Text>
            <View style={styles.chipRow}>
              {[
                { key: 'hot_bed', label: 'Hot Bed' },
                { key: 'cold_bed', label: 'Cold Bed' },
                { key: 'private_room', label: 'Private Room' },
                { key: 'apartment', label: 'Apartment' },
              ].map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[styles.chip, needType === opt.key && styles.chipActive]}
                  onPress={() => setNeedType(opt.key as any)}
                >
                  <Text
                    style={[styles.chipText, needType === opt.key && styles.chipTextActive]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Budget (USD)</Text>
            <TextInput
              value={budget}
              onChangeText={setBudget}
              keyboardType="numeric"
              style={styles.input}
              placeholder="e.g. 450"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Arrival / Start Date</Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              style={styles.input}
              placeholder="YYYY-MM-DD (optional)"
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Need Tonight</Text>
            <Switch
              value={needTonight}
              onValueChange={setNeedTonight}
              trackColor={{ false: '#CBD5E1', true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Crew & stay details</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Duration</Text>
            <TextInput
              value={duration}
              onChangeText={setDuration}
              style={styles.input}
              placeholder="few nights, month-to-month, long-term..."
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Crew Type</Text>
            <TextInput
              value={crewType}
              onChangeText={setCrewType}
              style={styles.input}
              placeholder="Flight attendant, pilot, mixed crew..."
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Notes for hosts</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              style={[styles.input, { height: 110, textAlignVertical: 'top' }]}
              placeholder="Share what matters most: commute, quiet hours, coed preferences, shuttle, etc."
              multiline
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          style={[styles.submitBtn, submitted && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting || !userId}
        >
          <Text style={styles.submitText}>
            {submitted ? 'Posted' : submitting ? 'Posting…' : 'Post Need'}
          </Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  helper: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  input: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottomBar: {
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    backgroundColor: colors.cardBg,
  },
  submitBtn: {
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingVertical: 12,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
