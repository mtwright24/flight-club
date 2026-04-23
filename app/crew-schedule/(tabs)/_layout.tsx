import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import CrewScheduleHeader from '../../../src/features/crew-schedule/components/CrewScheduleHeader';

const ACTIVE = '#B5161E';
const INACTIVE = '#6B7280';

export default function CrewScheduleTabsLayout() {
  // Default tab is Schedule (`index`); without this, file order can favor `alerts` first alphabetically.
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: true,
        header: () => <CrewScheduleHeader />,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          height: 56,
          paddingBottom: 3,
          paddingTop: 2,
        },
        tabBarItemStyle: { paddingHorizontal: 0, minWidth: 0 },
        tabBarLabelStyle: { fontSize: 8, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size ?? 17} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size ?? 17} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tradeboard"
        options={{
          title: 'Tradeboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="swap-horizontal" size={size ?? 17} color={color} />,
        }}
      />
      <Tabs.Screen
        name="trip-chat"
        options={{
          title: 'Trip Chat',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size ?? 17} color={color} />,
        }}
      />
      <Tabs.Screen
        name="manage"
        options={{
          title: 'Manage',
          tabBarIcon: ({ color, size }) => (
            <View style={styles.manageIconWrap} accessibilityLabel="Manage schedule">
              <Ionicons name="calendar-outline" size={size ?? 17} color={color} />
              <Ionicons
                name="settings-outline"
                size={Math.max(10, (size ?? 17) - 5)}
                color={color}
                style={styles.manageGear}
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  manageIconWrap: {
    width: 28,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageGear: {
    position: 'absolute',
    right: -1,
    bottom: -2,
  },
});
