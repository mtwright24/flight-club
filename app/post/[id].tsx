import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import PostCard from '../../components/PostCard';
import { getPostById, getComments, addComment } from '../../lib/feed';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const postId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const router = useRouter();

  const loadPostAndComments = useCallback(async (isPull = false) => {
    if (!postId) return;
    if (!isPull) setLoading(true);
    try {
      const p = await getPostById(postId);
      setPost(p);
      const c = await getComments(postId, { limit: 50, offset: 0 });
      setComments(c);
    } catch {
      /* keep prior */
    } finally {
      if (!isPull) setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void loadPostAndComments(false);
  }, [loadPostAndComments]);

  const { refreshing: postPullRefreshing, onRefresh: onPostPullRefresh } = usePullToRefresh(async () => {
    await loadPostAndComments(true);
  });

  const handleAddComment = async () => {
    if (!commentText.trim() || !postId) return;
    setPosting(true);
    await addComment(postId, commentText);
    setCommentText('');
    const c = await getComments(postId, { limit: 50, offset: 0 });
    setComments(c);
    setPosting(false);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#B5161E" /></View>;
  if (!post) return <View style={styles.center}><Text>Post not found.</Text></View>;

  return (
    <ScrollView
      style={styles.safe}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={postPullRefreshing}
          onRefresh={onPostPullRefresh}
          colors={REFRESH_CONTROL_COLORS}
          tintColor={REFRESH_TINT}
        />
      }
    >
      <PostCard post={post} />
      {/* Comments */}
      <View style={styles.commentsSection}>
        {comments.map(c => (
          <View key={c.id} style={styles.commentRow}>
            <Text style={styles.commentUser}>{c.profiles?.first_name || c.profiles?.full_name || 'User'}</Text>
            <Text style={styles.commentBody}>{c.body}</Text>
          </View>
        ))}
        <View style={styles.addCommentRow}>
          <TextInput
            style={styles.input}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Add a comment..."
            editable={!posting}
          />
          <Pressable onPress={handleAddComment} disabled={posting || !commentText.trim()} style={styles.button}>
            <Text style={styles.buttonText}>{posting ? 'Posting...' : 'Post'}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  commentsSection: { marginTop: 24 },
  commentRow: { marginBottom: 12, backgroundColor: '#fff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  commentUser: { fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  commentBody: { color: '#0F172A' },
  addCommentRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  input: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 8, marginRight: 8, color: '#0F172A' },
  button: { backgroundColor: '#B5161E', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
