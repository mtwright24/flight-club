import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FeedVideoPreview } from '../src/components/media/FeedVideoPreview';

type PostCardProps = {
	post: any;
	onPress?: (post: any) => void;
	onLike?: (post: any) => void;
	onComment?: (post: any) => void;
	onProfile?: (user: any) => void;
};

export default function PostCard({ post, onPress, onLike, onComment, onProfile }: PostCardProps) {
	const likeCount = post.like_count ?? 0;
	const commentCount = post.comment_count ?? 0;
	const shareCount = post.share_count ?? 0;

	const { useRouter } = require('expo-router');
	const router = useRouter();
	return (
		<Pressable style={styles.card} onPress={() => onPress?.(post)}>
			<View style={styles.header}>
				<Pressable onPress={() => router.push(`/profile/${post.user?.id}`)}>
					<Image source={{ uri: post.user?.avatar_url }} style={styles.avatar} />
				</Pressable>
				<View style={{ flex: 1 }}>
					<Pressable onPress={() => router.push(`/profile/${post.user?.id}`)}>
						<Text style={styles.name}>{post.user?.first_name || post.user?.full_name}</Text>
					</Pressable>
					<Text style={styles.meta}>{post.user?.role} • {post.user?.base}</Text>
				</View>
				<Pressable style={styles.menu}><Ionicons name="ellipsis-horizontal" size={20} color="#64748b" /></Pressable>
			</View>

			{post.content ? <Text style={styles.text} numberOfLines={6}>{post.content}</Text> : null}

			{post.media_type === 'image' && post.media_url ? (
				<Image
					source={{ uri: post.media_url }}
					style={[styles.media, post.aspect_ratio ? { aspectRatio: post.aspect_ratio } : { height: 200 }]}
				/>
			) : null}

			{(post.media_type === 'video' || post.media_type === 'reel') && post.media_url ? (
				post.thumbnail_url ? (
					<View style={styles.mediaWrap}>
						<Image
							source={{ uri: post.thumbnail_url }}
							style={[styles.media, post.aspect_ratio ? { aspectRatio: post.aspect_ratio } : { height: 200 }]}
						/>
						<View style={styles.playIcon}><Ionicons name="play" size={32} color="#fff" /></View>
					</View>
				) : (
					<FeedVideoPreview
						uri={post.media_url}
						height={post.aspect_ratio ? undefined : 200}
						style={[styles.media, post.aspect_ratio ? { aspectRatio: post.aspect_ratio } : { height: 200 }]}
					/>
				)
			) : null}

			{/* Top meta line: reactions left, comments right */}
			<View style={styles.metaRow}>
				<View style={styles.metaLeft}>
					{likeCount > 0 && (
						<View style={styles.metaReactions}>
							<Ionicons name="heart" size={14} color="#B5161E" style={{ marginRight: 4 }} />
							<Text style={styles.metaText}>{likeCount}</Text>
						</View>
					)}
				</View>
				<View style={styles.metaRight}>
					{commentCount > 0 && (
						<Text style={styles.metaText}>
							{commentCount} comment{commentCount !== 1 ? 's' : ''}
						</Text>
					)}
				</View>
			</View>

			{/* Action row: single-stat buttons (no stacked emoji cluster on the right) */}
			<View style={styles.footer}>
				<View style={styles.actionsLeft}>
					<Pressable style={styles.action} onPress={() => onLike?.(post)}>
						<Ionicons
							name={post.liked_by_me ? 'heart' : 'heart-outline'}
							size={18}
							color={post.liked_by_me ? '#B5161E' : '#64748b'}
						/>
						<Text style={styles.actionText}>{likeCount}</Text>
					</Pressable>

					<Pressable style={styles.action} onPress={() => onComment?.(post)}>
						<Ionicons name="chatbubble-ellipses-outline" size={18} color="#64748b" />
						<Text style={styles.actionText}>{commentCount}</Text>
					</Pressable>

					<Pressable style={styles.action} onPress={() => {}}>
						<Ionicons name="share-social-outline" size={18} color="#64748b" />
						<Text style={styles.actionText}>{shareCount}</Text>
					</Pressable>
				</View>
			</View>

			{post.top_comment ? (
				<View style={styles.topCommentRow}>
					<Pressable onPress={() => router.push(`/profile/${post.top_comment.user?.id}`)}>
						<Image source={{ uri: post.top_comment.user?.avatar_url }} style={styles.commentAvatar} />
					</Pressable>
					<Text style={styles.topComment}>
						<Pressable onPress={() => router.push(`/profile/${post.top_comment.user?.id}`)}>
							<Text style={{ fontWeight: '800' }}>
								{post.top_comment.user?.first_name || post.top_comment.user?.full_name}
							</Text>
						</Pressable>{' '}
						{post.top_comment.body}
					</Text>
				</View>
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 12,
		borderWidth: 1,
		borderColor: '#E5E7EB',
		marginBottom: 12,
	},
	header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
	avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 8 },
	name: { fontWeight: '800', color: '#0F172A' },
	meta: { color: '#64748B', fontSize: 12 },
	menu: { padding: 8 },
	text: { marginVertical: 8, color: '#0F172A' },
	media: { width: '100%', borderRadius: 12, marginTop: 8, backgroundColor: '#F1F5F9' },
	mediaWrap: { position: 'relative' },
	playIcon: {
		position: 'absolute',
		top: '50%',
		left: '50%',
		marginLeft: -16,
		marginTop: -16,
		backgroundColor: 'rgba(0,0,0,0.4)',
		borderRadius: 20,
		padding: 4,
	},

	// Top meta line
	metaRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginTop: 8,
	},
	metaLeft: { flexDirection: 'row', alignItems: 'center' },
	metaRight: { flexDirection: 'row', alignItems: 'center' },
	metaReactions: { flexDirection: 'row', alignItems: 'center' },
	metaText: { fontSize: 12, color: '#64748B', fontWeight: '500' },

	footer: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 10,
		paddingRight: 4,
	},
	actionsLeft: {
		flexDirection: 'row',
		alignItems: 'center',
		flexGrow: 1,
	},
	action: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 6,
		paddingHorizontal: 8,
		marginRight: 4,
	},
	actionText: { marginLeft: 4, color: '#0F172A', fontWeight: '700' },

	topCommentRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
	commentAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
	topComment: { color: '#0F172A' },
});

