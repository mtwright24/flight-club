
import React from 'react';
import { Image, ImageBackground, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type ProfileHeaderSectionProps = {
  user: {
    name: string;
    subtitle: string;
    avatar: string;
    cover: string;
    bio?: string;
  };
  stats: { followers: number; following: number; posts: number };
  isSelf: boolean;
  followingStatus: boolean;
  followRequestPending?: boolean;
  profileIsPrivate?: boolean;
  onFollow: () => void;
  onMessage: () => void;
  /** When set, avatar is tappable (e.g. self → edit profile). Omit to avoid a dead-press affordance. */
  onPressAvatar?: () => void;
  router?: any;
};

export default function ProfileHeaderSection({
  user,
  stats,
  isSelf,
  followingStatus,
  followRequestPending,
  profileIsPrivate,
  onFollow,
  onMessage,
  onPressAvatar,
  router,
}: ProfileHeaderSectionProps) {
  return (
    <View>
      <ImageBackground
        source={{ uri: user.cover }}
        style={{ width: '100%', height: 180, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
        resizeMode="cover"
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(181,22,30,0.18)' }]} />
      </ImageBackground>
      <View style={{ alignItems: 'center', marginTop: -48 }}>
        <View style={{ width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 }}>
          <View style={{ position: 'absolute', width: 112, height: 112, borderRadius: 56, borderWidth: 4, borderColor: '#B5161E', top: -4, left: -4 }} />
          {onPressAvatar ? (
            <Pressable
              onPress={onPressAvatar}
              accessibilityRole="button"
              accessibilityLabel="Edit profile photo"
              style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}
            >
              <Image source={{ uri: user.avatar }} style={{ width: 96, height: 96, borderRadius: 48 }} />
            </Pressable>
          ) : (
            <View style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              <Image source={{ uri: user.avatar }} style={{ width: 96, height: 96, borderRadius: 48 }} />
            </View>
          )}
        </View>
      </View>
      <View style={{ alignItems: 'center', marginTop: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a', textAlign: 'center' }}>{user.name}</Text>
        <Text style={{ fontSize: 14, color: '#64748b', marginTop: 2, textAlign: 'center' }}>{user.subtitle}</Text>
        {user.bio ? (
          <Text
            numberOfLines={2}
            ellipsizeMode="tail"
            style={{
              fontSize: 13,
              color: '#64748b',
              textAlign: 'center',
              marginTop: 8,
              marginBottom: 12,
              marginHorizontal: 32,
              lineHeight: 18,
            }}
          >
            {user.bio}
          </Text>
        ) : null}
      </View>
      {/* Stats row with vertical dividers */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 0 }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>{stats.followers}</Text>
          <Text style={{ fontSize: 11, color: '#64748b' }}>Followers</Text>
        </View>
        <View style={{ width: 1, height: 32, backgroundColor: '#E5E7EB', opacity: 0.7, marginHorizontal: 8 }} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>{stats.following}</Text>
          <Text style={{ fontSize: 11, color: '#64748b' }}>Following</Text>
        </View>
        <View style={{ width: 1, height: 32, backgroundColor: '#E5E7EB', opacity: 0.7, marginHorizontal: 8 }} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>{stats.posts}</Text>
          <Text style={{ fontSize: 11, color: '#64748b' }}>Posts</Text>
        </View>
      </View>
      {/* Divider under stats row */}
      <View style={{ height: 1, backgroundColor: '#E5E7EB', marginHorizontal: 18, marginBottom: 0 }} />
      {/* Actions row for self profile: Edit Profile and Messages */}
      {isSelf && (
        <View>
          <View style={{ flexDirection: 'row', marginHorizontal: 18, marginTop: 24 }}>
            <Pressable
              style={{ flex: 1, backgroundColor: '#B5161E', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginRight: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 2 }}
              onPress={() => {
                if (router) router.push('/edit-profile');
              }}
            >
              <Text style={{ fontWeight: '800', color: '#fff' }}>Edit Profile</Text>
            </Pressable>
            <Pressable
              style={{ flex: 1, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#CBD5F5', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginRight: 0, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 2 }}
              onPress={() => {
                if (router) router.push('/messages-inbox');
              }}
            >
              <Text style={{ fontWeight: '800', color: '#334155' }}>Messages</Text>
            </Pressable>
          </View>
          {/* Divider under actions row */}
          <View style={{ height: 1, backgroundColor: '#E5E7EB', marginHorizontal: 18 }} />
        </View>
      )}
      {/* Primary actions row for other user profile only */}
      {!isSelf && (
        <View>
          <View style={{ flexDirection: 'row', marginHorizontal: 18, marginTop: 24 }}>
            <TouchableOpacity
              style={[
                { flex: 1, backgroundColor: followingStatus ? '#F3F4F6' : '#B5161E', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginRight: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 2 },
                followingStatus ? { borderWidth: 1, borderColor: '#CBD5F5' } : null,
              ]}
              onPress={onFollow}
            >
              <Text style={[{ fontWeight: '800' }, followingStatus ? { color: '#334155' } : { color: '#fff' }]}>{
                followRequestPending && profileIsPrivate
                  ? 'Requested'
                  : followingStatus
                  ? 'Following'
                  : 'Follow'
              }</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#CBD5F5', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginRight: 0, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 2 }}
              onPress={onMessage}
            >
              <Text style={{ fontWeight: '800', color: '#334155' }}>Message</Text>
            </TouchableOpacity>
          </View>
          {/* Show follow request message for private profiles */}
          {followRequestPending && profileIsPrivate && (
            <View style={{ marginTop: 12, marginHorizontal: 18, padding: 10, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FCA5A5' }}>
              <Text style={{ color: '#B91C1C', fontWeight: '600', textAlign: 'center' }}>
                Follow request submitted for approval.
              </Text>
            </View>
          )}
          {/* Divider under actions row */}
          <View style={{ height: 1, backgroundColor: '#E5E7EB', marginHorizontal: 18 }} />
        </View>
      )}
    </View>
  );
}
