import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabaseClient';

export type LocalPhotoAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export async function pickHousingPhotos(max: number): Promise<LocalPhotoAsset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'] as any,
    allowsMultipleSelection: true,
    quality: 0.8,
  });

  if (result.canceled || !result.assets) return [];
  return result.assets.slice(0, max).map((asset) => ({
    uri: asset.uri,
    fileName: (asset as any).fileName ?? null,
    mimeType: asset.mimeType ?? 'image/jpeg',
  }));
}

export async function takeHousingPhoto(): Promise<LocalPhotoAsset | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'] as any,
    quality: 0.8,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    fileName: (asset as any).fileName ?? null,
    mimeType: asset.mimeType ?? 'image/jpeg',
  };
}

export async function uploadHousingPhoto(listingId: string, asset: LocalPhotoAsset, index: number): Promise<string | null> {
  try {
    const uri = asset.uri;
    const ext = uri.split('.').pop() || 'jpg';
    const path = `housing-listings/${listingId}/photo-${Date.now()}-${index}.${ext}`;

    const contentType = asset.mimeType || 'image/jpeg';
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    const binaryString = globalThis.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const { error: uploadError } = await supabase.storage
      .from('post-media')
      .upload(path, bytes, { contentType, upsert: false });

    if (uploadError) {
      console.log('uploadHousingPhoto error', uploadError);
      return null;
    }

    const { data } = supabase.storage.from('post-media').getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch (err) {
    console.log('uploadHousingPhoto exception', err);
    return null;
  }
}
