import React, { useRef } from 'react';
import { View, Image, StyleSheet, Pressable, PanResponder, Animated } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/** Decode `uri` param (DM / room detail pass encodeURIComponent for query strings). */
function parseUriParam(raw: string | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function ImageViewer() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const uri = parseUriParam((params as { uri?: string }).uri);

  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
          const nextOpacity = 1 - gestureState.dy / 400;
          opacity.setValue(Math.max(0, nextOpacity));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150) {
          Animated.parallel([
            Animated.timing(translateY, { toValue: 500, duration: 200, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          ]).start(() => router.back());
        } else {
          Animated.parallel([
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
            Animated.spring(opacity, { toValue: 1, useNativeDriver: true }),
          ]).start();
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Animated.View style={[styles.animated, { transform: [{ translateY }], opacity }]}>
        <View style={styles.panArea} {...panResponder.panHandlers}>
          <Pressable
            onPress={() => router.back()}
            style={styles.topClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {uri ? <Image source={{ uri }} style={styles.img} resizeMode="contain" /> : null}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  animated: { flex: 1 },
  panArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  img: { width: '100%', height: '100%' },
  topClose: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
