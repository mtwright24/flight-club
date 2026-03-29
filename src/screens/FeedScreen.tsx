
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import CommentsDrawer from '../components/comments/CommentsDrawer';
import PostComposerCard from '../components/posts/PostComposerCard';
import PostsFeed from '../components/posts/PostsFeed';
import ReactionTrayOverlay from '../components/posts/ReactionTrayOverlay';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../styles/theme';
// import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { buildForYouFeed, getFollowingFeed } from '../../lib/feed';
import { RoomPostComment } from '../lib/supabase/posts';
import { PostReactionSummary, ReactionType } from '../lib/supabase/reactions';
import { createSocialFeedPost, uploadSocialFeedMedia } from '../lib/supabase/socialFeed';
import { createSocialPostComment, deleteSocialFeedPost, fetchSocialPostComments } from '../lib/supabase/socialFeedComments';
import { fetchSocialFeedReactionsSummary } from '../lib/supabase/socialFeedReactions';
import { toggleSocialPostReaction } from '../lib/supabase/socialFeedReactionsActions';
import { supabase } from '../lib/supabaseClient';

const TABS = [
  { key: 'following', label: 'Following' },
  { key: 'forYou', label: 'For You' },
];

export default function FeedScreen() {
  const [tab, setTab] = useState('following');
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [composeContent, setComposeContent] = useState('');
  const [composeMedia, setComposeMedia] = useState<string[]>([]);
  const [composeUploading, setComposeUploading] = useState(false);
  const { session } = useAuth();
  const [reactionsSummary, setReactionsSummary] = useState<PostReactionSummary>({});
  const [trayVisible, setTrayVisible] = useState(false);
  const [trayAnchorLayout, setTrayAnchorLayout] = useState<
    { x: number; y: number; width: number; height: number } | null
  >(null);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [commentsDrawerVisible, setCommentsDrawerVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<RoomPostComment[]>([]);
  const router = useRouter();

  // Load the signed-in user's avatar from profiles so the composer uses their real photo
  useEffect(() => {
    const loadAvatar = async () => {
      try {
        const userId = session?.user?.id;
        if (!userId) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', userId)
          .single();

        if (!error && data?.avatar_url) {
          setAvatarUrl(data.avatar_url);
        } else {
          // Fallback to any avatar in user metadata, if present
          const metaAvatar = session?.user?.user_metadata?.avatar_url;
          if (metaAvatar) {
            setAvatarUrl(metaAvatar);
          }
        }
      } catch (e) {
        console.error('Error loading feed avatar:', e);
      }
    };

    loadAvatar();
  }, [session]);

  const fetchFeed = async (refresh = false) => {
    const userId = session?.user?.id;

    // If the user is not logged in, just clear the feed quietly
    if (!userId) {
      setPosts([]);
      setReactionsSummary({});
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoading(!refresh);
    setRefreshing(refresh);
    try {
      let data: any[] = [];
      if (tab === 'following') {
        data = await getFollowingFeed({ userId, limit: 20, offset: 0 });
      } else {
        data = await buildForYouFeed({ userId, limit: 20, offset: 0 });
      }
      // Normalize posts so the feed component always has
      // profile_display_name/profile_avatar_url populated from profiles.
      const normalized = (data || []).map((post: any) => {
        const profile = (post as any).profiles || {};
        return {
          ...post,
          profile_display_name:
            post.profile_display_name ??
            profile.display_name ??
            profile.full_name ??
            undefined,
          profile_avatar_url:
            post.profile_avatar_url ??
            profile.avatar_url ??
            undefined,
        };
      });

      setPosts(normalized);

      if (data && data.length > 0) {
        const ids = data.map((p) => p.id);
        const summary = await fetchSocialFeedReactionsSummary(ids, userId);
        setReactionsSummary(summary);
      } else {
        setReactionsSummary({});
      }
    } catch (e: any) {
      if (e?.message === 'Not logged in') {
        // Session disappeared; treat as logged-out state instead of an error
        setPosts([]);
        setReactionsSummary({});
      } else {
        console.error('Error loading social feed:', e);
        setPosts([]);
        setReactionsSummary({});
      }
    }
    setLoading(false);
    setRefreshing(false);
  };

  React.useEffect(() => { fetchFeed(); }, [tab, session?.user?.id]);

  const openCommentsDrawer = async (postId: string) => {
    setSelectedPostId(postId);
    setCommentsDrawerVisible(true);

    try {
      const data = await fetchSocialPostComments(postId);
      const mapped: RoomPostComment[] = (data || []).map((item: any) => ({
        id: item.id,
        post_id: item.post_id,
        room_id: '',
        user_id: item.user_id,
        content: item.body ?? item.content ?? '',
        parent_comment_id: item.parent_comment_id ?? null,
        created_at: item.created_at,
        profile_display_name:
          item.profile_display_name || item.profiles?.display_name || undefined,
        profile_avatar_url:
          item.profile_avatar_url || item.profiles?.avatar_url || undefined,
      }));
      setComments(mapped);
    } catch (error) {
      console.error('Error loading social post comments:', error);
      setComments([]);
    }
  };

  const handleOpenReactionTray = (
    postId: string,
    anchorLayout: { x: number; y: number; width: number; height: number }
  ) => {
    setActivePostId(postId);
    setTrayAnchorLayout(anchorLayout);
    setTrayVisible(true);
  };

  const handleCloseReactionTray = () => {
    setTrayVisible(false);
  };

  const handleSelectReaction = async (reaction: ReactionType) => {
    const userId = session?.user?.id;
    if (!userId || !activePostId) return;

    const postId = activePostId;

    setReactionsSummary((prev) => {
      const newSummary = { ...prev };
      const postReactions = newSummary[postId] || { counts: {} };
      const currentUserReaction = postReactions.userReaction;
      const newCounts: any = { ...(postReactions.counts || {}) };

      if (currentUserReaction === reaction) {
        newCounts[reaction] = Math.max(0, (newCounts[reaction] || 0) - 1);
        newSummary[postId] = { counts: newCounts };
      } else if (currentUserReaction) {
        newCounts[currentUserReaction] = Math.max(0, (newCounts[currentUserReaction] || 0) - 1);
        newCounts[reaction] = (newCounts[reaction] || 0) + 1;
        newSummary[postId] = { counts: newCounts, userReaction: reaction };
      } else {
        newCounts[reaction] = (newCounts[reaction] || 0) + 1;
        newSummary[postId] = { counts: newCounts, userReaction: reaction };
      }

      return newSummary;
    });

    const result = await toggleSocialPostReaction(postId, userId, reaction);
    if (!result.success) {
      console.error('[FeedScreen] Failed to toggle social reaction:', result.error);
      if (session?.user?.id) {
        const ids = posts.map((p: any) => p.id);
        const summary = await fetchSocialFeedReactionsSummary(ids, session.user.id);
        setReactionsSummary(summary);
      }
    }
  };



  const renderTabs = () => (
    <View style={styles.tabs}>
      {TABS.map(t => (
        <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
          <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  const handleComposerPress = () => {
    setComposeContent('');
    setComposeMedia([]);
    setCreateSheetVisible(true);
  };

  const pickMedia = async (kind: 'image' | 'video' | 'reel') => {
    try {
      const mediaTypes =
        kind === 'image'
          ? (['images'] as any)
          : (['videos'] as any);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes,
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (asset?.uri) {
        setComposeMedia((prev) => [...prev, asset.uri]);
      }
    } catch (e) {
      console.error('Image picker error:', e);
      Alert.alert(
        'Unable to access media',
        'Please make sure Flight Club has permission to access your photos and videos in Settings.'
      );
    }
  };

  const canPost = useMemo(() => {
    const userId = session?.user?.id;
    return !!userId && (composeContent.trim().length > 0 || composeMedia.length > 0);
  }, [session, composeContent, composeMedia]);

  const handleAddComment = async (text: string, parentCommentId?: string | null) => {
    const userId = session?.user?.id;
    if (!userId || !selectedPostId) return;

    const result = await createSocialPostComment(selectedPostId, userId, text, parentCommentId);
    if (!result.success) {
      if (result.error) {
        Alert.alert('Could not post comment', result.error);
      }
      return;
    }

    const data = await fetchSocialPostComments(selectedPostId);
    const mapped: RoomPostComment[] = (data || []).map((item: any) => ({
      id: item.id,
      post_id: item.post_id,
      room_id: '',
      user_id: item.user_id,
      content: item.body ?? item.content ?? '',
      parent_comment_id: item.parent_comment_id ?? null,
      created_at: item.created_at,
      profile_display_name:
        item.profile_display_name || item.profiles?.display_name || undefined,
      profile_avatar_url:
        item.profile_avatar_url || item.profiles?.avatar_url || undefined,
    }));
    setComments(mapped);
  };

  const handleSubmitPost = async () => {
    const userId = session?.user?.id;
    if (!userId || !canPost || composeUploading) return;

    try {
      console.log('[SOCIAL_POST] submit start', {
        hasText: composeContent.trim().length > 0,
        mediaCount: composeMedia.length,
      });
      setComposeUploading(true);
      let uploadedUrls: string[] = [];

      if (composeMedia.length > 0) {
        const uploads = await Promise.all(
          composeMedia.map(async (uri) => {
            const fileName = uri.split('/').pop() || `media-${Date.now()}`;
            const lower = fileName.toLowerCase();
            const type =
              lower.endsWith('.mp4') || lower.endsWith('.mov')
                ? 'video/mp4'
                : 'image/jpeg';
            console.log('[SOCIAL_POST] upload start', { fileName, type });
            const result = await uploadSocialFeedMedia(userId, {
              uri,
              name: fileName,
              type,
            });
            if (!result.success) {
              console.error('[SOCIAL_POST] upload failed', result.error);
            } else {
              console.log('[SOCIAL_POST] upload success', { fileName, hasUrl: !!result.url });
            }
            return result.success && result.url ? result.url : null;
          })
        );
        uploadedUrls = uploads.filter(Boolean) as string[];

        if (composeMedia.length > 0 && uploadedUrls.length === 0) {
          Alert.alert(
            'Upload failed',
            'We could not upload your photo or video. Please try again or choose a different file.'
          );
          setComposeUploading(false);
          return;
        }
      }

      console.log('[SOCIAL_POST] create start', { uploadedCount: uploadedUrls.length });
      const res = await createSocialFeedPost(userId, composeContent, uploadedUrls);
      setComposeUploading(false);

      if (res.success) {
        console.log('[SOCIAL_POST] create success', { postId: res.post?.id });
        setComposeContent('');
        setComposeMedia([]);
        setCreateSheetVisible(false);
        fetchFeed(true);
      } else if (res.error) {
        console.error('[SOCIAL_POST] create failed', res.error);
        Alert.alert('Could not create post', res.error);
      }
    } catch (e) {
      console.error('[SOCIAL_POST] submit exception', e);
      setComposeUploading(false);
    } finally {
      console.log('[SOCIAL_POST] submit done');
    }
  };

  const renderCreateBar = () => (
    <PostComposerCard
      avatarUrl={avatarUrl || ''}
      onComposerPress={handleComposerPress}
      onPhotoPress={() => pickMedia('image')}
    />
  );

  return (
    <KeyboardAvoidingView
      style={styles.safe}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <View style={styles.safe}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.headerRed} />
          </View>
        ) : (
          <PostsFeed
            headerComponent={
              <>
                {renderTabs()}
                {renderCreateBar()}
                <View style={{ height: 12 }} />
              </>
            }
            posts={posts}
            emptyTitle="No posts yet."
            reactionsSummary={reactionsSummary}
            onOpenReactionTray={handleOpenReactionTray}
            onPostPress={openCommentsDrawer}
            onPostUpdated={fetchFeed}
            onPostDeleted={() => {
              void fetchFeed(true);
            }}
            refreshing={refreshing}
            onRefresh={() => fetchFeed(true)}
            deletePostOverride={async (postId: string) => {
              const userId = session?.user?.id;
              if (!userId) {
                return { success: false, error: 'You must be signed in to delete posts.' };
              }
              try {
                await deleteSocialFeedPost(postId, userId);
                return { success: true };
              } catch (error) {
                console.error('Error deleting social post:', error);
                return {
                  success: false,
                  error: error instanceof Error ? error.message : 'Failed to delete post',
                };
              }
            }}
          />
        )}
        {/* Social feed uses full-screen composer, not modal sheet */}

        <Modal
          visible={createSheetVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setCreateSheetVisible(false)}
        >
          <View style={styles.sheetBackdrop}>
            <Pressable style={{ flex: 1 }} onPress={() => setCreateSheetVisible(false)} />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
            >
              <View style={styles.sheetContainer}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>Create post</Text>
                <Text style={styles.sheetSubtitle}>Write something or add media, then post.</Text>

                <View style={styles.composeRow}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.composeAvatar} />
                  ) : (
                    <View style={styles.composeAvatarPlaceholder}>
                      <Ionicons name="person" size={20} color={colors.headerRed} />
                    </View>
                  )}
                  <TextInput
                    style={styles.composeInput}
                    placeholder="Write something…"
                    placeholderTextColor="#94A3B8"
                    multiline
                    value={composeContent}
                    onChangeText={setComposeContent}
                  />
                </View>

                {composeMedia.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.mediaPreviewRow}
                  >
                    {composeMedia.map((uri, idx) => (
                      <Image key={idx} source={{ uri }} style={styles.mediaPreview} />
                    ))}
                  </ScrollView>
                )}

                <View style={styles.sheetActionsRow}>
                  <Pressable
                    style={styles.sheetActionChip}
                    onPress={() => setComposeMedia([])}
                  >
                    <Ionicons
                      name="create-outline"
                      size={18}
                      color={colors.headerRed}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.sheetActionText}>Text</Text>
                  </Pressable>

                  <Pressable
                    style={styles.sheetActionChip}
                    onPress={() => pickMedia('image')}
                  >
                    <Ionicons
                      name="image-outline"
                      size={18}
                      color={colors.headerRed}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.sheetActionText}>Photo</Text>
                  </Pressable>

                  <Pressable
                    style={styles.sheetActionChip}
                    onPress={() => pickMedia('video')}
                  >
                    <Ionicons
                      name="videocam-outline"
                      size={18}
                      color={colors.headerRed}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.sheetActionText}>Video</Text>
                  </Pressable>

                  <Pressable
                    style={styles.sheetActionChip}
                    onPress={() => pickMedia('reel')}
                  >
                    <Ionicons
                      name="play-circle-outline"
                      size={18}
                      color={colors.headerRed}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.sheetActionText}>Reel</Text>
                  </Pressable>
                </View>

                <View style={styles.sheetFooterRow}>
                  <Pressable
                    style={styles.sheetCancel}
                    onPress={() => setCreateSheetVisible(false)}
                    disabled={composeUploading}
                  >
                    <Text style={styles.sheetCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.postButton,
                      !canPost || composeUploading ? styles.postButtonDisabled : null,
                    ]}
                    onPress={handleSubmitPost}
                    disabled={!canPost || composeUploading}
                  >
                    <Text style={styles.postButtonText}>
                      {composeUploading ? 'Posting…' : 'Post'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </View>
      {selectedPostId && (
        <CommentsDrawer
          visible={commentsDrawerVisible}
          comments={comments}
          onClose={() => {
            setCommentsDrawerVisible(false);
            setSelectedPostId(null);
            setComments([]);
          }}
          onAddComment={handleAddComment}
          postId={selectedPostId}
          commentReactionMode="social"
          userId={session?.user?.id ?? null}
        />
      )}
      <ReactionTrayOverlay
        visible={trayVisible}
        anchorLayout={trayAnchorLayout || undefined}
        selectedReaction={
          activePostId ? reactionsSummary[activePostId]?.userReaction : undefined
        }
        reactionCounts={
          (activePostId ? reactionsSummary[activePostId]?.counts : {}) as Record<
            ReactionType,
            number
          >
        }
        onSelect={handleSelectReaction}
        onClose={handleCloseReactionTray}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 0 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  headerIcons: { flexDirection: 'row', gap: 16 },
  tabs: { flexDirection: 'row', marginTop: 8, marginBottom: 8, paddingHorizontal: 16 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.headerRed },
  tabText: { color: '#64748B', fontWeight: '700' },
  tabTextActive: { color: colors.headerRed },
  createBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, margin: 16, marginTop: 0, borderWidth: 1, borderColor: '#E5E7EB' },
  createText: { color: '#94a3b8', fontWeight: '600', fontSize: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#64748B', fontSize: 16, marginTop: 24 },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 16,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  sheetIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sheetItemTextContainer: {
    flex: 1,
  },
  sheetItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  sheetItemSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  sheetCancel: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sheetCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.headerRed,
  },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  composeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  composeAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  composeInput: {
    flex: 1,
    minHeight: 60,
    maxHeight: 140,
    fontSize: 15,
    color: '#0F172A',
  },
  mediaPreviewRow: {
    marginBottom: 12,
  },
  mediaPreview: {
    width: 72,
    height: 72,
    borderRadius: 10,
    marginRight: 8,
  },
  sheetActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  sheetActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    marginRight: 8,
    marginBottom: 8,
  },
  sheetActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.headerRed,
  },
  sheetFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  postButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.headerRed,
  },
  postButtonDisabled: {
    backgroundColor: '#F87171',
    opacity: 0.6,
  },
  postButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
