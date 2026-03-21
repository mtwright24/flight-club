import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../src/lib/supabaseClient';

export async function uploadAvatar(uri: string) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    console.error('uploadAvatar auth error', authError);
    throw authError;
  }
  if (!user) throw new Error('No user logged in');

  const userId = user.id;
  const fileUri = uri;

  // Read the picked image as base64, then convert to bytes for upload.
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: 'base64',
  });

  const fileExt = fileUri.split('.').pop() || 'jpg';
  const path = `${userId}/avatar.${fileExt}`;
  const contentType = `image/${fileExt}`;

  // Convert base64 string to Uint8Array for upload (same pattern used by social feed avatar helper)
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from('profile-avatars')
    .upload(path, bytes, { upsert: true, contentType });

  if (error) {
    console.error('uploadAvatar storage error', error);
    throw error;
  }

  const { data: publicUrlData } = supabase.storage
    .from('profile-avatars')
    .getPublicUrl(path);

  const publicURL = publicUrlData.publicUrl;
  return publicURL;
}

export async function uploadCover(uri: string) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    console.error('uploadCover auth error', authError);
    throw authError;
  }
  if (!user) throw new Error('No user logged in');

  const userId = user.id;
  const fileUri = uri;

  // Read the picked image as base64, then convert to bytes for upload.
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: 'base64',
  });

  const fileExt = fileUri.split('.').pop() || 'jpg';
  const path = `${userId}/cover.${fileExt}`;
  const contentType = `image/${fileExt}`;

  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from('profile-covers')
    .upload(path, bytes, { upsert: true, contentType });

  if (error) {
    console.error('uploadCover storage error', error);
    throw error;
  }

  const { data: publicUrlData } = supabase.storage
    .from('profile-covers')
    .getPublicUrl(path);

  const publicURL = publicUrlData.publicUrl;
  return publicURL;
}
