import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { SPACING } from '../../styles/theme';
import {
  addCrewHonorComment,
  crewHonorRoleBaseLine,
  deleteCrewHonorComment,
  formatHonorCycleLabel,
  getCrewHonorComments,
  getCrewHonorWinnerDetail,
  getCrewHonorsHomeWinners,
  honorRecognitionBodyForUi,
  reportCrewHonorComment,
  toggleCrewHonorReaction,
  trackCrewHonorShare,
  type CrewHonorComment,
  type CrewHonorReactionType,
  type CrewHonorWinner,
} from '../../../lib/crewHonors';
import CrewHonorAvatar from './CrewHonorAvatar';
import CrewHonorMiniCard from './CrewHonorMiniCard';
import CrewHonorReactionBar from './CrewHonorReactionBar';
import { CH } from './crewHonorsTheme';

/**
 * Min width per honor tile — high enough that typical phones use **2 cards / slide**
 * (~half screen each) so “Crew MVP”, name, and blurb read on one line like the mockup.
 */
const HOME_HONOR_MIN_CARD_WIDTH = 124;

function cardsPerSlideForWidth(screenW: number): number {
  const pagePad = 16;
  const gap = 8;
  const inner = screenW - pagePad * 2;
  for (const n of [4, 3, 2] as const) {
    const cw = (inner - gap * (n - 1)) / n;
    if (cw >= HOME_HONOR_MIN_CARD_WIDTH) return n;
  }
  return 2;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function categoryHeroIon(slug: string): keyof typeof Ionicons.glyphMap {
  const s = slug.toLowerCase();
  if (s === 'crew-mvp' || s.includes('mvp')) return 'trophy';
  if (s.includes('calm') || s.includes('pressure')) return 'flash-outline';
  if (s.includes('mom') || s.includes('dad')) return 'heart-outline';
  return 'ribbon';
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

  const perSlide = useMemo(() => cardsPerSlideForWidth(width), [width]);
  const pagePad = 16;
  const gap = 8;
  const inner = width - pagePad * 2;
  const cardWidth = useMemo(() => {
    const g = gap * (perSlide - 1);
    return Math.max(HOME_HONOR_MIN_CARD_WIDTH, Math.floor((inner - g) / perSlide));
  }, [inner, perSlide, gap]);

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

  const pages = useMemo(() => chunk(cards, perSlide), [cards, perSlide]);
  const slides = pages.length;

  const onShare = useCallback(
    async (winner: CrewHonorWinner, target: 'dm' | 'crew_room' | 'feed' | 'copy_link') => {
      const url = `flightclub://crew-honors/${encodeURIComponent(winner.id)}`;
      const cycle = formatHonorCycleLabel(winner.cycle);
      const text = `${winner.category.title} · ${winner.display_name}\n${winner.short_blurb}\n${cycle}\n${url}`;
      if (target === 'dm') {
        await trackCrewHonorShare(winner.id, 'dm').catch(() => {});
        router.push({ pathname: '/new-message', params: { shareText: text } });
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

  const avatarUri = (w: CrewHonorWinner) => (!w.use_initials_avatar ? w.avatar_url : null);

  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Ionicons name="trophy" size={17} color={CH.gold} style={{ marginRight: 8 }} />
            <Text style={styles.title}>Crew Honors</Text>
          </View>
          <Text style={styles.subtitle}>Recognizing standout crew</Text>
        </View>
        <Pressable onPress={() => router.push('/crew-honors')} hitSlop={8}>
          <Text style={styles.seeAll}>See All {'>'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={CH.red} />
        </View>
      ) : cards.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Crew Honors</Text>
          <Text style={styles.emptyBody}>Monthly recognition for standout crew, helpful legends, and unforgettable personalities.</Text>
          <Pressable style={styles.emptyCta} onPress={() => router.push('/crew-honors/nominate')}>
            <Text style={styles.emptyCtaText}>Nominate someone</Text>
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
              <View key={`honor-page-${idx}`} style={[styles.page, { width }]}>
                <View style={[styles.pageInner, { paddingHorizontal: pagePad, gap }]}>
                  {page.map((winner) => (
                    <CrewHonorMiniCard
                      key={winner.id}
                      winner={winner}
                      layout="home"
                      cardWidth={cardWidth}
                      onPress={() => setSelected(winner)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
          {slides > 1 ? (
            <View style={styles.dots}>
              {Array.from({ length: slides }).map((_, i) => (
                <View key={`dot-${i}`} style={[styles.dot, i === activeSlide && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </>
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            {!detail ? (
              <>
                <View style={styles.modalTop}>
                  <Pressable onPress={() => setSelected(null)} hitSlop={12}>
                    <Text style={styles.closeText}>Close</Text>
                  </Pressable>
                  <Pressable onPress={() => setSelected(null)} hitSlop={12} accessibilityLabel="Close">
                    <Ionicons name="close" size={26} color={CH.navySoft} />
                  </Pressable>
                </View>
                <View style={styles.modalLoading}>
                  <ActivityIndicator color={CH.red} />
                </View>
              </>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.modalScrollContent}
              >
                <View style={[styles.honorBadgeOuter, { borderColor: detail.category.trim_color || CH.cardBorder }]}>
                  <View style={styles.honorBadgeFace}>
                    <LinearGradient
                      pointerEvents="none"
                      colors={['#FFFFFB', '#FFF6E0', '#F4E4B8', '#E6CF8A', '#D4B45C', '#C4A14E']}
                      locations={[0, 0.12, 0.38, 0.62, 0.86, 1]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <LinearGradient
                      pointerEvents="none"
                      colors={['rgba(255,255,255,0.65)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)', 'rgba(45,32,8,0.09)']}
                      locations={[0, 0.25, 0.55, 1]}
                      start={{ x: 0.15, y: 0 }}
                      end={{ x: 0.85, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.honorBadgeContent}>
                      <View style={styles.badgeHeaderRow}>
                      <Pressable onPress={() => setSelected(null)} hitSlop={12}>
                        <Text style={styles.closeTextOnBadge}>Close</Text>
                      </Pressable>
                      <Pressable onPress={() => setSelected(null)} hitSlop={12} accessibilityLabel="Close">
                        <Ionicons name="close" size={24} color={CH.navySoft} />
                      </Pressable>
                      </View>

                      <View style={styles.heroTitleRow}>
                      <Ionicons
                        name={categoryHeroIon(detail.category.slug)}
                        size={28}
                        color={detail.category.accent_primary || CH.gold}
                      />
                      <Text style={styles.heroAward}>{detail.category.title}</Text>
                    </View>
                    <CrewHonorAvatar
                      uri={avatarUri(detail)}
                      initials={detail.initials}
                      size={96}
                      borderColor={detail.category.trim_color || CH.cardBorder}
                      ringWidth={3}
                    />
                    <Text style={styles.heroName}>{detail.display_name}</Text>
                    {crewHonorRoleBaseLine(detail) ? <Text style={styles.heroRole}>{crewHonorRoleBaseLine(detail)}</Text> : null}
                    <Text style={styles.heroRecognition} numberOfLines={5}>
                      {honorRecognitionBodyForUi(detail)}
                    </Text>
                    <Text style={styles.heroCycle}>{formatHonorCycleLabel(detail.cycle)}</Text>

                    {(detail.total_reactions > 0 || detail.comments_count > 0) && (
                      <View style={styles.heroEngagePill}>
                        {detail.total_reactions > 0 ? (
                          <View style={styles.heroEngageItem}>
                            <Ionicons name="heart" size={16} color={CH.red} />
                            <Text style={styles.heroEngageNum}>{detail.total_reactions}</Text>
                          </View>
                        ) : null}
                        {detail.total_reactions > 0 && detail.comments_count > 0 ? <View style={styles.heroEngageRule} /> : null}
                        {detail.comments_count > 0 ? (
                          <View style={styles.heroEngageItem}>
                            <Ionicons name="chatbubble-outline" size={16} color={CH.muted} />
                            <Text style={styles.heroEngageNum}>{detail.comments_count}</Text>
                          </View>
                        ) : null}
                      </View>
                    )}

                    <View style={styles.inBadgeDivider} />

                    <View style={styles.reactionPanelInBadge}>
                      <CrewHonorReactionBar winner={detail} dense busy={busy} onToggle={(r) => void onToggleReaction(detail, r)} />
                    </View>

                    <Text style={styles.inBadgeSectionLabel}>Share</Text>
                    <View style={styles.shareGridInBadge}>
                      <View style={styles.shareRowInBadge}>
                        <Pressable style={styles.shareChipInBadge} onPress={() => onShare(detail, 'dm')}>
                          <Text style={styles.shareChipTextInBadge}>Send in DM</Text>
                        </Pressable>
                        <Pressable style={styles.shareChipInBadge} onPress={() => onShare(detail, 'crew_room')}>
                          <Text style={styles.shareChipTextInBadge}>Share to Crew Room</Text>
                        </Pressable>
                      </View>
                      <View style={styles.shareRowInBadge}>
                        <Pressable style={styles.shareChipInBadge} onPress={() => onShare(detail, 'feed')}>
                          <Text style={styles.shareChipTextInBadge}>Share to Feed</Text>
                        </Pressable>
                        <Pressable style={styles.shareChipInBadge} onPress={() => onShare(detail, 'copy_link')}>
                          <Text style={styles.shareChipTextInBadge}>Copy Link</Text>
                        </Pressable>
                      </View>
                    </View>

                    <Text style={styles.inBadgeSectionLabel}>Comments</Text>
                    <View style={styles.composerInBadge}>
                      <TextInput
                        value={commentDraft}
                        onChangeText={setCommentDraft}
                        placeholder="Say something supportive…"
                        placeholderTextColor={CH.muted}
                        style={styles.composerInputInBadge}
                        maxLength={400}
                        multiline
                      />
                      <Pressable
                        onPress={() => void onSendComment()}
                        disabled={busy || !commentDraft.trim()}
                        style={[styles.sendBtn, (!commentDraft.trim() || busy) && styles.sendBtnOff]}
                      >
                        <Ionicons name="send" size={16} color="#fff" />
                      </Pressable>
                    </View>
                    <View style={styles.commentListInBadge}>
                      {comments.map((c) => (
                        <View key={c.id} style={styles.commentRowInBadge}>
                          <CrewHonorAvatar uri={c.user_avatar_url} initials={c.user_display_name.slice(0, 2)} size={32} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.commentAuthorInBadge} numberOfLines={1}>
                              {c.user_display_name}
                            </Text>
                            <Text style={styles.commentBodyInBadge}>{c.body}</Text>
                          </View>
                          {userId === c.user_id ? (
                            <Pressable
                              onPress={() =>
                                void deleteCrewHonorComment(c.id).then(() => getCrewHonorComments(detail.id).then(setComments))
                              }
                            >
                              <Ionicons name="trash-outline" size={18} color={CH.muted} />
                            </Pressable>
                          ) : (
                            <Pressable onPress={() => void reportCrewHonorComment(c.id, 'Inappropriate')}>
                              <Ionicons name="flag-outline" size={18} color={CH.muted} />
                            </Pressable>
                          )}
                        </View>
                      ))}
                      {comments.length === 0 ? <Text style={styles.noCommentsInBadge}>No comments yet — be the first.</Text> : null}
                    </View>

                    <Pressable
                      style={styles.primaryWrapInBadge}
                      onPress={() => {
                        setSelected(null);
                        router.push('/crew-honors');
                      }}
                    >
                      <LinearGradient
                        colors={['#F0DEB0', '#D4A85C']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.primaryGrad}
                      >
                        <Text style={styles.primaryGradText}>View All Honors</Text>
                      </LinearGradient>
                    </Pressable>
                    <Pressable style={styles.secondaryBtnInBadge} onPress={() => router.push(`/profile/${detail.winner_user_id}`)}>
                      <Text style={styles.secondaryBtnTextInBadge}>View profile</Text>
                    </Pressable>
                    </View>
                  </View>
                </View>
              </ScrollView>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  titleBlock: { flex: 1, paddingRight: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { color: CH.red, fontWeight: '900', fontSize: 18, letterSpacing: -0.3 },
  subtitle: { color: CH.muted, fontSize: 13, fontWeight: '600', marginTop: 3 },
  seeAll: { color: CH.muted, fontWeight: '700', fontSize: 14 },
  loading: { paddingVertical: 20, alignItems: 'center' },
  empty: {
    backgroundColor: CH.card,
    borderRadius: CH.radiusMd,
    borderWidth: 1.5,
    borderColor: CH.cardBorder,
    padding: 16,
    ...CH.shadow.card,
  },
  emptyTitle: { color: CH.red, fontWeight: '800', fontSize: 17, marginBottom: 6 },
  emptyBody: { color: CH.muted, fontWeight: '600', lineHeight: 21, marginBottom: 14 },
  emptyCta: { backgroundColor: CH.red, borderRadius: 999, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10 },
  emptyCtaText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  page: { justifyContent: 'flex-start' },
  pageInner: { flexDirection: 'row', alignItems: 'stretch' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 10, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D0D7E2' },
  dotActive: { width: 18, borderRadius: 4, backgroundColor: CH.red },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: CH.pageBg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '92%',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 28,
  },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  closeText: { color: CH.muted, fontWeight: '700', fontSize: 16 },
  closeTextOnBadge: { color: CH.muted, fontWeight: '700', fontSize: 15 },
  modalLoading: { paddingVertical: 32, alignItems: 'center' },
  modalScrollContent: { width: '100%', paddingBottom: 12 },
  /** Single honor “badge” — gold rim + diagonal champagne ombre (mockup). */
  honorBadgeOuter: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: 24,
    borderWidth: 2,
    padding: 3,
    marginBottom: 8,
    backgroundColor: '#E8D5A0',
    ...CH.shadow.elevated,
  },
  honorBadgeFace: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  honorBadgeContent: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    alignItems: 'center',
  },
  badgeHeaderRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  heroAward: { color: CH.navy, fontWeight: '900', fontSize: 19 },
  heroName: { color: CH.navy, fontWeight: '900', fontSize: 22, marginTop: 10, textAlign: 'center' },
  heroRole: { color: CH.muted, fontWeight: '700', fontSize: 14, marginTop: 6, textAlign: 'center' },
  heroRecognition: {
    color: CH.navySoft,
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  heroCycle: { color: CH.mutedLight, fontWeight: '700', fontSize: 12, marginTop: 10 },
  heroEngagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 252, 248, 0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 140, 50, 0.38)',
    shadowColor: '#2d1f0a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  heroEngageItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroEngageRule: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    marginHorizontal: 18,
    backgroundColor: 'rgba(148, 163, 184, 0.35)',
  },
  heroEngageNum: { color: CH.navySoft, fontWeight: '800', fontSize: 15 },
  inBadgeDivider: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    marginTop: 16,
    marginBottom: 4,
    backgroundColor: 'rgba(148, 163, 184, 0.28)',
  },
  reactionPanelInBadge: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 252, 248, 0.55)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 140, 50, 0.35)',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    alignItems: 'center',
    shadowColor: '#2d1f0a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  inBadgeSectionLabel: {
    alignSelf: 'stretch',
    color: CH.navySoft,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
    opacity: 0.85,
  },
  shareGridInBadge: { alignSelf: 'stretch', gap: 8, marginBottom: 4 },
  shareRowInBadge: { flexDirection: 'row', gap: 8 },
  shareChipInBadge: {
    flex: 1,
    minWidth: 0,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 140, 50, 0.4)',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    shadowColor: '#2d1f0a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  shareChipTextInBadge: { color: CH.navySoft, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  composerInBadge: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginBottom: 6,
  },
  composerInputInBadge: {
    flex: 1,
    minHeight: 44,
    maxHeight: 96,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 140, 50, 0.35)',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: CH.navy,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CH.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.4 },
  commentListInBadge: { alignSelf: 'stretch', marginBottom: 8 },
  commentRowInBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148, 163, 184, 0.25)',
  },
  commentAuthorInBadge: { color: CH.navy, fontWeight: '800', fontSize: 13 },
  commentBodyInBadge: { color: CH.navySoft, fontWeight: '500', fontSize: 14, lineHeight: 20, marginTop: 2 },
  noCommentsInBadge: { color: CH.muted, fontWeight: '600', fontSize: 14, paddingVertical: 8, textAlign: 'center' },
  primaryWrapInBadge: { alignSelf: 'stretch', borderRadius: 999, overflow: 'hidden', marginTop: 12, marginBottom: 10 },
  primaryGrad: { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  primaryGradText: { color: CH.navy, fontWeight: '900', fontSize: 16, letterSpacing: 0.2 },
  secondaryBtnInBadge: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 140, 50, 0.4)',
    shadowColor: '#2d1f0a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  secondaryBtnTextInBadge: { color: CH.navySoft, fontWeight: '800', fontSize: 15 },
});
