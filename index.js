/**
 * Application entry. This file must run before `expo-router/entry` so dev-only
 * `fetch` instrumentation is installed before Supabase and other code capture `global.fetch`.
 */
import './src/lib/dev/instrumentFetch';
import 'expo-router/entry';
