import React from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';

import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../styles/refreshControl';

type Props = Pick<RefreshControlProps, 'refreshing' | 'onRefresh'> &
  Omit<RefreshControlProps, 'refreshing' | 'onRefresh' | 'colors' | 'tintColor' | 'titleColor'>;

export function FlightClubRefreshControl({ refreshing, onRefresh, ...rest }: Props) {
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={REFRESH_CONTROL_COLORS}
      tintColor={REFRESH_TINT}
      titleColor={REFRESH_TINT}
      progressBackgroundColor="transparent"
      {...rest}
    />
  );
}

