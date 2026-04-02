import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { COLORS, RADIUS, SHADOW, SPACING } from '../../../src/styles/theme';
import {
  addCrewHonorComment,
  type CrewHonorComment,
  type CrewHonorReactionType,
  type CrewHonorWinner,
  deleteCrewHonorComment,
  getCrewHonorComments,
  getCrewHonorWinnerDetail,
  getCrewHonorsHomeWinners,
  reportCrewHonorComment,
  toggleCrewHonorReaction,
  trackCrewHonorShare,
} from '../../../lib/crewHonors';

const REACTIONS: CrewHonorReactionType[] = ['clap', 'trophy', 'heart', 'fire', 'salute', 'airplane_star'];

const reactionIcon: Record<CrewHonorReactionType, keyof typeof Ionicons.glyphMap> = {
  clap: 'hand-left-outline',
  trophy: 'trophy-outline',
  heart: 'heart-outline',
  fire: 'flame-outline',
  salute: 'shield-checkmark-outline',
  airplane_star: 'airplane-outline',
};

function cycleLabel(w: CrewHonorWinner): string {
  const m = String(w.cycle.month).padStart(2, '0');
  return `${m}/${w.cycle.year}`;
}

function totalSlides(totalCards: number): number {
  if (totalCards <= 0) return 0;
  return Math.ceil(totalCards / 4);
}

function grouped(cards: CrewHonorWinner[]): CrewHonorWinner[][] {
  const out: CrewHonorWinner[][] = [];
  for (let i = 0; i < cards.length; i += 4) out.push(cards.slice(i, i + 4));
  return out;
}

