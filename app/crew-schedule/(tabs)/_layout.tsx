import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import CrewScheduleHeader from '../../../src/features/crew-schedule/components/CrewScheduleHeader';

const ACTIVE = '#B5161E';
const INACTIVE = '#6B7280';

export default function CrewScheduleTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <CrewScheduleHeader />,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          height: 62,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tradeboard"
        options={{
          title: 'Tradeboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="swap-horizontal" size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="trip-chat"
        options={{
          title: 'Trip Chat',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="hotels"
        options={{
          title: 'Hotels',
          tabBarIcon: ({ color, size }) => <Ionicons name="bed-outline" size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size ?? 22} color={color} />,
        }}
      />
    </Tabs>
  );
}
