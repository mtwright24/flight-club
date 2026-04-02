import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';
import { COLORS, RADIUS, SHADOW } from '../../src/styles/theme';
import {
  addCrewHonorComment,
  deleteCrewHonorComment,
  getCrewHonorComments,
  getCrewHonorWinnerDetail,
  reportCrewHonorComment,
  toggleCrewHonorReaction,
  trackCrewHonorShare,
  type CrewHonorComment,
  type CrewHonorReactionType,
  type CrewHonorWinner,
} from '../../lib/crewHonors';

const REACTIONS: CrewHonorReactionType[] = ['clap', 'trophy', 'heart', 'fire', 'salute', 'airplane_star'];

const reactionLabel: Record<CrewHonorReactionType, string> = {
  clap: 'Clap',
  trophy: 'Trophy',
  heart: 'Heart',
  fire: 'Fire',
  salute: 'Salute',
  airplane_star: 'Air Star',
};

export default function CrewHonorDetailScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const params = useLocalSearchParams<{ winnerId?: string | string[] }>();
  const winnerId = typeof params.winnerId === 'string' ? params.winnerId : params.winnerId?.[0] || '';
  const [winner, setWinner] = useState<CrewHonorWinner | null>(null);
  const [comments, setComments] = useState<CrewHonorComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    if (!winnerId) return;
    setLoading(true);
    const [w, c] = await Promise.all([
      getCrewHonorWinnerDetail(winnerId, userId),
      getCrewHonorComments(winnerId),
    ]);
    setWinner(w);
    setComments(c);
    setLoading(false);
  }, [winnerId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await load();
  });

  const onReaction = useCallback(async (reaction: CrewHonorReactionType) => {
    if (!winner) return;
    setBusy(true);
    await toggleCrewHonorReaction(winner.id, reaction);
    await load();
    setBusy(false);
  }, [load, winner]);

  const onAddComment = useCallback(async () => {
    if (!winner) return;
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    const res = await addCrewHonorComment(winner.id, text);
    if (res.ok) setDraft('');
    await load();
    setBusy(false);
  }, [draft, load, winner]);

  const onShare = useCallback(async (target: 'dm' | 'crew_room' | 'feed' | 'copy_link') => {
    if (!winner) return;
    const url = `flightclub://crew-honors/${encodeURIComponent(winner.id)}`;
    const message = `Crew Honors: ${winner.category.title} — ${winner.display_name}\n${winner.short_blurb}\n${url}`;
    await trackCrewHonorShare(winner.id, target).catch(() => {});
    if (target === 'dm') {
      router.push({ pathname: '/new-message', params: { shareText: message } });
      return;
    }
    if (target === 'crew_room') {
      router.push('/(tabs)/crew-rooms');
      void Share.share({ message });
      return;
    }
    if (target === 'feed') {
      router.push('/create-post');
      void Share.share({ message });
      return;
    }
    await Share.share({ message });
  }, [router, winner]);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <FlightClubHeader title="Crew Honors" showLogo={false} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={REFRESH_CONTROL_COLORS} tintColor={REFRESH_TINT} />}
      >
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={COLORS.red} /></View>
        ) : !winner ? (
          <View style={styles.empty}><Text style={styles.emptyText}>Honor not found.</Text></View>
        ) : (
          <>
            <View style={[styles.hero, SHADOW.soft]}>
              <Text style={styles.cat}>{winner.category.title}</Text>
              <Text style={styles.name}>{winner.display_name}</Text>
              <Text style={styles.meta}>{[winner.role, winner.base].filter(Boolean).join(' · ') || 'Crew Member'}</Text>
              <Text style={styles.blurb}>{winner.short_blurb}</Text>
              <Text style={styles.reason}>{winner.why_they_won}</Text>
              <Text style={styles.cycle}>Cycle {String(winner.cycle.month).padStart(2, '0')}/{winner.cycle.year}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Reactions</Text>
              <View style={styles.reactionsWrap}>
                {REACTIONS.map((r) => {
                  const active = winner.my_reactions.includes(r);
                  return (
                    <Pressable key={r} style={[styles.reactionBtn, active && styles.reactionBtnActive]} onPress={() => void onReaction(r)} disabled={busy}>
                      <Text style={[styles.reactionBtnText, active && { color: '#fff' }]}>{reactionLabel[r]} · {winner.reaction_counts[r] || 0}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Share</Text>
              <View style={styles.shareWrap}>
                <Pressable style={styles.shareBtn} onPress={() => void onShare('dm')}><Text style={styles.shareBtnText}>Send in DM</Text></Pressable>
                <Pressable style={styles.shareBtn} onPress={() => void onShare('crew_room')}><Text style={styles.shareBtnText}>Share to Crew Room</Text></Pressable>
                <Pressable style={styles.shareBtn} onPress={() => void onShare('feed')}><Text style={styles.shareBtnText}>Share to Feed</Text></Pressable>
                <Pressable style={styles.shareBtn} onPress={() => void onShare('copy_link')}><Text style={styles.shareBtnText}>Copy Link</Text></Pressable>
              </View>
            </View>

            {userId === winner.winner_user_id && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Winner Display Preferences</Text>
                <Pressable style={styles.shareBtn} onPress={() => router.push(`/crew-honors/preferences/${winner.id}`)}>
                  <Text style={styles.shareBtnText}>Edit Public Display</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Comments ({comments.length})</Text>
              <View style={styles.composeRow}>
                <TextInput
                  style={styles.composeInput}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Add a supportive comment..."
                  placeholderTextColor={COLORS.text2}
                />
                <Pressable style={styles.composeSend} onPress={() => void onAddComment()} disabled={busy || !draft.trim()}>
                  <Ionicons name="send" size={14} color="#fff" />
                </Pressable>
              </View>
              {comments.map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commentAuthor}>{c.user_display_name}</Text>
                    <Text style={styles.commentBody}>{c.body}</Text>
                  </View>
                  {userId === c.user_id ? (
                    <Pressable onPress={() => void deleteCrewHonorComment(c.id).then(load)}>
                      <Ionicons name="trash-outline" size={16} color={COLORS.text2} />
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => void reportCrewHonorComment(c.id, 'Inappropriate')}>
                      <Ionicons name="flag-outline" size={16} color={COLORS.text2} />
                    </Pressable>
                  )}
                </View>
              ))}
              {comments.length === 0 && <Text style={styles.emptyText}>No comments yet.</Text>}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 12, paddingBottom: 24 },
  loading: { paddingVertical: 30, alignItems: 'center' },
  empty: { borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.lg, backgroundColor: '#fff', padding: 12 },
  emptyText: { color: COLORS.text2, fontWeight: '600' },
  hero: { borderWidth: 1, borderColor: '#F0DFC0', borderRadius: 16, backgroundColor: '#FFFDF7', padding: 14 },
  cat: { color: COLORS.navy, fontWeight: '800', fontSize: 18 },
  name: { color: COLORS.navySoft, fontWeight: '800', fontSize: 16, marginTop: 3 },
  meta: { color: COLORS.text2, fontWeight: '700', fontSize: 12, marginTop: 4 },
  blurb: { color: COLORS.text2, fontWeight: '700', marginTop: 8 },
  reason: { color: COLORS.navySoft, fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: 8 },
  cycle: { color: COLORS.text2, fontWeight: '700', marginTop: 10, fontSize: 12 },
  section: { marginTop: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.lg, padding: 12 },
  sectionTitle: { color: COLORS.red, fontWeight: '800', fontSize: 14, marginBottom: 8 },
  reactionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reactionBtn: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  reactionBtnActive: { borderColor: COLORS.red, backgroundColor: COLORS.red },
  reactionBtnText: { color: COLORS.navy, fontWeight: '700', fontSize: 12 },
  shareWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shareBtn: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  shareBtnText: { color: COLORS.navySoft, fontWeight: '700', fontSize: 12 },
  composeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  composeInput: { flex: 1, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: COLORS.navy },
  composeSend: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  commentRow: { borderTopWidth: 1, borderTopColor: '#EEF2F6', paddingVertical: 8, flexDirection: 'row', gap: 8 },
  commentAuthor: { color: COLORS.navy, fontWeight: '700', fontSize: 12 },
  commentBody: { color: COLORS.navySoft, fontSize: 12, lineHeight: 17, marginTop: 2 },
});
