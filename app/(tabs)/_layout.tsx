import { Tabs } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import SectionHeader from '../../src/components/navigation/SectionHeader';
import { useRouter } from 'expo-router';
import { useDmUnreadBadge } from '../../src/hooks/useDmUnreadBadge';
import { useNotificationsBadge } from '../../src/hooks/useNotificationsBadge';

function HomeHeaderNav() {
  const router = useRouter();
  const unread = useNotificationsBadge();
  const { count: dmUnread } = useDmUnreadBadge();
  return (
    <FlightClubHeader
		  bellCount={unread}
      dmCount={dmUnread}
      onPressBell={() => router.push('/notifications')}
      onPressMessage={() => router.push('/messages-inbox')}
    />
  );
}

function CrewRoomsHeaderNav() {
  const router = useRouter();
  const unread = useNotificationsBadge();
  const { count: dmUnread } = useDmUnreadBadge();
  return (
    <SectionHeader
      title="Crew Rooms"
		  notificationCount={unread}
      dmCount={dmUnread}
      onPressBell={() => router.push('/notifications')}
      onPressMessage={() => router.push('/messages-inbox')}
    />
  );
}

function CrewToolsHeaderNav() {
  const router = useRouter();
  const unread = useNotificationsBadge();
  const { count: dmUnread } = useDmUnreadBadge();
  return (
    <SectionHeader
      title="Crew Tools"
		  notificationCount={unread}
      dmCount={dmUnread}
      onPressBell={() => router.push('/notifications')}
      onPressMessage={() => router.push('/messages-inbox')}
    />
  );
}

function SocialFeedHeaderNav() {
  const router = useRouter();
  const unread = useNotificationsBadge();
  const { count: dmUnread } = useDmUnreadBadge();
  return (
    <SectionHeader
      title="Social Feed"
		  notificationCount={unread}
      dmCount={dmUnread}
      onPressBell={() => router.push('/notifications')}
      onPressMessage={() => router.push('/messages-inbox')}
    />
  );
}

function ProfileHeaderNav() {
  const router = useRouter();
  const unread = useNotificationsBadge();
  const { count: dmUnread } = useDmUnreadBadge();
  return (
    <SectionHeader
      title="Profile"
		  notificationCount={unread}
      dmCount={dmUnread}
      onPressBell={() => router.push('/notifications')}
      onPressMessage={() => router.push('/messages-inbox')}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          height: 64,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          marginTop: 2,
          marginBottom: 4,
          fontWeight: '700',
        },
        tabBarActiveTintColor: '#B5161E',
        tabBarInactiveTintColor: '#6B7280',
      }}
    >
    <Tabs.Screen
    name="index"
    options={{
      title: 'Home',
      header: () => <HomeHeaderNav />,
      tabBarIcon: ({ focused, color }) => (
      <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
      ),
    }}
    />
      <Tabs.Screen
        name="crew-rooms"
        options={{
          title: 'Crew Rooms',
          tabBarLabel: 'Crew Rooms',
      header: () => <CrewRoomsHeaderNav />,
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="crew-tools"
        options={{
          title: 'Crew Tools',
          tabBarLabel: 'Crew Tools',
          header: () => <CrewToolsHeaderNav />,
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Social Feed',
      header: () => <SocialFeedHeaderNav />,
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          header: () => <ProfileHeaderNav />, 
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}