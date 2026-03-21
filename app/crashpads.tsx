import { Redirect } from 'expo-router';
import React from 'react';

export default function CrashpadsScreen() {
  // Always send users into the full Crashpads & Housing hub
  // which renders the standard Flight Club header and marketplace UI.
  return <Redirect href="/(screens)/crashpads" />;
}
