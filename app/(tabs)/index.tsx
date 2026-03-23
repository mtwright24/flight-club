import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Dimensions, Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SHADOW, SPACING } from '../../src/styles/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

import { getCurrentUserProfile } from '../../lib/home';
import { useAuth } from '../../src/hooks/useAuth';

const tiles = [
  {
    label: 'Crew Schedule\nExchange',
    icon: require('../../assets/images/auth/brand/icon-crew-exchange.png'),
  },
  {
    label: 'Non-Rev/\nStaff Loads',
    icon: require('../../assets/images/auth/brand/icon-nonrev-loads.png'),
  },
  {
    label: 'Crashpads/\nHousing',
    icon: require('../../assets/images/auth/brand/icon-crashpads-housing.png'),
  },
  {
    label: 'Utility\nHub',
    icon: require('../../assets/images/auth/brand/icon-utility-hub.png'),
  },
];

export default function DashboardHome() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id;
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getCurrentUserProfile>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Debug: log session and profile
  useEffect(() => {
    console.log('session.user.user_metadata:', session?.user?.user_metadata);
    console.log('profile:', profile);
  }, [session, profile]);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getCurrentUserProfile(userId)
      .then((data) => setProfile(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.welcome}>
          {authLoading || loading ? (
            <>
              <Text style={styles.welcomeTitle}>Welcome...</Text>
              <Text style={styles.welcomeMeta}></Text>
            </>
          ) : error || !profile ? (
            <>
              <Text style={styles.welcomeTitle}>Welcome!</Text>
              <Text style={styles.welcomeMeta}></Text>
            </>
          ) : (
            <>
              <Text style={styles.welcomeTitle}>
                Welcome {
                  (session?.user?.user_metadata?.display_name)
                  || profile.first_name
                  || profile.full_name
                  || userId
                  || ''
                }!
              </Text>
              <Text style={styles.welcomeMeta}>Base: {profile.base || '—'} | Fleet: {profile.fleet || '—'}</Text>
            </>
          )}
        </View>

        <View style={styles.quickAccessBlock}>
          <Text style={styles.quickAccessLabel}>QUICK ACCESS</Text>
        </View>
        <View style={styles.grid}>
          {tiles.map(({ label, icon }) => (
            <Pressable
              key={label}
              style={[styles.tile, SHADOW.card]}
              onPress={() => {
                if (label.includes('Schedule')) router.push('/crew-exchange');
                else if (label.includes('Non-Rev')) router.push('/loads');
                else if (label.includes('Crashpads')) router.push('/(screens)/crashpads');
                else if (label.includes('Utility') || label.includes('Hub'))
                  router.push('/(screens)/utility');
              }}
            >
              <Image source={icon} style={styles.tileIcon} resizeMode="contain" />
              <Text style={styles.tileLabel} numberOfLines={2}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Section title="ACTIVITY" rightAction="View All >" onRightActionPress={() => router.push('/notifications')} />
        <Section title="TRENDING POSTS" />
        <Section title="TRENDING CHAT ROOMS" />
        <Section title="MONTHLY AWARDS" />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  rightAction,
  onRightActionPress,
}: {
  title: string;
  rightAction?: string;
  onRightActionPress?: () => void;
}) {
  if (title === 'ACTIVITY') {
    return (
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {rightAction ? (
            onRightActionPress ? (
              <Pressable onPress={onRightActionPress} accessibilityRole="button" accessibilityLabel="View all activity">
                <Text style={styles.sectionAction}>{rightAction}</Text>
              </Pressable>
            ) : (
              <Text style={styles.sectionAction}>{rightAction}</Text>
            )
          ) : null}
        </View>
        <ActivityModule />
      </View>
    );
  }
  if (title === 'TRENDING POSTS') {
    return (
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <TrendingPostsRow />
      </View>
    );
  }
  if (title === 'TRENDING CHAT ROOMS') {
    return (
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <TrendingChatRoomsRow />
      </View>
    );
  }
  if (title === 'MONTHLY AWARDS') {
    return (
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <MonthlyAwardsRow />
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {rightAction ? <Text style={styles.sectionAction}>{rightAction}</Text> : null}
      </View>
      <View style={[styles.placeholder, SHADOW.soft]} />
    </View>
  );
}

function TrendingPostsRow() {
  const router = useRouter();
  const TREND_BIG_W = 290;
  const TREND_LIVE_W = 190;
  const TREND_CARD_H = 175;
  const TREND_GAP = 12;
  const TREND_SIDE_PAD = 16;
  const trendingPosts = [
    {
      id: 'post-1',
      authorName: 'StandbySteve',
      timeAgo: '15m ago',
      text: '4+ hour maintenance delay out of Houston. Fun times! 🤣',
      reactionsCount: 185,
      authorAvatar: 'https://i.pravatar.cc/100?img=8',
    },
    {
      id: 'post-2',
      authorName: 'GateRunner',
      timeAgo: '32m ago',
      text: 'Anyone commuting into ORD tonight? Looking for crashpad options.',
      reactionsCount: 92,
      authorAvatar: 'https://i.pravatar.cc/100?img=9',
    },
    {
      id: 'post-3',
      authorName: 'SkyMilesMike',
      timeAgo: '1h ago',
      text: 'Crew room coffee is finally decent. Small wins.',
      reactionsCount: 61,
      authorAvatar: 'https://i.pravatar.cc/100?img=10',
    },
    {
      id: 'post-4',
      authorName: 'A320Amy',
      timeAgo: '2h ago',
      text: 'Swap accepted! Thanks everyone.',
      reactionsCount: 44,
      authorAvatar: 'https://i.pravatar.cc/100?img=11',
    },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingLeft: TREND_SIDE_PAD,
        paddingRight: TREND_SIDE_PAD,
        gap: TREND_GAP,
      }}
    >
      {trendingPosts.map((post, index) => (
        <Pressable
          key={post.id}
          style={[
            styles.trendingCard,
            SHADOW.soft,
            { width: TREND_BIG_W, height: TREND_CARD_H },
          ]}
          onPress={() => router.push(`/post/${post.id}`)}
        >
          <View style={styles.trendingTopRow}>
            <View style={styles.trendingAvatarWrap}>
              <Image source={{ uri: post.authorAvatar }} style={styles.trendingAvatar} />
            </View>
            <View style={styles.trendingAuthorBlock}>
              <Text style={styles.trendingAuthor}>{post.authorName}</Text>
              <Text style={styles.trendingTime}>{post.timeAgo}</Text>
            </View>
            <View style={styles.trendingReaction}>
              <Text style={styles.trendingReactionText}>🔥 {post.reactionsCount}</Text>
            </View>
          </View>
          <View style={styles.trendingBody}>
            <Text style={styles.trendingText} numberOfLines={3} ellipsizeMode="tail">
              {post.text}
            </Text>
          </View>
        </Pressable>
      ))}

      <Pressable
        style={[
          styles.trendingCard,
          styles.trendingCardSmall,
          SHADOW.soft,
          { width: TREND_LIVE_W, height: TREND_CARD_H },
        ]}
        onPress={() => router.push('/(tabs)/crew-rooms')}
      >
        <View style={styles.liveTopRow}>
          <Text style={styles.liveTitle}>Live Chat</Text>
          <View style={styles.liveAvatars}>
            {['https://i.pravatar.cc/100?img=12', 'https://i.pravatar.cc/100?img=13', 'https://i.pravatar.cc/100?img=14'].map(
              (uri, idx) => (
                <View key={uri} style={[styles.liveAvatarWrap, { marginLeft: idx === 0 ? 0 : -10 }]}>
                  <Image source={{ uri }} style={styles.liveAvatar} />
                </View>
              )
            )}
          </View>
        </View>
        <View>
          <Text style={styles.liveStatus}>Live • 486 chatting</Text>
          <Text style={styles.liveChannel}>ORD FAs – ATL</Text>
        </View>
        <Text style={styles.liveCta}>Jump In {'>'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function TrendingChatRoomsRow() {
  const router = useRouter();
  const CHAT_CARD_W = 260;
  const CHAT_CARD_H = 150;
  const GAP = 12;
  const SIDE_PAD = 16;
  const rooms = [
    {
      id: 'room-1',
      name: 'ORD Commuters',
      status: 'Live',
      tags: 'Live 🔥 ✈️',
      lastMessage: 'Anything tricky traveling to Express now?',
      lastSender: 'LayoverQueen',
      timeAgo: '5m ago',
      avatars: [
        'https://i.pravatar.cc/100?img=15',
        'https://i.pravatar.cc/100?img=16',
        'https://i.pravatar.cc/100?img=17',
      ],
      liveCount: 486,
    },
    {
      id: 'room-2',
      name: 'JFK Pilots',
      status: 'Live',
      tags: 'Live ✈️',
      lastMessage: 'Swap accepted for tomorrow morning.',
      lastSender: 'GateRunner',
      timeAgo: '12m ago',
      avatars: [
        'https://i.pravatar.cc/100?img=18',
        'https://i.pravatar.cc/100?img=19',
        'https://i.pravatar.cc/100?img=20',
      ],
    },
    {
      id: 'room-3',
      name: 'Crashpad Finds',
      status: 'Live',
      tags: 'Live 🔥',
      lastMessage: 'Any openings near DCA next month?',
      lastSender: 'SkyMilesMike',
      timeAgo: '28m ago',
      avatars: [
        'https://i.pravatar.cc/100?img=21',
        'https://i.pravatar.cc/100?img=22',
        'https://i.pravatar.cc/100?img=23',
      ],
    },
    {
      id: 'room-4',
      name: 'A320 Crew',
      status: 'Live',
      tags: 'Live ✈️',
      lastMessage: 'Anyone on reserve this weekend?',
      lastSender: 'StandbySteve',
      timeAgo: '1h ago',
      avatars: [
        'https://i.pravatar.cc/100?img=24',
        'https://i.pravatar.cc/100?img=25',
        'https://i.pravatar.cc/100?img=26',
      ],
    },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingLeft: SIDE_PAD, paddingRight: SIDE_PAD, gap: GAP }}
    >
      {rooms.map((room) => (
        <Pressable
          key={room.id}
          style={[styles.chatCard, SHADOW.soft, { width: CHAT_CARD_W, height: CHAT_CARD_H }]}
          onPress={() =>
            router.push({ pathname: '/(tabs)/crew-rooms/room-home', params: { roomId: room.id } })
          }
        >
          <View style={styles.chatTopRow}>
            <Text style={styles.chatTitle} numberOfLines={1} ellipsizeMode="tail">
              {room.name}
            </Text>
            <View style={styles.chatLiveChip}>
              <Text style={styles.chatLiveText}>Live</Text>
            </View>
          </View>
          <Text style={styles.chatSubline} numberOfLines={1} ellipsizeMode="tail">
            {room.tags}{room.liveCount ? ` • ${room.liveCount} chatting` : ''}
          </Text>
          <Text style={styles.chatMessage} numberOfLines={2} ellipsizeMode="tail">
            {room.lastSender}: {room.lastMessage}
          </Text>
          <View style={styles.chatBottomRow}>
            <View style={styles.chatAvatars}>
              {room.avatars.map((uri, idx) => (
                <View key={uri} style={[styles.chatAvatarWrap, { marginLeft: idx === 0 ? 0 : -10 }]}>
                  <Image source={{ uri }} style={styles.chatAvatar} />
                </View>
              ))}
            </View>
            <Text style={styles.chatTime}>{room.timeAgo}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function MonthlyAwardsRow() {
  const router = useRouter();
  
  const awards = [
    {
      id: 'award-1',
      title: 'Top Contributor',
      subtitle: 'Delta F/A',
      skin: require('../../assets/images/brand/award-gold.png'),
      textColor: '#C9A23A',
      user: {
        id: 'claire-001',
        name: 'Claire',
        airlineRole: 'Delta F/A',
        avatarUri: 'https://i.pravatar.cc/100?img=31',
      },
    },
    {
      id: 'award-2',
      title: 'Member of the Week',
      subtitle: 'Spirit F/A',
      skin: require('../../assets/images/brand/award-purple.png'),
      textColor: '#6F4BC6',
      user: {
        id: 'steve-002',
        name: 'Steve',
        airlineRole: 'Spirit F/A',
        avatarUri: 'https://i.pravatar.cc/100?img=32',
      },
    },
    {
      id: 'award-3',
      title: 'Base MVP',
      subtitle: 'United F/A',
      skin: require('../../assets/images/brand/award-blue.png'),
      textColor: '#4A87E8',
      user: {
        id: 'sarah-003',
        name: 'Sarah',
        airlineRole: 'United F/A',
        avatarUri: 'https://i.pravatar.cc/100?img=33',
      },
    },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.awardScrollContent}
      snapToInterval={206}
      decelerationRate="fast"
    >
      {awards.map((award) => (
        <React.Fragment key={award.id}>
          <AwardCard award={award} router={router} />
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

function AwardCard({ award, router }: { award: any; router: any }) {
  return (
    <Pressable
      style={styles.awardCard}
      onPress={() => router.push(`/profile/${award.user.id}`)}
    >
      <ImageBackground
        source={award.skin}
        style={styles.awardBackground}
        resizeMode="cover"
        imageStyle={styles.awardBackgroundImage}
      >
        <View style={styles.awardContent}>
          <Pressable
            style={styles.awardAvatarAbsolute}
            onPress={(e: any) => {
              if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
              router.push(`/profile/${award.user.id}`);
            }}
          >
            <Image
              source={{ uri: award.user.avatarUri }}
              style={styles.awardAvatarImage}
              resizeMode="cover"
            />
          </Pressable>

          <View style={styles.awardBottomSection}>
            <Text style={[styles.awardUserName, { color: award.textColor }]}>{award.user.name}</Text>
            <Text style={[styles.awardUserRole, { color: award.textColor }]}>{award.user.airlineRole}</Text>
          </View>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

function ActivityModule() {
  const router = useRouter();
  const items = [
    {
      icon: require('../../assets/images/brand/activity-reply.png'),
      text: 'Sophia replied to your post',
    },
    {
      icon: require('../../assets/images/brand/activity-swap-accepted.png'),
      text: 'Swap accepted!',
      meta: '+22',
    },
    {
      icon: require('../../assets/images/brand/activity-crashpad-reply.png'),
      text: 'Crashpad reply: CRA Reserve',
    },
    {
      icon: require('../../assets/images/brand/activity-ord-fas-chat.png'),
      text: 'ORD FAs Chat: 3 new messages',
    },
  ];
  const avatars = [
    'https://i.pravatar.cc/100?img=1',
    'https://i.pravatar.cc/100?img=2',
    'https://i.pravatar.cc/100?img=3',
    'https://i.pravatar.cc/100?img=4',
    'https://i.pravatar.cc/100?img=5',
  ];

  return (
    <View style={styles.activityWrap}>
      <View style={styles.activityTopRow}>
        <Pressable
          style={styles.avatarStack}
          onPress={() => router.push('/notifications')}
        >
          {avatars.map((uri, index) => (
            <View key={uri} style={[styles.avatar, { marginLeft: index === 0 ? 0 : -12 }]}>
              <Image source={{ uri }} style={styles.avatarImg} />
            </View>
          ))}
        </Pressable>
        <Pressable
          style={styles.ctaButton}
          onPress={() => router.push('/notifications')}
        >
          <ImageBackground
            source={require('../../assets/images/brand/activity-btn-pill.png')}
            style={styles.ctaButtonBg}
            imageStyle={styles.ctaButtonImg}
            resizeMode="stretch"
          >
            <Text style={styles.ctaButtonText}>+28</Text>
          </ImageBackground>
        </Pressable>
      </View>

      <View style={styles.activityGrid}>
        {items.map((item, index) => (
          <Pressable
            key={item.text}
            style={[styles.activityPill, SHADOW.soft]}
            onPress={() => router.push('/notifications')}
          >
            <Image source={item.icon} style={styles.activityBadge} resizeMode="contain" />
            <Text style={styles.activityText} numberOfLines={2} ellipsizeMode="tail">
              {item.text}
            </Text>
            {item.meta ? <Text style={styles.activityMeta}>{item.meta}</Text> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    backgroundColor: COLORS.red,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    height: 34,
    width: 180,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.redDark,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  scroll: {
    backgroundColor: COLORS.bg,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  welcome: {
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  welcomeTitle: {
    color: COLORS.navy,
    fontSize: 26,
    fontWeight: '700',
  },
  welcomeMeta: {
    color: COLORS.text2,
    marginTop: 4,
    fontSize: 14,
  },
  quickAccessBlock: {
    marginBottom: SPACING.sm,
  },
  quickAccessLabel: {
    color: COLORS.red,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    columnGap: SPACING.sm,
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  tile: {
    width: '23%',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 6,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    textAlign: 'center',
    color: COLORS.navySoft,
    fontWeight: '600',
    fontSize: 8,
    lineHeight: 10,
  },
  tileIcon: {
    width: 60,
    height: 60,
    marginBottom: 4,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    color: COLORS.red,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.4,
  },
  sectionAction: {
    color: COLORS.text2,
    fontWeight: '600',
    fontSize: 12,
  },
  placeholder: {
    height: 110,
    backgroundColor: COLORS.cardAlt,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  activityWrap: {
    backgroundColor: 'rgba(14,42,71,0.05)',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  activityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  countPill: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  countPillText: {
    color: '#0E2A47',
    fontWeight: '800',
    fontSize: 14,
  },
  ctaButton: {
    height: 34,
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  ctaButtonBg: {
    height: 34,
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonImg: {
    borderRadius: 18,
  },
  ctaButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  activityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  activityPill: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 44,
    gap: 6,
  },
  activityBadge: {
    width: 26,
    height: 26,
    marginRight: 6,
  },
  activityText: {
    flex: 1,
    color: COLORS.navySoft,
    fontWeight: '700',
    fontSize: 9,
    lineHeight: 11,
  },
  activityMeta: {
    color: 'rgba(14,42,71,0.55)',
    fontSize: 13,
    fontWeight: '800',
    alignSelf: 'center',
    marginLeft: 8,
  },
  trendingCard: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 14,
    justifyContent: 'space-between',
  },
  trendingCardSmall: {
    justifyContent: 'space-between',
  },
  trendingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  trendingAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    marginRight: 10,
  },
  trendingAvatar: {
    width: '100%',
    height: '100%',
  },
  trendingAuthorBlock: {
    flex: 1,
  },
  trendingAuthor: {
    color: COLORS.navy,
    fontWeight: '700',
    fontSize: 14,
  },
  trendingTime: {
    color: COLORS.text2,
    fontSize: 11,
    marginTop: 2,
  },
  trendingReaction: {
    backgroundColor: 'rgba(14,42,71,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trendingReactionText: {
    color: COLORS.navySoft,
    fontWeight: '700',
    fontSize: 11,
  },
  trendingText: {
    color: COLORS.navySoft,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    flexShrink: 1,
  },
  trendingBody: {
    flex: 1,
  },
  liveTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveTitle: {
    color: COLORS.navy,
    fontWeight: '700',
    fontSize: 14,
  },
  liveStatus: {
    color: COLORS.text2,
    fontWeight: '600',
    fontSize: 12,
    marginTop: 6,
  },
  liveChannel: {
    color: COLORS.navySoft,
    fontWeight: '600',
    fontSize: 12,
    marginTop: 4,
  },
  liveCta: {
    color: COLORS.text2,
    fontWeight: '600',
    fontSize: 12,
    alignSelf: 'flex-end',
  },
  liveAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveAvatarWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  liveAvatar: {
    width: '100%',
    height: '100%',
  },
  chatCard: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 14,
    justifyContent: 'space-between',
  },
  chatTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatTitle: {
    color: COLORS.navy,
    fontWeight: '700',
    fontSize: 14,
    flexShrink: 1,
    marginRight: 8,
  },
  chatLiveChip: {
    backgroundColor: 'rgba(14,42,71,0.08)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chatLiveText: {
    color: COLORS.navy,
    fontSize: 11,
    fontWeight: '700',
  },
  chatSubline: {
    color: COLORS.text2,
    fontSize: 11,
    marginTop: 4,
  },
  chatMessage: {
    color: COLORS.navySoft,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  chatBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatAvatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  chatAvatar: {
    width: '100%',
    height: '100%',
  },
  chatTime: {
    color: COLORS.text2,
    fontSize: 11,
    fontWeight: '600',
  },
  awardScrollContent: {
    paddingLeft: 16,
    paddingRight: 16,
    gap: 12,
  },
  awardCard: {
    width: 190,
    height: 220,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  awardBackground: {
    width: '100%',
    height: '100%',
  },
  awardBackgroundImage: {
    borderRadius: 22,
    width: '100%',
    height: '100%',
  },
  awardContent: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 48,
  },
  awardAvatarContainer: {
    marginTop: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  awardAvatarAbsolute: {
    position: 'absolute',
    top: 46,
    left: '50%',
    transform: [{ translateX: -59 }],
    width: 118,
    height: 118,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  awardAvatarImage: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 0,
  },
  awardBottomSection: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 170,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  awardUserName: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  awardUserRole: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginTop: 2,
  },
});