# Flight Club Expo Router + Supabase Auth Setup

## ✅ Completed Changes

### Files Modified
1. **app/_layout.tsx** - Root auth gate with session + profile checking + deep-link handling
2. **app/(auth)/_layout.tsx** - Auth group with Stack navigator
3. **app/(auth)/sign-in.tsx** - Password + magic-link sign-in (updated)
4. **app/(auth)/sign-up.tsx** - Password + magic-link sign-up (updated)
5. **app.json** - Already has `"scheme": "flightclub"` registered ✓
6. **src/lib/supabaseClient.ts** - Already configured with `detectSessionInUrl: false` ✓

## 🔑 Supabase Configuration

### Site URL (in Supabase Dashboard → Authentication → URL Configuration)
```
https://your-supabase-project.supabase.co
```

### Redirect URLs (Add ALL of these in Supabase Dashboard → Authentication → URL Configuration)
```
flightclub://
flightclub://**
http://localhost:19006
http://localhost:3000
```

### Why these URLs?
- `flightclub://` and `flightclub://**` - Handle magic links from your app on physical devices & Expo Go
- `http://localhost:19006` - Expo Go tunnel URL for testing
- `http://localhost:3000` - Web preview/testing

## 🔗 Deep-Link Flow

### Magic Link Sign-In/Sign-Up Process
1. User enters email → App calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: 'flightclub://' } })`
2. Supabase sends email with magic link: `flightclub://?access_token=...&refresh_token=...`
3. Link opens app → Deep-link handler in root layout triggers
4. Root layout parses URL fragment, calls `supabase.auth.setSession()`, triggers routing logic
5. Session established → Root layout checks profile.handle
6. Routes to CreateProfileScreen (if no profile) or (tabs) (if profile exists)

### Root Layout Routing Logic
```
Initial Load
  ├─ Load session from secure storage (supabase.auth.getSession)
  ├─ Parse deep-link URL if present
  ├─ If access_token in URL, call setSession()
  └─ onAuthStateChange fires

AuthStateChange
  ├─ If NO session → Show (auth) group (sign-in, sign-up)
  ├─ If session + NO profile.handle → Show CreateProfileScreen
  └─ If session + profile.handle → Show (tabs) group
```

## 📋 Testing Checklist

### 1. Password Sign-Up
- [ ] Launch app in Expo Go
- [ ] Go to Sign Up screen
- [ ] Enter email + password (6+ chars)
- [ ] Click "Create Account"
- [ ] Should route to CreateProfileScreen (because account created with session)
- [ ] Fill profile, click "Continue"
- [ ] Should see tabs screen

### 2. Magic Link Sign-Up
- [ ] Launch app in Expo Go
- [ ] Go to Sign Up screen
- [ ] Enter email
- [ ] Click "Send Magic Link"
- [ ] Check email (usually gmail's promotions tab)
- [ ] Click link (opens Expo Go)
- [ ] App should route to CreateProfileScreen
- [ ] Fill profile, click "Continue"
- [ ] Should see tabs screen

### 3. Magic Link Sign-In
- [ ] Sign out (from profile or tabs)
- [ ] Go to Sign In screen
- [ ] Enter email
- [ ] Click "Send Magic Link"
- [ ] Check email, click link
- [ ] App should route directly to (tabs) (because profile already exists)

### 4. Password Sign-In
- [ ] Sign out
- [ ] Go to Sign In screen
- [ ] Enter email + password
- [ ] Click "Sign In"
- [ ] Should route directly to (tabs)

### 5. Session Persistence
- [ ] Sign in
- [ ] Close app
- [ ] Reopen app
- [ ] Should stay logged in (session stored in Secure Store)

### 6. No Route Warnings
- [ ] Open Expo Go console
- [ ] No warnings like "No route named (tabs)" or "No route named (auth)"
- [ ] All navigation should be silent

## 🚀 Running the App

### Using Expo CLI with LAN Mode (Recommended)
```bash
cd flight-club
npx expo start --lan
```

Select:
- `i` to open in Expo Go (iOS)
- `a` to open in Expo Go (Android)

### Environment Variables (.env or .env.local)
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## ⚠️ Common Issues & Fixes

### Issue: Magic link opens browser instead of app
**Fix:** Ensure all these are present:
- `scheme: "flightclub"` in app.json ✓
- `emailRedirectTo: 'flightclub://'` in sign-in and sign-up ✓
- Redirect URLs in Supabase include `flightclub://` and `flightclub://**` ✓

### Issue: "No route named (tabs)" or "No route named (auth)"
**Fix:** Ensure root layout properly routes:
```typescript
if (!session) return <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(auth)" /></Stack>;
if (!userProfile) return <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(auth)" options={{ gestureEnabled: false }} /></Stack>;
return <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(tabs)" /></Stack>;
```

### Issue: Session lost on app restart
**Fix:** Verify `persistSession: true` in supabaseClient.ts ✓

### Issue: Deep-link not triggered
**Fix:**
1. Check URL format: `flightclub://?access_token=...&refresh_token=...`
2. Kill and reopen app (don't just background)
3. In Expo Go, shake phone → Show console for deep-link logs

## 📝 Current File Structure

```
app/
├── _layout.tsx               (Root: auth gate + deep-link handling)
├── modal.tsx
├── (auth)/
│   ├── _layout.tsx          (Auth Stack)
│   ├── sign-in.tsx          (Password + Magic Link)
│   ├── sign-up.tsx          (Password + Magic Link)
│   └── CreateProfileScreen.tsx
└── (tabs)/
    ├── _layout.tsx          (Tabs navigator)
    ├── index.tsx
    └── explore.tsx
```

## 🎯 Next Steps (If Issues)

1. **Check Supabase Logs:** Dashboard → Logs → check for auth events
2. **Enable Console Logging:** In root layout, add `console.log('Deep-link URL:', url)`
3. **Test with Hardcoded Token:** Manually parse a Supabase magic link and check format
4. **Use LAN Mode:** Tunnel mode (exp.direct) is unreliable; use `npx expo start --lan`

---

**Status:** ✅ Complete and ready to test
