import React, { useRef, useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Image, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, radius, shadow } from '../styles/theme';
import { useAuth } from '../hooks/useAuth';
import { createSocialFeedPost, uploadSocialFeedMedia } from '../lib/supabase/socialFeed';

interface CreateSocialPostScreenProps {
  onClose: () => void;
  onPosted: () => void;
  initialType?: 'text' | 'image' | 'video' | 'reel';
}

export default function CreateSocialPostScreen({ onClose, onPosted, initialType = 'text' }: CreateSocialPostScreenProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const inputRef = useRef<TextInput>(null);
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const canPost = useMemo(() => {
    return !!userId && (content.trim().length > 0 || media.length > 0);
  }, [content, media, userId]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
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

  // If the user chose image/video/reel from the feed, prompt them to pick media immediately
  useEffect(() => {
    if (initialType === 'image' || initialType === 'video' || initialType === 'reel') {
      pickImage();
    }
  }, [initialType]);

  const handlePost = async () => {
    if (!userId || !canPost) return;
    try {
      setUploading(true);
      let uploadedUrls: string[] = [];
      if (media.length > 0) {
        const uploads = await Promise.all(
          media.map(async (uri) => {
            const fileName = uri.split('/').pop() || `media-${Date.now()}`;
            const type = uri.endsWith('.mp4') || uri.endsWith('.mov') ? 'video/mp4' : 'image/jpeg';
            const result = await uploadSocialFeedMedia(userId, {
              uri,
              name: fileName,
              type,
            });
            if (result.success && result.url) return result.url;
            return null;
          })
        );
        uploadedUrls = uploads.filter(Boolean) as string[];
      }
      const res = await createSocialFeedPost(userId, content, uploadedUrls);
      setUploading(false);
      if (res.success) {
        setContent('');
        setMedia([]);
        onPosted();
      }
    } catch (e) {
      setUploading(false);
      // Optionally show error
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <Text style={styles.title}>Create Post</Text>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="What's on your mind?"
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={4}
          />
          <View style={styles.mediaRow}>
            {media.map((uri, idx) => (
              <Image key={idx} source={{ uri }} style={styles.media} />
            ))}
            <Pressable style={styles.addMedia} onPress={pickImage}>
              <Ionicons name="image" size={28} color={colors.headerRed} />
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable style={styles.postBtn} onPress={handlePost} disabled={!canPost || uploading}>
              <Text style={styles.postBtnText}>{uploading ? 'Posting...' : 'Post'}</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={onClose}>
              <Text style={{ color: colors.headerRed }}>Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#0F172A' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, minHeight: 80, color: '#0F172A', marginBottom: 12 },
  mediaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  media: { width: 80, height: 80, borderRadius: 8, marginRight: 8 },
  addMedia: { width: 80, height: 80, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  postBtn: { backgroundColor: colors.headerRed, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  postBtnText: { color: '#fff', fontWeight: '700' },
  cancel: { marginLeft: 16, marginTop: 8 },
});
