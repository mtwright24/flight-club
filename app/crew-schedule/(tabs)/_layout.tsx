import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import CrewScheduleHeader from '../../../src/features/crew-schedule/components/CrewScheduleHeader';
import { useCrewScheduleSixTabBarLayout } from '../../../src/features/crew-schedule/crewScheduleTabBarConfig';
import { CrewScheduleHeaderBridgeProvider } from '../../../src/features/crew-schedule/crewScheduleHeaderBridge';
import { SCHEDULE_MOCK_HEADER_RED } from '../../../src/features/crew-schedule/scheduleMockPalette';

const ACTIVE = SCHEDULE_MOCK_HEADER_RED;
const INACTIVE = '#6B7280';

export default function CrewScheduleTabsLayout() {
  const sixTabs = useCrewScheduleSixTabBarLayout();
  const tabIcon = sixTabs ? 14 : 15;
  const labelSize = sixTabs ? 6 : 7;
  const barHeight = sixTabs ? 54 : 52;

  return (
    <CrewScheduleHeaderBridgeProvider>
      <Tabs
        initialRouteName="index"
        screenOptions={{
          headerShown: true,
          header: () => <CrewScheduleHeader scheduleTabsVariant />,
          tabBarActiveTintColor: ACTIVE,
          tabBarInactiveTintColor: INACTIVE,
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: '#E5E7EB',
            height: barHeight,
            paddingBottom: 4,
            paddingTop: 2,
          },
          tabBarItemStyle: {
            paddingHorizontal: 0,
            minWidth: 0,
            flex: 1,
            maxWidth: '100%',
          },
          tabBarLabelStyle: {
            fontSize: labelSize,
            fontWeight: '700',
            marginTop: 0,
          },
          tabBarIconStyle: { marginBottom: -1 },
        }}
      >
        <Tabs.Screen
          name="alerts"
          options={
            sixTabs
              ? {
                  title: 'Alerts',
                  tabBarIcon: ({ color, size }) => (
                    <Ionicons name="notifications-outline" size={size ?? tabIcon} color={color} />
                  ),
                }
              : {
                  title: 'Alerts',
                  href: null,
                }
          }
        />
        <Tabs.Screen
          name="tradeboard"
          options={{
            title: 'Tradeboard',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="swap-horizontal" size={size ?? tabIcon} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: 'Schedule',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size ?? tabIcon} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="opentime"
          options={{
            title: 'Open Time',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="grid-outline" size={size ?? tabIcon} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="trip-chat"
          options={{
            title: 'Trip Chat',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles-outline" size={size ?? tabIcon} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="manage"
          options={{
            title: 'Manage',
            tabBarIcon: ({ color, size }) => (
              <View style={styles.manageIconWrap} accessibilityLabel="Manage schedule">
                <Ionicons name="calendar-outline" size={size ?? tabIcon} color={color} />
                <Ionicons
                  name="settings-outline"
                  size={Math.max(8, (size ?? tabIcon) - 5)}
                  color={color}
                  style={styles.manageGear}
                />
              </View>
            ),
          }}
        />
      </Tabs>
    </CrewScheduleHeaderBridgeProvider>
  );
}

const styles = StyleSheet.create({
  manageIconWrap: {
    width: 24,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageGear: {
    position: 'absolute',
    right: -1,
    bottom: -2,
  },
});
