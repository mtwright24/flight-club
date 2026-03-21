import { Redirect } from 'expo-router';
import React from 'react';

// Legacy direct message route by user id: send to unified inbox
export default function LegacyDirectMessageScreen() {
  return <Redirect href="/messages-inbox" />;
}
