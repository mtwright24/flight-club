import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabaseClient';

type Source = 'library' | 'camera';

export async function pickAndUploadMessageMedia(
  conversationId: string,
  source: Source = 'library'
): Promise<{ success: boolean; url?: string; type?: 'image' | 'video'; error?: string }> {
  try {
    const pickerFn =
      source === 'camera'
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;

    const result = await pickerFn({
      // Avoid deprecated Expo ImagePicker.MediaTypeOptions usage.
      // We only support sending images and videos in DMs.
      mediaTypes: ['images', 'videos'] as any,
      allowsEditing: source === 'camera',
      quality: 0.8,
    });

    if (result.canceled) {
      return { success: false, error: 'cancelled' };
    }

    const asset = result.assets[0];
    const uri = asset.uri;
    const ext = uri.split('.').pop()?.split('?')[0] || (asset.type === 'video' ? 'mp4' : 'jpg');
    const path = `dm-media/${conversationId}/${Date.now()}.${ext}`;
    const contentType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');

    // React Native: fetch(file://…) is unreliable for picker URIs; match avatar upload (base64 → bytes).
    let bytes: Uint8Array;
    if (asset.type === 'video') {
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error('Could not read the selected media file.');
      }
      bytes = new Uint8Array(await response.arrayBuffer());
    } else {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const binaryString = globalThis.atob(base64);
      bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
    }

    const { error: uploadError } = await supabase.storage
      .from('messages-media')
      .upload(path, bytes, { contentType, upsert: false });

    if (uploadError) throw uploadError;

    const bucket = supabase.storage.from('messages-media');
    const { data: pub } = bucket.getPublicUrl(path);

    // Private buckets: prefer a time-limited signed URL so <Image> can load; public buckets still work via getPublicUrl.
    const sevenDaysSec = 60 * 60 * 24 * 7;
    const { data: signed, error: signErr } = await bucket.createSignedUrl(path, sevenDaysSec);
    // Bucket is public in migrations: prefer stable public URL so stored `media_url` does not expire.
    const displayUrl = pub?.publicUrl || (!signErr && signed?.signedUrl ? signed.signedUrl : uri);
    const type: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image';

    return { success: true, url: displayUrl, type };
  } catch (error: any) {
    console.error('Error uploading DM media:', error);
    return { success: false, error: error?.message || 'Failed to upload media' };
  }
}
