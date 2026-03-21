import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabaseClient';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback } from 'react';

export interface AvatarUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Pick an image from library and upload to Supabase Storage
 */
export async function pickAndUploadAvatar(userId: string): Promise<AvatarUploadResult> {
  try {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return { success: false, error: 'Permission to access photos was denied' };
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, error: 'No image selected' };
    }

    const asset = result.assets[0];
    const fileUri = asset.uri;

    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: 'base64',
    });

    const fileExt = fileUri.split('.').pop() || 'jpg';
    const filePath = `${userId}/avatar.${fileExt}`;
    const contentType = `image/${fileExt}`;

    // Convert base64 string to Uint8Array for upload
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('profile-avatars')
      .upload(filePath, bytes, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error('Upload error:', error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('profile-avatars')
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;

    // Update profile with avatar URL
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    if (updateError) {
      console.error('Profile update error:', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true, url: publicUrl };
  } catch (err) {
    console.error('Avatar upload exception:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Remove avatar from storage and profile
 */
export async function removeAvatar(userId: string): Promise<AvatarUploadResult> {
  try {
    // Update profile to remove avatar_url
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', userId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Note: We don't delete from storage to avoid issues if URL is still cached
    // The upsert will overwrite on next upload

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
