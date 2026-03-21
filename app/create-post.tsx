import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Image, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../src/components/FlightClubHeader';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { colors } from '../src/theme/colors';
import { createPost } from '../lib/feed';


export default function CreatePostScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<string>('image/jpeg');
  const [mediaMode, setMediaMode] = useState<'photo' | 'video' | 'reel' | null>(null);
  const [uploading, setUploading] = useState(false);


  async function pickMedia(type: 'photo' | 'video' | 'reel') {
    const pickerMediaType: 'images' | 'videos' =
      type === 'video' || type === 'reel' ? 'videos' : 'images';
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [pickerMediaType],
      quality: 0.7,
    });
    console.log('[PICKER RESULT]', res);
    Alert.alert('Picker Result', JSON.stringify(res));
    if ((res as any).canceled) return;
    const asset = (res as any).assets?.[0];
    console.log('[PICKER ASSET]', asset);
    Alert.alert('Picker Asset', JSON.stringify(asset));
    if (!asset?.uri) return;
    setMediaUri(asset.uri);
    setMediaType(asset.type || (type === 'photo' ? 'image/jpeg' : 'video/mp4'));
    setMediaMode(type);
  }

  async function uploadAndCreate() {
    if (!text.trim() && !mediaUri) {
      Alert.alert('Please enter text or select media');
      return;
    }
    setUploading(true);
    try {
      let media = null;
      if (mediaUri) {
        media = { uri: mediaUri, type: mediaType, fileName: `media.${mediaType.startsWith('video') ? 'mp4' : 'jpg'}` };
      }
      await createPost({ text, media, mode: mediaMode || (mediaType.startsWith('video') ? 'video' : 'photo') });
      router.back();
    } catch (err) {
      console.log('create post err', err);
      Alert.alert('Error creating post');
    } finally {
      setUploading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.BG }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={{ flex: 1 }}>
        <FlightClubHeader title="Create Post" />
        <ScrollView 
          contentContainerStyle={styles.container}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Text</Text>
          <TextInput value={text} onChangeText={setText} placeholder="Write something..." placeholderTextColor={colors.PLACEHOLDER} style={[styles.input, { height: 120 }]} multiline />

          <Text style={styles.label}>Add Media</Text>
          <View style={{ flexDirection: 'row', marginBottom: 12 }}>
            <Pressable style={[styles.mediaBtn, mediaMode === 'photo' && styles.mediaBtnActive]} onPress={() => pickMedia('photo')}>
              <Text style={styles.mediaBtnText}>Photo</Text>
            </Pressable>
            <Pressable style={[styles.mediaBtn, mediaMode === 'video' && styles.mediaBtnActive]} onPress={() => pickMedia('video')}>
              <Text style={styles.mediaBtnText}>Video</Text>
            </Pressable>
            <Pressable style={[styles.mediaBtn, mediaMode === 'reel' && styles.mediaBtnActive]} onPress={() => pickMedia('reel')}>
              <Text style={styles.mediaBtnText}>Reel</Text>
            </Pressable>
          </View>
          {mediaUri ? <Image source={{ uri: mediaUri }} style={{ height: 200, borderRadius: 8, marginBottom: 8 }} /> : null}
          {/* Debug: show image uri and type */}
          {mediaUri ? <Text style={{ color: 'gray', fontSize: 12, marginBottom: 4 }}>Media: {mediaUri} ({mediaType})</Text> : null}

          {/* Debug: show mediaUri and mediaType always */}
          <Text style={{ color: 'gray', fontSize: 12, marginBottom: 4 }}>
            Media: {mediaUri ? `${mediaUri} (${mediaType})` : 'none'}
          </Text>
          <Pressable
            style={[styles.primaryBtn, uploading ? { opacity: 0.55 } : {}, { marginTop: 20 }]}
            onPress={uploadAndCreate}
            disabled={uploading || (!text.trim() && !mediaUri)}
          >
            <Text style={styles.primaryBtnText}>{uploading ? 'Posting...' : 'Post'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  label: { color: colors.MUTED, marginTop: 12, marginBottom: 6 },
  emptyText: { color: colors.TEXT },
  option: { padding: 12, borderRadius: 10, backgroundColor: colors.CARD, marginBottom: 8, borderWidth: 1, borderColor: colors.BORDER },
  optionActive: { borderWidth: 2, borderColor: colors.NAVY },
  optionText: { color: colors.TEXT, fontWeight: '600' },
  input: { backgroundColor: colors.CARD, color: colors.TEXT, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.BORDER },
  primaryBtn: { height: 56, borderRadius: 28, backgroundColor: colors.NAVY, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width:0, height:6 }, elevation: 5 },
  primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  mediaBtn: { flex: 1, marginRight: 8, padding: 12, borderRadius: 8, backgroundColor: colors.CARD, alignItems: 'center', borderWidth: 1, borderColor: colors.BORDER },
  mediaBtnActive: { backgroundColor: colors.NAVY, borderColor: colors.NAVY },
  mediaBtnText: { color: colors.TEXT, fontWeight: '600' },
});
