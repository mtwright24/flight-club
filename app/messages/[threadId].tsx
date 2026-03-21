import { Redirect } from 'expo-router';
import React from 'react';

// Legacy thread route: route any old links back to the main inbox
export default function LegacyMessageThreadScreen() {
  return <Redirect href="/messages-inbox" />;
}
