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
import CrewHonorAvatar from '../../src/components/crewHonors/CrewHonorAvatar';
import CrewHonorReactionBar from '../../src/components/crewHonors/CrewHonorReactionBar';
import { CH } from '../../src/components/crewHonors/crewHonorsTheme';
import { useAuth } from '../../src/hooks/useAuth';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';
import {
  addCrewHonorComment,
  crewHonorRoleBaseLine,
  deleteCrewHonorComment,
  formatHonorCycleLabel,
  getCrewHonorComments,
  getCrewHonorWinnerDetail,
  honorRecognitionBodyForUi,
  reportCrewHonorComment,
  toggleCrewHonorReaction,
  trackCrewHonorShare,
  type CrewHonorComment,
  type CrewHonorReactionType,
  type CrewHonorWinner,
} from '../../lib/crewHonors';

function categoryHeroIon(slug: string): keyof typeof Ionicons.glyphMap {
  const s = slug.toLowerCase();
  if (s === 'crew-mvp' || s.includes('mvp')) return 'trophy';
  if (s.includes('calm') || s.includes('pressure')) return 'flash-outline';
  if (s.includes('mom') || s.includes('dad')) return 'heart-outline';
  return 'ribbon';
}

function avatarUri(w: CrewHonorWinner) {
  return !w.use_initials_avatar ? w.avatar_url : null;
}

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

  const onReaction = useCallback(
    async (reaction: CrewHonorReactionType) => {
      if (!winner) return;
      setBusy(true);
      await toggleCrewHonorReaction(winner.id, reaction);
      await load();
      setBusy(false);
    },
    [load, winner]
  );

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

  const onShare = useCallback(
    async (target: 'dm' | 'crew_room' | 'feed' | 'copy_link') => {
      if (!winner) return;
      const url = `flightclub://crew-honors/${encodeURIComponent(winner.id)}`;
      const cycle = formatHonorCycleLabel(winner.cycle);
      const message = `${winner.category.title} · ${winner.display_name}\n${winner.short_blurb}\n${cycle}\n${url}`;
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
    },
    [router, winner]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <FlightClubHeader title="Crew Honors" showLogo={false} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={REFRESH_CONTROL_COLORS} tintColor={REFRESH_TINT} />
        }
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={CH.red} />
          </View>
        ) : !winner ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>This honor is not available.</Text>
          </View>
        ) : (
          <>
            <View style={[styles.heroShell, { borderColor: winner.category.trim_color }]}>
              <View style={[styles.heroInner, { borderColor: CH.cardBorder }]}>
                <View style={styles.heroTitleRow}>
                  <Ionicons
                    name={categoryHeroIon(winner.category.slug)}
                    size={26}
                    color={winner.category.accent_primary || CH.gold}
                  />
                  <Text style={styles.awardTitle}>{winner.category.title}</Text>
                </View>
                <CrewHonorAvatar
                  uri={avatarUri(winner)}
                  initials={winner.initials}
                  size={100}
                  borderColor={winner.category.trim_color}
                  ringWidth={3}
                />
                <Text style={styles.winnerName}>{winner.display_name}</Text>
                {crewHonorRoleBaseLine(winner) ? <Text style={styles.roleLine}>{crewHonorRoleBaseLine(winner)}</Text> : null}
                <Text style={styles.recognition} numberOfLines={6}>
                  {honorRecognitionBodyForUi(winner)}
                </Text>
                <Text style={styles.cycle}>{formatHonorCycleLabel(winner.cycle)}</Text>
              </View>
            </View>

            <View style={styles.reactionPanel}>
              <CrewHonorReactionBar winner={winner} dense busy={busy} onToggle={(r) => void onReaction(r)} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Share</Text>
              <View style={styles.shareGrid}>
                <Pressable style={styles.shareChip} onPress={() => void onShare('dm')}>
                  <Text style={styles.shareChipText}>Send in DM</Text>
                </Pressable>
                <Pressable style={styles.shareChip} onPress={() => void onShare('crew_room')}>
                  <Text style={styles.shareChipText}>Share to Crew Room</Text>
                </Pressable>
                <Pressable style={styles.shareChip} onPress={() => void onShare('feed')}>
                  <Text style={styles.shareChipText}>Share to Feed</Text>
                </Pressable>
                <Pressable style={styles.shareChip} onPress={() => void onShare('copy_link')}>
                  <Text style={styles.shareChipText}>Copy Link</Text>
                </Pressable>
              </View>
            </View>

            <Pressable style={styles.profileCta} onPress={() => router.push(`/profile/${winner.winner_user_id}`)}>
              <Text style={styles.profileCtaText}>Open winner profile</Text>
              <Ionicons name="chevron-forward" size={18} color={CH.red} />
            </Pressable>

            {userId === winner.winner_user_id && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>How you appear</Text>
                <Pressable style={styles.shareChip} onPress={() => router.push(`/crew-honors/preferences/${winner.id}`)}>
                  <Text style={styles.shareChipText}>Edit public display</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Comments</Text>
              <View style={styles.composeRow}>
                <TextInput
                  style={styles.composeInput}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Say something supportive…"
                  placeholderTextColor={CH.muted}
                  multiline
                />
                <Pressable style={styles.composeSend} onPress={() => void onAddComment()} disabled={busy || !draft.trim()}>
                  <Ionicons name="send" size={14} color="#fff" />
                </Pressable>
              </View>
              {comments.length === 0 ? (
                <Text style={styles.commentsEmpty}>No comments yet — be the first.</Text>
              ) : (
                comments.map((c) => (
                  <View key={c.id} style={styles.commentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.commentAuthor}>{c.user_display_name}</Text>
                      <Text style={styles.commentBody}>{c.body}</Text>
                    </View>
                    {userId === c.user_id ? (
                      <Pressable onPress={() => void deleteCrewHonorComment(c.id).then(load)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color={CH.muted} />
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => void reportCrewHonorComment(c.id, 'Inappropriate')} hitSlop={8}>
                        <Ionicons name="flag-outline" size={18} color={CH.muted} />
                      </Pressable>
                    )}
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CH.pageBg },
  content: { padding: 16, paddingBottom: 32 },
  loading: { paddingVertical: 32, alignItems: 'center' },
  empty: {
    backgroundColor: CH.card,
    borderWidth: 1,
    borderColor: CH.line,
    borderRadius: CH.radiusMd,
    padding: 16,
  },
  emptyText: { color: CH.muted, fontWeight: '600', fontSize: 15 },
  heroShell: {
    borderRadius: CH.radiusLg,
    borderWidth: 2,
    padding: 3,
    backgroundColor: CH.champagne,
    marginBottom: 12,
    ...CH.shadow.elevated,
  },
  heroInner: {
    borderRadius: CH.radiusMd,
    borderWidth: 1,
    backgroundColor: CH.card,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  awardTitle: { color: CH.navy, fontWeight: '900', fontSize: 20, textAlign: 'center' },
  winnerName: { color: CH.navy, fontWeight: '900', fontSize: 21, marginTop: 10, textAlign: 'center' },
  roleLine: { color: CH.muted, fontWeight: '700', fontSize: 14, marginTop: 6, textAlign: 'center' },
  recognition: {
    color: CH.navySoft,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  cycle: { color: CH.mutedLight, fontWeight: '700', marginTop: 14, fontSize: 13 },
  reactionPanel: {
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CH.line,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 64,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: CH.line,
    borderRadius: CH.radiusMd,
    padding: 14,
  },
  sectionTitle: { color: CH.red, fontWeight: '800', fontSize: 14, marginBottom: 10 },
  shareGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shareChip: {
    borderWidth: 1,
    borderColor: CH.line,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: CH.champagne,
  },
  shareChipText: { color: CH.navySoft, fontWeight: '700', fontSize: 13 },
  profileCta: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: CH.line,
    borderRadius: CH.radiusMd,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  profileCtaText: { color: CH.navy, fontWeight: '800', fontSize: 15 },
  composeRow: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'flex-end' },
  composeInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: CH.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: CH.navy,
    fontWeight: '600',
    fontSize: 15,
    backgroundColor: CH.pageBg,
  },
  composeSend: { width: 40, height: 40, borderRadius: 20, backgroundColor: CH.red, alignItems: 'center', justifyContent: 'center' },
  commentsEmpty: { color: CH.muted, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  commentRow: { borderTopWidth: 1, borderTopColor: CH.line, paddingVertical: 10, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentAuthor: { color: CH.navy, fontWeight: '800', fontSize: 13 },
  commentBody: { color: CH.navySoft, fontSize: 14, lineHeight: 20, marginTop: 4, fontWeight: '600' },
});
