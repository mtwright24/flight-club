import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import { COLORS, RADIUS } from '../../src/styles/theme';
import { getActiveCycleForNominations, getCrewHonorCategories, submitCrewHonorNomination } from '../../lib/crewHonors';
import { searchPeople } from '../../lib/search';

export default function CrewHonorNominateScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<any | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selectedNominee, setSelectedNominee] = useState<{ id: string; name: string } | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [story, setStory] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      const [activeCycle, cats] = await Promise.all([getActiveCycleForNominations(), getCrewHonorCategories()]);
      if (!mounted) return;
      setCycle(activeCycle);
      setCategories(cats);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) || null,
    [categories, selectedCategoryId]
  );

  const onSearch = async (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    const found = await searchPeople(text, 20);
    const people = found
      .filter((f) => f.type === 'person' && f.id)
      .map((f) => ({ id: f.id, name: f.title || 'Crew Member' }));
    setResults(people);
  };

  const onSubmit = async () => {
    if (!cycle?.id) {
      Alert.alert('Nominations closed', 'Nominations are not open right now.');
      return;
    }
    if (!selectedNominee?.id || !selectedCategoryId || !reason.trim()) {
      Alert.alert('Missing info', 'Choose a nominee, category, and reason.');
      return;
    }
    setSubmitting(true);
    const res = await submitCrewHonorNomination({
      cycleId: cycle.id,
      categoryId: selectedCategoryId,
      nomineeUserId: selectedNominee.id,
      reason,
      storyContext: story,
      isAnonymousToPublic: anonymous,
    });
    setSubmitting(false);
    if (!res.ok) {
      Alert.alert('Could not submit nomination', res.error);
      return;
    }
    Alert.alert('Submitted', 'Your nomination was submitted.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <FlightClubHeader title="Nominate Someone" showLogo={false} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Text style={styles.info}>Loading nomination form…</Text>
        ) : !cycle ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nominations are currently closed</Text>
            <Text style={styles.emptyBody}>Check Crew Honors for live voting or published winners.</Text>
            <Pressable style={styles.cta} onPress={() => router.replace('/crew-honors')}>
              <Text style={styles.ctaText}>Open Crew Honors</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>{cycle.title}</Text>
              <Text style={styles.bannerBody}>
                Nominations close {new Date(cycle.nomination_close_at).toLocaleString()}.
              </Text>
            </View>

            <Text style={styles.label}>Nominee (real Flight Club user)</Text>
            {selectedNominee ? (
              <Pressable style={styles.selectedRow} onPress={() => setSelectedNominee(null)}>
                <Text style={styles.selectedText}>{selectedNominee.name}</Text>
                <Ionicons name="close-circle-outline" size={18} color={COLORS.text2} />
              </Pressable>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  value={query}
                  onChangeText={(t) => void onSearch(t)}
                  placeholder="Search crew"
                  placeholderTextColor={COLORS.text2}
                />
                <View style={styles.searchResults}>
                  {results.slice(0, 8).map((r) => (
                    <Pressable
                      key={r.id}
                      style={styles.searchRow}
                      onPress={() => {
                        setSelectedNominee({ id: r.id, name: r.name });
                        setResults([]);
                        setQuery(r.name);
                      }}
                    >
                      <Text style={styles.searchText}>{r.name}</Text>
                    </Pressable>
                  ))}
                  {query.trim() && results.length === 0 && <Text style={styles.info}>No users found.</Text>}
                </View>
              </>
            )}

            <Text style={styles.label}>Award category</Text>
            <View style={styles.catWrap}>
              {categories.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.catPill, selectedCategoryId === c.id && styles.catPillActive]}
                  onPress={() => setSelectedCategoryId(c.id)}
                >
                  <Text style={[styles.catText, selectedCategoryId === c.id && { color: '#fff' }]}>{c.title}</Text>
                </Pressable>
              ))}
            </View>
            {selectedCategory && <Text style={styles.info}>{selectedCategory.short_description}</Text>}

            <Text style={styles.label}>Why they deserve it</Text>
            <TextInput
              style={[styles.input, styles.multi]}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={500}
              placeholder="Tell us what made this crew member stand out."
              placeholderTextColor={COLORS.text2}
            />

            <Text style={styles.label}>Optional trip/story/context</Text>
            <TextInput
              style={[styles.input, styles.multi]}
              value={story}
              onChangeText={setStory}
              multiline
              maxLength={800}
              placeholder="Optional context"
              placeholderTextColor={COLORS.text2}
            />

            <View style={styles.anonRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.anonTitle}>Anonymous to public</Text>
                <Text style={styles.anonBody}>Your identity is hidden publicly but retained internally for moderation.</Text>
              </View>
              <Switch value={anonymous} onValueChange={setAnonymous} />
            </View>

            <Pressable style={[styles.cta, submitting && { opacity: 0.55 }]} onPress={() => void onSubmit()} disabled={submitting}>
              <Text style={styles.ctaText}>{submitting ? 'Submitting…' : 'Submit Nomination'}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 12, paddingBottom: 30 },
  empty: { borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.lg, backgroundColor: '#fff', padding: 12 },
  emptyTitle: { color: COLORS.navy, fontWeight: '800', fontSize: 16 },
  emptyBody: { color: COLORS.text2, fontWeight: '600', marginTop: 6, lineHeight: 18, marginBottom: 12 },
  banner: { borderWidth: 1, borderColor: '#F0DFC0', backgroundColor: '#FFFDF7', borderRadius: RADIUS.lg, padding: 12, marginBottom: 10 },
  bannerTitle: { color: COLORS.navy, fontWeight: '800', fontSize: 15 },
  bannerBody: { color: COLORS.text2, fontWeight: '600', marginTop: 4 },
  label: { color: COLORS.red, fontWeight: '800', fontSize: 13, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, color: COLORS.navy, fontWeight: '600' },
  multi: { minHeight: 90, textAlignVertical: 'top' },
  searchResults: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, marginTop: 6 },
  searchRow: { paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#EEF2F6' },
  searchText: { color: COLORS.navy, fontWeight: '600' },
  selectedRow: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedText: { color: COLORS.navy, fontWeight: '700' },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catPill: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  catPillActive: { borderColor: COLORS.red, backgroundColor: COLORS.red },
  catText: { color: COLORS.navy, fontWeight: '700', fontSize: 12 },
  info: { color: COLORS.text2, fontWeight: '600', fontSize: 12, marginTop: 6 },
  anonRow: { marginTop: 12, padding: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 10 },
  anonTitle: { color: COLORS.navy, fontWeight: '700', fontSize: 13 },
  anonBody: { color: COLORS.text2, fontWeight: '600', fontSize: 11, marginTop: 3, lineHeight: 16 },
  cta: { marginTop: 14, borderRadius: 999, backgroundColor: COLORS.red, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10 },
  ctaText: { color: '#fff', fontWeight: '800' },
});
