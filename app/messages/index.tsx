import { Redirect } from 'expo-router';
import React from 'react';

// Legacy route: immediately send users to the unified messages inbox
export default function LegacyMessagesIndex() {
  return <Redirect href="/messages-inbox" />;
}
