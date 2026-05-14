import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import CrewScheduleHeader from '../../../src/features/crew-schedule/components/CrewScheduleHeader';
import { SCHEDULE_MOCK_HEADER_RED } from '../../../src/features/crew-schedule/scheduleMockPalette';

const ACTIVE = SCHEDULE_MOCK_HEADER_RED;
const INACTIVE = '#6B7280';

/** Five visible tabs; inset from screen sides so curved corners do not clip labels/icons. */
const TAB_ICON = 15;
const TAB_LABEL = 9;
const TAB_BAR_HEIGHT = 60;
/** Horizontal padding on the whole bar — keeps first/last tab content off the display curve. */
const TAB_BAR_EDGE_INSET = 10;

export default function CrewScheduleTabsLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
          headerShown: true,
          header: () => <CrewScheduleHeader scheduleTabsVariant />,
          tabBarActiveTintColor: ACTIVE,
          tabBarInactiveTintColor: INACTIVE,
          tabBarShowLabel: true,
          tabBarLabelPosition: 'below-icon',
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: '#E5E7EB',
            height: TAB_BAR_HEIGHT,
            paddingHorizontal: TAB_BAR_EDGE_INSET,
            paddingBottom: 6,
            paddingTop: 4,
          },
          tabBarItemStyle: {
            paddingHorizontal: 1,
            paddingVertical: 0,
            minWidth: 0,
            flex: 1,
            maxWidth: '100%',
          },
          tabBarLabelStyle: {
            fontSize: TAB_LABEL,
            fontWeight: '700',
            marginTop: 2,
            letterSpacing: -0.28,
          },
          tabBarIconStyle: { marginBottom: 0 },
        }}
      >
        <Tabs.Screen
          name="alerts"
          options={{
            title: 'Alerts',
            href: null,
          }}
        />
        <Tabs.Screen
          name="trip-chat"
          options={{
            title: 'Trip Chat',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles-outline" size={size ?? TAB_ICON} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="tradeboard"
          options={{
            title: 'Tradeboard',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="swap-horizontal" size={size ?? TAB_ICON} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: 'Schedule',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size ?? TAB_ICON} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="opentime"
          options={{
            title: 'Open Time',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="grid-outline" size={size ?? TAB_ICON} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="manage"
          options={{
            title: 'Manage',
            tabBarIcon: ({ color, size }) => (
              <View style={styles.manageIconWrap} accessibilityLabel="Manage schedule">
                <Ionicons name="calendar-outline" size={size ?? TAB_ICON} color={color} />
                <Ionicons
                  name="settings-outline"
                  size={Math.max(8, (size ?? TAB_ICON) - 5)}
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
