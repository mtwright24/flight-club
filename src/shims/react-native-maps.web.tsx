/**
 * Web stub for react-native-maps — Metro resolves `react-native-maps` to this file on `web`
 * (see metro.config.js). Native builds use the real package.
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';

export const PROVIDER_GOOGLE = 'google';

type MapProps = {
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
  initialRegion?: unknown;
  region?: unknown;
  provider?: unknown;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
};

export default function MapView({ style, children }: MapProps) {
  return <View style={style}>{children}</View>;
}

export function Marker(_props: { children?: React.ReactNode }) {
  return null;
}

export function Callout(_props: { children?: React.ReactNode }) {
  return null;
}

export function Polyline(_props: { coordinates?: unknown[] }) {
  return null;
}
