import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkUsernameAvailable, getMyProfile, updateProfile } from '../lib/profile';
import { uploadAvatar, uploadCover } from '../lib/storage';

const brandRed = '#B5161E';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getMyProfile>> | null>(null);
  const [avatar, setAvatar] = useState('');
  const [cover, setCover] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState(true);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [bio, setBio] = useState('');
  const [role, setRole] = useState('');
  const [airline, setAirline] = useState('');
  const [base, setBase] = useState('');
  const [fleet, setFleet] = useState('');
  const [avatarFile, setAvatarFile] = useState<ImagePickerAsset | null>(null);
  const [coverFile, setCoverFile] = useState<ImagePickerAsset | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await getMyProfile();
        setProfile(p);
        setAvatar(p.avatar_url || '');
        setCover(p.cover_url || '');
        // Prefer display_name if present, fall back to full_name
        setDisplayName((p.display_name as string) || p.full_name || '');
        setUsername(p.username || '');
        setBio(p.bio || '');
        setRole(p.role || '');
        setAirline(p.airline || '');
        setBase(p.base || '');
        setFleet(p.fleet || '');
      } catch (err) {
        console.error('EditProfile load error', err);
        Alert.alert('Error', 'Failed to load your profile.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Username uniqueness check
  useEffect(() => {
    if (!username || username === profile?.username) {
      setUsernameAvailable(true);
      return;
    }
    setUsernameChecking(true);
    const timeout = setTimeout(async () => {
      const available = await checkUsernameAvailable(username);
      setUsernameAvailable(available);
      setUsernameChecking(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [username]);

  const pickImage = async (type: 'avatar' | 'cover') => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.8 });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      if (type === 'avatar') {
        setAvatarFile(asset);
        setAvatar(asset.uri);
      } else {
        setCoverFile(asset);
        setCover(asset.uri);
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let avatarUrl = avatar;
      let coverUrl = cover;

      if (avatarFile) {
        try {
          avatarUrl = await uploadAvatar(avatarFile.uri);
        } catch (err) {
          console.error('Avatar upload failed', err);
          Alert.alert('Error', 'Failed to upload profile photo.');
          setSaving(false);
          return;
        }
      }

      if (coverFile) {
        try {
          coverUrl = await uploadCover(coverFile.uri);
        } catch (err) {
          console.error('Cover upload failed', err);
          Alert.alert('Error', 'Failed to upload cover photo.');
          setSaving(false);
          return;
        }
      }

      const success = await updateProfile({
        display_name: displayName,
        full_name: displayName,
        first_name: displayName, // keep first_name in sync for welcome copy
        username,
        bio,
        role,
        airline,
        base,
        fleet,
        avatar_url: avatarUrl,
        cover_url: coverUrl,
      });

      if (success) {
        Alert.alert('Profile updated!', 'Your changes have been saved.');
        router.back();
      } else {
        Alert.alert('Error', 'Could not update profile.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={brandRed} /></View>;

  const hasChanges =
    displayName !== (profile?.full_name || '') ||
    username !== (profile?.username || '') ||
    bio !== (profile?.bio || '') ||
    role !== (profile?.role || '') ||
    airline !== (profile?.airline || '') ||
    base !== (profile?.base || '') ||
    fleet !== (profile?.fleet || '') ||
    !!avatarFile ||
    !!coverFile;

  const canSave =
    !saving &&
    !!displayName &&
    !!username &&
    usernameAvailable &&
    hasChanges;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#fff' }}>
            <Pressable onPress={() => router.back()}><Text style={{ fontSize: 18, color: brandRed }}>{'<'}</Text></Pressable>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f172a' }}>Edit Profile</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* Cover photo */}
            <View style={{ alignItems: 'center', marginTop: 18 }}>
              {cover ? (
                <Image source={{ uri: cover }} style={{ width: '100%', height: 160, borderRadius: 16, backgroundColor: '#e5e7eb' }} />
              ) : (
                <View style={{ width: '100%', height: 160, borderRadius: 16, backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: '#64748b', fontWeight: '700' }}>No cover photo</Text>
                </View>
              )}
              <Pressable onPress={() => pickImage('cover')} style={{ position: 'absolute', top: 12, right: 20, backgroundColor: brandRed, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 32, shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 4, elevation: 2 }}>
                <Ionicons name="camera" size={26} color="#fff" />
              </Pressable>
            </View>
            {/* Avatar */}
            <View style={{ alignItems: 'center', marginTop: -48 }}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: '#fff', backgroundColor: '#e5e7eb' }} />
              ) : (
                <View style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: '#fff', backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: '#64748b', fontWeight: '700' }}>No photo</Text>
                </View>
              )}
              <Pressable onPress={() => pickImage('avatar')} style={{ position: 'absolute', top: 8, right: 8, backgroundColor: brandRed, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 32, shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 4, elevation: 2 }}>
                <Ionicons name="camera" size={26} color="#fff" />
              </Pressable>
            </View>
            {/* Fields */}
            <View style={{ marginTop: 24, paddingHorizontal: 18 }}>
              {/* Profile Identity */}
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>Display Name</Text>
              <TextInput value={displayName} onChangeText={setDisplayName} style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginBottom: 12 }} placeholder="Display name" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>Username/Handle</Text>
              <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: usernameAvailable ? '#E5E7EB' : brandRed, padding: 12, marginBottom: 4 }} placeholder="@handle" />
              {usernameChecking ? <Text style={{ color: '#64748b', marginBottom: 8 }}>Checking...</Text> : username && username !== profile?.username ? (
                usernameAvailable ? <Text style={{ color: brandRed, marginBottom: 8 }}>@{username} available</Text> : <Text style={{ color: brandRed, marginBottom: 8 }}>@{username} is taken</Text>
              ) : null}
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>Bio</Text>
              <TextInput value={bio} onChangeText={setBio} style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginBottom: 12, minHeight: 96, maxHeight: 160 }} multiline numberOfLines={6} placeholder="Tell us about yourself" />
              {/* Crew Identity */}
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>Role</Text>
              <TextInput value={role} onChangeText={setRole} style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginBottom: 12 }} placeholder="Role" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>Airline</Text>
              <TextInput value={airline} onChangeText={setAirline} style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginBottom: 12 }} placeholder="Airline" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>Base</Text>
              <TextInput value={base} onChangeText={setBase} style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginBottom: 12 }} placeholder="Base" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>Fleet (optional)</Text>
              <TextInput value={fleet} onChangeText={setFleet} style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginBottom: 12 }} placeholder="Fleet" />
              {/* About / Public Info */}
              {/* TODO: Add hometown/city, interests/tags fields if supported */}
              {/* Public Visibility Shortcuts */}
              {/* TODO: Add toggles for public visibility fields, wired to backend/store */}
            </View>
          </ScrollView>
          <View
            style={{
              paddingHorizontal: 18,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 12),
              backgroundColor: '#fff',
              borderTopWidth: 1,
              borderTopColor: '#E5E7EB',
              shadowColor: '#000',
              shadowOpacity: 0.06,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <Pressable onPress={handleSave} disabled={!canSave} style={{ backgroundColor: canSave ? brandRed : '#FECACA', paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
