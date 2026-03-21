import * as ImagePicker from 'expo-image-picker';
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
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: source === 'camera',
      quality: 0.8,
    });

    if (result.canceled) {
      return { success: false, error: 'cancelled' };
    }

    const asset = result.assets[0];
    const uri = asset.uri;
    const ext = uri.split('.').pop() || (asset.type === 'video' ? 'mp4' : 'jpg');
    const path = `dm-media/${conversationId}/${Date.now()}.${ext}`;

    const file = {
      uri,
      name: asset.fileName || `dm-media.${ext}`,
      type: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    } as any;
    const formData = new FormData();
    formData.append('file', file);

    const { error: uploadError } = await supabase.storage
      .from('messages-media')
      .upload(path, formData as any, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('messages-media').getPublicUrl(path);
    const publicUrl = data?.publicUrl || uri;
    const type: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image';

    return { success: true, url: publicUrl, type };
  } catch (error: any) {
    console.error('Error uploading DM media:', error);
    return { success: false, error: error?.message || 'Failed to upload media' };
  }
}
