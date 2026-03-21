import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export default function NonRevScreen() {
  const router = useRouter();
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Non-Rev Loads</Text>
        <View style={{ width: 50 }} />
      </View>
      
      <View style={styles.content}>
        <Text style={styles.title}>Non-Rev / Staff Loads</Text>
        <Text style={styles.subtitle}>Feature coming soon</Text>
        
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Search for loads</Text>
          <Text style={styles.cardText}>Select airline, route, and date to see available flights and community load reports.</Text>
        </View>
        
        <Pressable 
          style={styles.button}
          onPress={() => alert('This feature is under construction')}
        >
          <Text style={styles.buttonText}>Coming Soon</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#DC3545',
  },
  backButton: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#DC3545',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
