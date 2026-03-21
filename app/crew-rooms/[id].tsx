import { useLocalSearchParams } from 'expo-router';
import { View, Text } from 'react-native';

export default function CrewRoomDetailScreen() {
  const { id } = useLocalSearchParams();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Crew Room Detail: {id}</Text>
    </View>
  );
}
