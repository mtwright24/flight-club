import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, Image, KeyboardAvoidingView, Platform } from 'react-native';
import Modal from 'react-native-modal';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../src/hooks/useAuth';
import { uploadSocialFeedMedia, createSocialFeedPost } from '../src/lib/supabase/socialFeed';
import { Ionicons } from '@expo/vector-icons';

type CreatePostSheetProps = {
  visible: boolean;
  onClose: () => void;
  onCreate: (args: { text: string; media: any; mode: string | null }) => Promise<void> | void;
};

export default function CreatePostSheet({ visible, onClose, onCreate }: CreatePostSheetProps) {
  const [mode, setMode] = useState<'text'|'photo'|'video'|'reel'|null>(null);
  const [text, setText] = useState('');
  const [media, setMedia] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickMedia = async (type: 'photo'|'video'|'reel') => {
    const mediaTypes: ('images' | 'videos')[] =
      type === 'video' || type === 'reel' ? ['videos'] : ['images'];
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes, quality: 0.8 });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setMedia(result.assets[0]);
      setMode(type);
    }
  };

  const { session } = useAuth();
  const userId = session?.user?.id;
  const handleCreate = async () => {
    setUploading(true);
    setError(null);
    try {
      let mediaUrls = null;
      if (media && userId) {
        const uploadRes = await uploadSocialFeedMedia(userId, { uri: media.uri, name: media.fileName || 'media', type: media.type });
        if (!uploadRes.success || !uploadRes.url) throw new Error(uploadRes.error || 'Upload failed');
        mediaUrls = [uploadRes.url];
      }
      if (!userId) throw new Error('Not logged in');
      const res = await createSocialFeedPost(userId, text, mediaUrls);
      if (!res.success) throw new Error(res.error || 'Failed to create post');
      setUploading(false);
      setText('');
      setMedia(null);
      setMode(null);
      onClose();
    } catch (e: any) {
      setUploading(false);
      setError(e?.message || 'Failed to create post.');
    }
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onSwipeComplete={onClose}
      swipeDirection={["down"]}
      style={{ justifyContent: 'flex-end', margin: 0 }}
      backdropOpacity={0.2}
      propagateSwipe
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View style={styles.sheet}>
            {error && <Text style={{ color: 'red', marginBottom: 8 }}>{error}</Text>}
            {!mode ? (
              <>
                <Text style={styles.title}>Create Post</Text>
                <View style={styles.row}>
                  <Pressable style={styles.option} onPress={() => setMode('text')}><Ionicons name="text" size={24} color="#B5161E" /><Text style={styles.optText}>Text</Text></Pressable>
                  <Pressable style={styles.option} onPress={() => pickMedia('photo')}><Ionicons name="image" size={24} color="#B5161E" /><Text style={styles.optText}>Photo</Text></Pressable>
                  <Pressable style={styles.option} onPress={() => pickMedia('video')}><Ionicons name="videocam" size={24} color="#B5161E" /><Text style={styles.optText}>Video</Text></Pressable>
                  <Pressable style={styles.option} onPress={() => pickMedia('reel')}><Ionicons name="film" size={24} color="#B5161E" /><Text style={styles.optText}>Reel</Text></Pressable>
                </View>
                <Pressable style={styles.cancel} onPress={onClose}><Text style={{ color: '#B5161E' }}>Cancel</Text></Pressable>
              </>
            ) : (
              <>
                <Text style={styles.title}>New {mode.charAt(0).toUpperCase() + mode.slice(1)}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="What's on your mind?"
                  value={text}
                  onChangeText={setText}
                  multiline
                  numberOfLines={4}
                />
                {media && <Image source={{ uri: media.uri }} style={styles.media} />}
                <View style={styles.row}>
                  <Pressable style={styles.postBtn} onPress={handleCreate} disabled={uploading}><Text style={styles.postBtnText}>{uploading ? 'Posting...' : 'Post'}</Text></Pressable>
                  <Pressable style={styles.cancel} onPress={onClose}><Text style={{ color: '#B5161E' }}>Cancel</Text></Pressable>
                </View>
              </>
            )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#0F172A' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  option: { alignItems: 'center', flex: 1 },
  optText: { marginTop: 6, color: '#0F172A' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, minHeight: 80, color: '#0F172A', marginBottom: 12 },
  media: { width: '100%', height: 180, borderRadius: 12, marginBottom: 12 },
  postBtn: { backgroundColor: '#B5161E', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  postBtnText: { color: '#fff', fontWeight: '700' },
  cancel: { marginLeft: 16, marginTop: 8 },
});
