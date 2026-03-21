import { useLocalSearchParams } from 'expo-router';
import { View, Text } from 'react-native';

export default function AwardDetailScreen() {
  const { id } = useLocalSearchParams();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Award Detail: {id}</Text>
    </View>
  );
}