export default function CrewHonorsHomeSection({ userId }: { userId: string | null | undefined }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<CrewHonorWinner[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [selected, setSelected] = useState<CrewHonorWinner | null>(null);
  const [detail, setDetail] = useState<CrewHonorWinner | null>(null);
  const [comments, setComments] = useState<CrewHonorComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getCrewHonorsHomeWinners(userId || null);
    setCards(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    if (!selected) {
      setDetail(null);
      setComments([]);
      return;
    }
    void (async () => {
      const [winner, list] = await Promise.all([
        getCrewHonorWinnerDetail(selected.id, userId || null),
        getCrewHonorComments(selected.id),
      ]);
      if (!alive) return;
      setDetail(winner);
      setComments(list);
    })();
    return () => {
      alive = false;
    };
  }, [selected, userId]);

  const cardWidth = useMemo(() => {
    const inner = width - SPACING.md * 2;
    const gap = 8 * 3;
    return Math.max(82, Math.floor((inner - gap) / 4));
  }, [width]);

  const pages = useMemo(() => grouped(cards), [cards]);
  const slides = totalSlides(cards.length);

  const onShare = useCallback(
    async (winner: CrewHonorWinner, target: 'dm' | 'crew_room' | 'feed' | 'copy_link') => {
      const url = `flightclub://crew-honors/${encodeURIComponent(winner.id)}`;
      const text = `Crew Honors: ${winner.category.title} — ${winner.display_name}\n${winner.short_blurb}\n${url}`;
      if (target === 'dm') {
        await trackCrewHonorShare(winner.id, 'dm').catch(() => {});
        router.push({
          pathname: '/new-message',
          params: { shareText: text },
        });
        return;
      }
      if (target === 'crew_room') {
        await trackCrewHonorShare(winner.id, 'crew_room').catch(() => {});
        router.push('/(tabs)/crew-rooms');
        void Share.share({ message: text });
        return;
      }
      if (target === 'feed') {
        await trackCrewHonorShare(winner.id, 'feed').catch(() => {});
        router.push('/create-post');
        void Share.share({ message: text });
        return;
      }
      await trackCrewHonorShare(winner.id, 'copy_link').catch(() => {});
      await Share.share({ message: text });
    },
    [router]
  );

  const onToggleReaction = useCallback(
    async (winner: CrewHonorWinner, reaction: CrewHonorReactionType) => {
      setBusy(true);
      await toggleCrewHonorReaction(winner.id, reaction);
      const [winnerRefreshed, commentsRefreshed] = await Promise.all([
        getCrewHonorWinnerDetail(winner.id, userId || null),
        getCrewHonorComments(winner.id),
      ]);
      setDetail(winnerRefreshed);
      setComments(commentsRefreshed);
      setBusy(false);
      void load();
    },
    [load, userId]
  );

  const onSendComment = useCallback(async () => {
    if (!detail) return;
    const body = commentDraft.trim();
    if (!body) return;
    setBusy(true);
    const res = await addCrewHonorComment(detail.id, body);
    if (res.ok) setCommentDraft('');
    const [winnerRefreshed, commentsRefreshed] = await Promise.all([
      getCrewHonorWinnerDetail(detail.id, userId || null),
      getCrewHonorComments(detail.id),
    ]);
    setDetail(winnerRefreshed);
    setComments(commentsRefreshed);
    setBusy(false);
    void load();
  }, [commentDraft, detail, load, userId]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <View>
          <Text style={styles.title}>Crew Honors</Text>
          <Text style={styles.subtitle}>Recognizing standout crew</Text>
        </View>
        <Pressable onPress={() => router.push('/crew-honors')} hitSlop={8}>
          <Text style={styles.seeAll}>See All {'>'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.red} />
        </View>
      ) : cards.length === 0 ? (
        <View style={[styles.empty, SHADOW.soft]}>
          <Text style={styles.emptyTitle}>Crew Honors is coming soon</Text>
          <Text style={styles.emptyBody}>
            Monthly recognition for standout crew, helpful legends, and unforgettable personalities.
          </Text>
          <Pressable style={styles.emptyCta} onPress={() => router.push('/crew-honors/nominate')}>
            <Text style={styles.emptyCtaText}>Nominate Someone</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const page = Math.round(e.nativeEvent.contentOffset.x / width);
              setActiveSlide(page);
            }}
          >
            {pages.map((page, idx) => (
              <View key={`crew-honors-page-${idx}`} style={[styles.page, { width }]}>
                {page.map((winner) => (
                  <Pressable
                    key={winner.id}
                    style={[styles.card, SHADOW.soft, { width: cardWidth }]}
                    onPress={() => setSelected(winner)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${winner.category.title} for ${winner.display_name}`}
                  >
                    <View
                      style={[
                        styles.crest,
                        { borderColor: winner.category.trim_color, backgroundColor: winner.category.accent_secondary },
                      ]}
                    >
                      <Ionicons name="ribbon-outline" size={14} color={winner.category.accent_primary} />
                    </View>
                    <View
                      style={[
                        styles.avatar,
                        { borderColor: winner.category.trim_color, backgroundColor: winner.category.accent_secondary },
                      ]}
                    >
                      <Text style={styles.avatarText}>
                        {winner.avatar_url ? '' : winner.initials}
                      </Text>
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {winner.category.title}
                    </Text>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {winner.display_name}
                    </Text>
                    <Text style={styles.cardBlurb} numberOfLines={1}>
                      {winner.short_blurb}
                    </Text>
                    {(winner.total_reactions > 0 || winner.comments_count > 0) && (
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {winner.total_reactions > 0 ? `${winner.total_reactions} reactions` : '0 reactions'} ·{' '}
                        {winner.comments_count} comments
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
          {slides > 1 && (
            <View style={styles.dots}>
              {Array.from({ length: slides }).map((_, i) => (
                <View key={`dot-${i}`} style={[styles.dot, i === activeSlide && styles.dotActive]} />
              ))}
            </View>
          )}
        </>
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalScrim}>
          <View style={[styles.modalCard, SHADOW.card]}>
            <View style={styles.modalTop}>
              <Text style={styles.modalHeader}>Crew Honor</Text>
              <Pressable onPress={() => setSelected(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={COLORS.text2} />
              </Pressable>
            </View>

            {!detail ? (
              <View style={{ paddingVertical: 24 }}>
                <ActivityIndicator color={COLORS.red} />
              </View>
            ) : (
              <>
                <View style={styles.detailPreview}>
                  <Text style={styles.detailTitle}>{detail.category.title}</Text>
                  <Text style={styles.detailWinner}>{detail.display_name}</Text>
                  <Text style={styles.detailAux}>
                    {[detail.role, detail.base].filter(Boolean).join(' · ') || 'Crew Member'}
                  </Text>
                  <Text style={styles.detailBlurb}>{detail.short_blurb}</Text>
                  <Text style={styles.detailReason}>{detail.why_they_won}</Text>
                  <Text style={styles.detailCycle}>Cycle {cycleLabel(detail)}</Text>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reactionRow}>
                  {REACTIONS.map((r) => {
                    const selectedReaction = detail.my_reactions.includes(r);
                    return (
                      <Pressable
                        key={r}
                        onPress={() => onToggleReaction(detail, r)}
                        style={[styles.reactionPill, selectedReaction && styles.reactionPillActive]}
                        disabled={busy}
                      >
                        <Ionicons name={reactionIcon[r]} size={14} color={selectedReaction ? '#fff' : COLORS.navy} />
                        <Text style={[styles.reactionPillText, selectedReaction && { color: '#fff' }]}>
                          {detail.reaction_counts[r] || 0}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={styles.quickActions}>
                  <Pressable onPress={() => onShare(detail, 'dm')} style={styles.quickBtn}>
                    <Text style={styles.quickBtnText}>Send in DM</Text>
                  </Pressable>
                  <Pressable onPress={() => onShare(detail, 'crew_room')} style={styles.quickBtn}>
                    <Text style={styles.quickBtnText}>Share to Crew Room</Text>
                  </Pressable>
                  <Pressable onPress={() => onShare(detail, 'feed')} style={styles.quickBtn}>
                    <Text style={styles.quickBtnText}>Share to Feed</Text>
                  </Pressable>
                  <Pressable onPress={() => onShare(detail, 'copy_link')} style={styles.quickBtn}>
                    <Text style={styles.quickBtnText}>Copy Link</Text>
                  </Pressable>
                </View>

                <Text style={styles.commentsTitle}>Comments ({comments.length})</Text>
                <View style={styles.commentComposer}>
                  <TextInput
                    value={commentDraft}
                    onChangeText={setCommentDraft}
                    placeholder="Say something supportive..."
                    placeholderTextColor={COLORS.text2}
                    style={styles.commentInput}
                    maxLength={400}
                  />
                  <Pressable onPress={onSendComment} disabled={busy || !commentDraft.trim()} style={styles.commentSend}>
                    <Ionicons name="send" size={14} color="#fff" />
                  </Pressable>
                </View>
                <ScrollView style={{ maxHeight: 140 }}>
                  {comments.map((c) => (
                    <View key={c.id} style={styles.commentRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.commentAuthor}>{c.user_display_name}</Text>
                        <Text style={styles.commentBody}>{c.body}</Text>
                      </View>
                      {userId === c.user_id ? (
                        <Pressable onPress={() => void deleteCrewHonorComment(c.id).then(() => getCrewHonorComments(detail.id).then(setComments))}>
                          <Ionicons name="trash-outline" size={16} color={COLORS.text2} />
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => void reportCrewHonorComment(c.id, 'Inappropriate')}>
                          <Ionicons name="flag-outline" size={16} color={COLORS.text2} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                  {comments.length === 0 && <Text style={styles.noComments}>No comments yet — be the first.</Text>}
                </ScrollView>

                <View style={styles.modalBottomBtns}>
                  <Pressable style={styles.modalCta} onPress={() => router.push('/crew-honors')}>
                    <Text style={styles.modalCtaText}>View All Honors</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalCta, styles.modalGhost]}
                    onPress={() => router.push(`/profile/${detail.winner_user_id}`)}
                  >
                    <Text style={[styles.modalCtaText, { color: COLORS.navy }]}>Open Winner Profile</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: SPACING.lg },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { color: COLORS.red, fontWeight: '800', fontSize: 19 },
  subtitle: { color: COLORS.text2, fontSize: 12, fontWeight: '600', marginTop: 2 },
  seeAll: { color: COLORS.text2, fontWeight: '700', fontSize: 13 },
  loading: { paddingVertical: 20, alignItems: 'center' },
  empty: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 16,
  },
  emptyTitle: { color: COLORS.navy, fontWeight: '800', fontSize: 16, marginBottom: 8 },
  emptyBody: { color: COLORS.text2, fontWeight: '600', lineHeight: 20, marginBottom: 12 },
  emptyCta: { backgroundColor: COLORS.red, borderRadius: 999, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8 },
  emptyCtaText: { color: '#fff', fontWeight: '800' },
  page: { flexDirection: 'row', paddingHorizontal: 8, gap: 8 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EDD9A3',
    backgroundColor: '#FFFDF7',
    padding: 8,
    minHeight: 156,
  },
  crest: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarText: { color: COLORS.navy, fontWeight: '800', fontSize: 12 },
  cardTitle: { color: COLORS.navy, fontWeight: '800', fontSize: 11, lineHeight: 14, minHeight: 28 },
  cardName: { color: COLORS.navySoft, fontWeight: '700', fontSize: 11, marginTop: 4 },
  cardBlurb: { color: COLORS.text2, fontWeight: '600', fontSize: 10, marginTop: 4 },
  cardMeta: { color: COLORS.text2, fontSize: 9, fontWeight: '700', marginTop: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 10, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D0D7E2' },
  dotActive: { width: 16, borderRadius: 4, backgroundColor: COLORS.red },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(10,20,35,0.45)',
    justifyContent: 'flex-end',
    padding: 12,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    maxHeight: '88%',
    padding: 14,
  },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalHeader: { color: COLORS.navy, fontWeight: '800', fontSize: 17 },
  detailPreview: { backgroundColor: '#FFFBF0', borderRadius: 14, borderWidth: 1, borderColor: '#F1E2B7', padding: 12, marginBottom: 10 },
  detailTitle: { color: COLORS.navy, fontWeight: '800', fontSize: 16 },
  detailWinner: { color: COLORS.navySoft, fontWeight: '800', fontSize: 15, marginTop: 2 },
  detailAux: { color: COLORS.text2, fontWeight: '700', fontSize: 12, marginTop: 2 },
  detailBlurb: { color: COLORS.text2, fontWeight: '700', fontSize: 12, marginTop: 8 },
  detailReason: { color: COLORS.navySoft, fontWeight: '600', fontSize: 13, marginTop: 8, lineHeight: 18 },
  detailCycle: { color: COLORS.text2, fontWeight: '700', fontSize: 11, marginTop: 8 },
  reactionRow: { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#fff',
  },
  reactionPillActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  reactionPillText: { color: COLORS.navy, fontWeight: '700', fontSize: 12 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2, marginBottom: 10 },
  quickBtn: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  quickBtnText: { color: COLORS.navySoft, fontWeight: '700', fontSize: 12 },
  commentsTitle: { color: COLORS.navy, fontWeight: '800', fontSize: 14, marginBottom: 6 },
  commentComposer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: COLORS.navy,
    fontSize: 13,
  },
  commentSend: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.red,
  },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderTopWidth: 1, borderTopColor: '#EEF1F7', paddingVertical: 7 },
  commentAuthor: { color: COLORS.navy, fontWeight: '700', fontSize: 12 },
  commentBody: { color: COLORS.navySoft, fontWeight: '500', fontSize: 12, lineHeight: 16, marginTop: 2 },
  noComments: { color: COLORS.text2, fontWeight: '600', fontSize: 12, paddingVertical: 8 },
  modalBottomBtns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modalCta: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.red },
  modalGhost: { backgroundColor: '#F2F5FA' },
  modalCtaText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
