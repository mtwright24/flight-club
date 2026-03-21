import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, radius, shadow } from '../styles/theme';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { createRoomPost, uploadPostImage } from '../lib/supabase/posts';

interface CreatePostScreenProps {
  roomId: string;
  onClose: () => void;
  onPosted: () => void;
  startMode?: 'text' | 'photo';
}

export default function CreatePostScreen({
  roomId,
  onClose,
  onPosted,
  startMode = 'text',
}: CreatePostScreenProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const inputRef = useRef<TextInput>(null);
  const didAutoPick = useRef(false);

  const [roomName, setRoomName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadRoom = async () => {
      const { data } = await supabase
        .from('rooms')
        .select('name,is_private,base,fleet,airline')
        .eq('id', roomId)
        .single();

      if (data) {
        setRoomName(data.name);
        setIsPrivate(data.is_private);
        const tagList = [data.base, data.fleet, data.airline].filter(Boolean) as string[];
        setTags(tagList);
      }
    };

    loadRoom();
  }, [roomId]);

  useEffect(() => {
    if (startMode === 'text') {
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(t);
    }

    if (startMode === 'photo' && !didAutoPick.current) {
      didAutoPick.current = true;
      const t = setTimeout(() => {
        pickImage();
      }, 100);
      return () => clearTimeout(t);
    }

    return undefined;
  }, [startMode]);

  const canPost = useMemo(() => {
    return !!userId && (content.trim().length > 0 || media.length > 0);
  }, [content, media, userId]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (asset?.uri) {
        setMedia((prev) => [...prev, asset.uri]);
      }
    } catch (error) {
      console.error('Image picker error:', error);
    }
  };

  const handlePost = async () => {
    if (!userId || !canPost) return;

    try {
      setLoading(true);

      let uploadedUrls: string[] = [];

      if (media.length > 0) {
        const uploads = await Promise.all(
          media.map(async (uri) => {
            const fileName = uri.split('/').pop() || `image-${Date.now()}.jpg`;
            const result = await uploadPostImage(roomId, userId, {
              uri,
              name: fileName,
              type: 'image/jpeg',
            });
            return result.success ? result.url : null;
          })
        );

        uploadedUrls = uploads.filter(Boolean) as string[];
        console.log('[CREATE POST] Uploaded URLs:', uploadedUrls);
      }

      const result = await createRoomPost(roomId, userId, content, uploadedUrls);
      console.log('[CREATE POST] Result:', result);

      if (result.success) {
        onPosted();
        onClose();
      }
    } catch (error) {
      console.error('Post creation error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Create a post</Text>
          <Pressable
            onPress={handlePost}
            disabled={!canPost || loading}
            style={[styles.postButton, (!canPost || loading) && styles.postButtonDisabled]}
          >
            {loading ? (
              <ActivityIndicator color={colors.cardBg} size="small" />
            ) : (
              <Text style={styles.postButtonText}>Post</Text>
            )}
          </Pressable>
        </View>

        {/* Group Info */}
        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{roomName}</Text>
          <View style={styles.groupPillsRow}>
            <View style={styles.privatePill}>
              <Text style={styles.privatePillText}>{isPrivate ? 'Private group' : 'Public group'}</Text>
            </View>
            {tags.map((tag, idx) => (
              <View key={idx} style={styles.tagPill}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Content Input */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentPadding}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            placeholder="Create a post…"
            placeholderTextColor={colors.textSecondary}
            multiline
            value={content}
            onChangeText={setContent}
            style={styles.input}
            ref={inputRef}
          />

          {/* Media Preview */}
          {media.length > 0 && (
            <View style={styles.mediaPreview}>
              {media.map((uri, idx) => (
                <Image key={idx} source={{ uri }} style={styles.mediaImage} />
              ))}
            </View>
          )}

          {/* Action Sheet */}
          <View style={styles.actionSheet}>
            <Pressable style={styles.actionRow} onPress={pickImage}>
              <Ionicons name="images" size={20} color={colors.headerRed} />
              <Text style={styles.actionText}>Photo/Video</Text>
            </Pressable>
            <Pressable style={styles.actionRow} onPress={() => {}}>
              <Ionicons name="camera" size={20} color={colors.headerRed} />
              <Text style={styles.actionText}>Camera</Text>
            </Pressable>
            <Pressable style={styles.actionRow} onPress={() => {}}>
              <Ionicons name="person-add" size={20} color={colors.headerRed} />
              <Text style={styles.actionText}>Tag people</Text>
            </Pressable>
            <Pressable style={styles.actionRow} onPress={() => {}}>
              <Ionicons name="location" size={20} color={colors.headerRed} />
              <Text style={styles.actionText}>Check in</Text>
            </Pressable>
            <Pressable style={styles.actionRow} onPress={() => {}}>
              <Ionicons name="happy" size={20} color={colors.headerRed} />
              <Text style={styles.actionText}>Feeling/activity</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  postButton: {
    backgroundColor: colors.headerRed,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  postButtonDisabled: {
    opacity: 0.5,
  },
  postButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.cardBg,
  },
  groupInfo: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.cardBg,
  },
  groupName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  groupPillsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  privatePill: {
    backgroundColor: colors.screenBg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  privatePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tagPill: {
    backgroundColor: colors.headerRed,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.cardBg,
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  input: {
    fontSize: 16,
    minHeight: 120,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  mediaPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  mediaImage: {
    width: '48%',
    height: 150,
    borderRadius: radius.md,
  },
  actionSheet: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.cardShadow,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
