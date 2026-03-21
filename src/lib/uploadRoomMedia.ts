import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabaseClient';

export async function uploadRoomAvatar(roomId: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) {
      return { success: false, error: 'Upload cancelled' };
    }

    const asset = result.assets[0];
    const uri = asset.uri;
    const ext = uri.split('.').pop() || 'jpg';
    const path = `room-media/${roomId}/avatar-${Date.now()}.${ext}`;

    // Use FormData upload pattern (matches social feed implementation)
    const file = {
      uri,
      name: asset.fileName || `avatar.${ext}`,
      type: asset.mimeType || 'image/jpeg',
    } as any;
    const formData = new FormData();
    formData.append('file', file);

    const { error: uploadError } = await supabase.storage
      .from('post-media')
      .upload(path, formData as any, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data } = supabase.storage.from('post-media').getPublicUrl(path);
    const publicUrl = data?.publicUrl;
    const finalUrl = publicUrl || uri; // fall back to local URI for immediate display

    // Update rooms table (optional, schema may not have avatar_url yet)
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ avatar_url: publicUrl })
      .eq('id', roomId);

    if (updateError) {
      // If the column doesn't exist yet, still treat upload as success
      const code = (updateError as any).code;
      if (code === 'PGRST204') {
        console.warn("rooms.avatar_url column missing; skipping DB update");
        return { success: true, url: finalUrl };
      }
      throw updateError;
    }

    return { success: true, url: finalUrl };
  } catch (error) {
    console.error('Error uploading room avatar:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload avatar',
    };
  }
}

export async function uploadRoomCover(roomId: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      // Match a wide, banner-like crop closer to the header
      aspect: [3, 1],
      quality: 0.8,
    });

    if (result.canceled) {
      return { success: false, error: 'Upload cancelled' };
    }

    const asset = result.assets[0];
    const uri = asset.uri;
    const ext = uri.split('.').pop() || 'jpg';
    const path = `room-media/${roomId}/cover-${Date.now()}.${ext}`;

    const file = {
      uri,
      name: asset.fileName || `cover.${ext}`,
      type: asset.mimeType || 'image/jpeg',
    } as any;
    const formData = new FormData();
    formData.append('file', file);

    const { error: uploadError } = await supabase.storage
      .from('post-media')
      .upload(path, formData as any, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data } = supabase.storage.from('post-media').getPublicUrl(path);
    const publicUrl = data?.publicUrl;
    const finalUrl = publicUrl || uri;

    // Update rooms table (optional, schema may not have cover_url yet)
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ cover_url: publicUrl })
      .eq('id', roomId);

    if (updateError) {
      const code = (updateError as any).code;
      if (code === 'PGRST204') {
        console.warn("rooms.cover_url column missing; skipping DB update");
        return { success: true, url: finalUrl };
      }
      throw updateError;
    }

    return { success: true, url: finalUrl };
  } catch (error) {
    console.error('Error uploading room cover:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload cover',
    };
  }
}

export async function removeRoomAvatar(roomId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('rooms')
      .update({ avatar_url: null })
      .eq('id', roomId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error removing room avatar:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove avatar',
    };
  }
}

export async function removeRoomCover(roomId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('rooms')
      .update({ cover_url: null })
      .eq('id', roomId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error removing room cover:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove cover',
    };
  }
}
