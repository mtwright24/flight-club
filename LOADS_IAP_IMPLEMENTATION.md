# Non-Rev / Staff Loads + IAP Implementation Summary

## Overview
Complete implementation of the Non-Rev / Staff Loads feature with In-App Purchase (IAP) integration for Flight Club app.

## Database Migrations

### Migration Files Created:
1. **013_nonrev_loads_tables.sql** - Core tables for loads feature
   - `nonrev_searches` - User search history
   - `nonrev_load_flights` - Flight records
   - `nonrev_load_reports` - Community load reports (LIGHT/MEDIUM/HEAVY/FULL)
   - `nonrev_alerts` - Saved search alerts
   - `user_entitlements` - Loads/Alerts plans and access
   - `loads_requests` - User-posted requests (MVP crowdsourced)
   - `loads_answers` - Community answers to requests
   - `credit_transactions` - IAP purchase records
   - Added `credits_balance` column to `user_profiles`

2. **014_nonrev_loads_rls.sql** - Row Level Security policies
   - All tables have appropriate RLS policies
   - Users can only access their own searches, alerts, requests
   - Load reports and flights are publicly readable
   - Entitlements/transactions are read-only for users (updates via service role only)

3. **015_nonrev_loads_storage.sql** - Storage bucket for screenshots
   - Created `loads-media` bucket
   - Public read access
   - Authenticated users can upload
   - Users can delete their own uploads

### Running Migrations:
```bash
# Apply migrations to your Supabase project
cd supabase
supabase db push

# Or via SQL editor in Supabase dashboard:
# Copy/paste contents of each migration file in order
```

## Supabase Edge Functions

### grant-entitlement
**Location:** `supabase/functions/grant-entitlement/index.ts`

**Purpose:** Server-side IAP verification and entitlement granting (trusted context only)

**Input:**
```json
{
  "user_id": "uuid",
  "entitlement_type": "LOADS_DAY_PASS|LOADS_BASIC|LOADS_PRO|CREDITS",
  "product_id": "fc_loads_daypass_10",
  "source": "APPLE_IAP|PROMO|ADMIN",
  "receipt": "base64_receipt_data",
  "credits_amount": 10
}
```

**Response:**
```json
{
  "success": true,
  "entitlement_type": "LOADS_DAY_PASS",
  "entitlements": { /* updated entitlements object */ }
}
```

**Deploy:**
```bash
supabase functions deploy grant-entitlement
```

## IAP Infrastructure

### Product Catalog
**File:** `src/lib/iap/catalog.ts`

**Defined SKUs:**
- **Loads Packages:**
  - `fc_loads_daypass_10` - 10 requests, 24 hours
  - `fc_loads_basic_month` - Unlimited, 30 days
  - `fc_loads_pro_month` - Unlimited + Priority, 30 days

- **Credits Packs:**
  - `fc_credits_1` through `fc_credits_100`

### IAP Integration
**File:** `src/lib/iap/iap.ts`

**Exports:**
- `initIapConnection()` - Initialize connection (call in App.tsx)
- `useIapProducts(skus)` - Hook to fetch products from App Store with live prices
- `usePurchase()` - Hook to handle purchase flow
- `setupPurchaseListener(onSuccess, onError)` - Global purchase listener

**Usage Example:**
```tsx
import { useIapProducts, usePurchase } from '../lib/iap/iap';
import { LOADS_SKUS } from '../lib/iap/catalog';

const { products, loading } = useIapProducts(LOADS_SKUS);
const { purchaseSku, purchasing } = usePurchase();

// Display products with live prices
{products.map(product => (
  <Text>{product.localizedPrice}</Text>
))}

// Purchase
await purchaseSku('fc_loads_daypass_10');
```

## Loads Feature Helpers
**File:** `src/lib/supabase/loads.ts`

**Key Functions:**
- `searchFlights(userId, airline, from, to, date)` - Generate mock flights and store in DB
- `getFlight(flightId)` - Get flight details + community reports
- `createLoadReport(userId, flightId, status, notes, mediaUrl)` - Submit load report
- `createAlert(userId, airline, from, to, date)` - Save search as alert
- `listAlerts(userId)` - Get user's saved alerts
- `getUserEntitlements(userId)` - Get user's loads/alerts access
- `canPostLoadsRequest(userId)` - Check if user has access (plan/bundle/credits)

**Mock Flight Generation:**
- Deterministic based on route + date (same search = same flights)
- Generates 8-13 flights with realistic times
- Automatically upserts to `nonrev_load_flights` table

## Screens

### NonRevLoadsHomeScreen
**Path:** `app/nonrev.tsx` → `src/screens/NonRevLoadsHomeScreen.tsx`

**Features:**
- Airline selector (modal with list)
- From/To airport pickers (searchable modals with 30 airports)
- Date picker (MVP: text input with quick chips)
- "Search Loads" CTA button
- Credits balance display in header
- Disclaimer box
- Quick chips: Recent, Options

**Navigation:** Linked from home tiles and menu

### LoadsResultsScreen
**Path:** `app/loads-results.tsx`

**Features:**
- Flight cards list with route, times, duration
- Sort by: Depart / Arrive / Most Reported
- Filter: Nonstop only
- Empty state + error state
- Loading skeleton
- Taps navigate to LoadDetailsScreen

### LoadDetailsScreen
**Path:** `app/load-details/[id].tsx`

**Features:**
- Flight info card (airline, route, times, duration)
- Community reports section:
  - Summary bar showing most common status
  - List of latest reports (avatar, name, time ago, status pill, notes)
  - Empty state for no reports
- "Report Load" button opens modal
- Report modal:
  - Status selection (Light/Medium/Heavy/Full chips)
  - Optional notes (200 char max)
  - Optional screenshot upload (future)
- Disclaimer text

## Components

### AirportAirlinePickers
**File:** `src/components/loads/AirportAirlinePickers.tsx`

**Exports:**
- `AirportPickerModal` - Searchable list of 30 airports (code + city search)
- `AirlinePickerModal` - List of 10 major airlines

### FlightCard & LoadStatusPill
**File:** `src/components/loads/FlightCard.tsx`

**Exports:**
- `FlightCard` - Reusable flight row component
- `LoadStatusPill` - Color-coded status badge (green/yellow/red/dark red)

## Installation Steps

### 1. Install Dependencies
```bash
npm install react-native-iap
# Note: After installing, rebuild the app for iOS:
# npx expo prebuild --clean
# npx expo run:ios
```

**IMPORTANT:** The IAP integration code (src/lib/iap/iap.ts) will show TypeScript errors until `react-native-iap` is installed. This is expected and will resolve after running `npm install react-native-iap`.

### 2. Apply Database Migrations
Run migrations 013, 014, 015 in Supabase (via dashboard or CLI)

### 3. Create Storage Bucket
Bucket `loads-media` should be auto-created by migration 015.
Verify in Supabase dashboard → Storage.

### 4. Deploy Edge Function
```bash
supabase functions deploy grant-entitlement
```

### 5. Configure IAP Products in App Store Connect
Create the following in-app purchase products:
- `fc_loads_daypass_10` - Consumable or Non-Renewing Subscription
- `fc_loads_basic_month` - Auto-Renewable Subscription
- `fc_loads_pro_month` - Auto-Renewable Subscription
- `fc_credits_1` through `fc_credits_100` - Consumable

Set appropriate prices for each tier.

### 6. App Configuration
Add to your root App component (or `_layout.tsx`):

```tsx
import { useEffect } from 'react';
import { initIapConnection, setupPurchaseListener } from './src/lib/iap/iap';
import { supabase } from './src/lib/supabaseClient';

// In your root component:
useEffect(() => {
  initIapConnection();
  
  const cleanup = setupPurchaseListener(
    async (purchase) => {
      // Call grant-entitlement Edge Function
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      
      if (!userId) return;
      
      const { data, error } = await supabase.functions.invoke('grant-entitlement', {
        body: {
          user_id: userId,
          entitlement_type: 'LOADS_DAY_PASS', // or map from product ID
          product_id: purchase.productId,
          source: 'APPLE_IAP',
          receipt: purchase.transactionReceipt,
        }
      });
      
      if (!error) {
        // Refresh user entitlements
        console.log('Purchase successful:', data);
      }
    },
    (error) => {
      console.error('Purchase error:', error);
    }
  );
  
  return cleanup;
}, []);
```

## Access Control Logic

### User Can Post Request If:
1. **Active Plan:** `loads_access_expires_at > now()` (LOADS_BASIC or LOADS_PRO)
2. **Bundle Remaining:** `loads_requests_remaining > 0` (Day Pass)
3. **Credits:** `credits_balance >= 1` (pay-per-request)

### Consumption Order:
1. If active plan → no decrement
2. Else if remaining > 0 → decrement `loads_requests_remaining`
3. Else → decrement `credits_balance` by 1 and log transaction

## UI/UX Flows

### Happy Path - Search Loads:
1. User opens Non-Rev Loads from home
2. Selects airline (B6), from (JFK), to (LAX), date (2026-03-01)
3. Taps "Search Loads"
4. Navigates to Results screen with 10 mock flights
5. Taps a flight
6. Views flight details + existing reports (if any)
7. Taps "Report Load" → selects "LIGHT" + notes → submits
8. Report appears in list

### Access Check Flow:
1. User tries to post request
2. System checks `canPostLoadsRequest(userId)`
3. If not allowed → shows banner: "You do not have sufficient credits to post 1 request"
4. Banner has CTA → opens LoadsAccessSheet (bottom sheet)
5. User sees Loads Packages + Credits packs with live App Store prices
6. User taps "Get" on a package
7. App Store purchase dialog
8. On success → calls `grant-entitlement` Edge Function
9. System grants access
10. User can now post request

## Known Limitations / MVP Scope

### NOT Implemented (Future):
- Screenshot uploads in load reports (UI ready, needs implementation)
- Alert notifications (table ready, push logic needed)
- Real flight data API integration (currently mock data)
- Restore purchases UI
- Apple receipt verification (Edge Function has placeholder for dev mode)
- Credits purchase screen (catalog + IAP ready, UI not built)
- Loads request posting flow (table + access check ready, UI not built)
- ManageAlertsScreen (planned, not built)

### Mock Data:
- Flights are deterministic mock data (8-13 flights per route/date)
- Report counts are placeholder 0 (need to join counts in query)
- User IDs in some functions use 'mock-user-id' (replace with real auth.uid())

## Testing Checklist

- [ ] Apply migrations successfully
- [ ] Create loads-media bucket
- [ ] Deploy grant-entitlement function
- [ ] Configure IAP products in App Store Connect
- [ ] Test search flow (nonrev → results → details)
- [ ] Test report submission
- [ ] Test access check logic
- [ ] Test IAP purchase (sandbox)
- [ ] Test alert creation
- [ ] Verify RLS policies work correctly

## Security Notes

### CRITICAL:
- **NEVER** trust client-side IAP verification
- **ALWAYS** verify receipts server-side (Edge Function)
- Credit balance updates MUST be server-side only (service role)
- Entitlement grants MUST be server-side only

### RLS Policies:
- Users can only read/write their own searches, alerts, requests
- Load reports are public (community feature)
- Entitlements/transactions are read-only for users

## File Structure Summary

```
flight-club/
├── supabase/
│   ├── migrations/
│   │   ├── 013_nonrev_loads_tables.sql
│   │   ├── 014_nonrev_loads_rls.sql
│   │   └── 015_nonrev_loads_storage.sql
│   └── functions/
│       └── grant-entitlement/
│           └── index.ts
├── src/
│   ├── lib/
│   │   ├── iap/
│   │   │   ├── catalog.ts
│   │   │   └── iap.ts
│   │   └── supabase/
│   │       └── loads.ts
│   ├── components/
│   │   └── loads/
│   │       ├── AirportAirlinePickers.tsx
│   │       └── FlightCard.tsx
│   └── screens/
│       ├── NonRevLoadsHomeScreen.tsx
│       ├── LoadsResultsScreen.tsx
│       └── LoadDetailsScreen.tsx
└── app/
    ├── nonrev.tsx
    ├── loads-results.tsx
    └── load-details/
        └── [id].tsx
```

## Next Steps

1. **Install react-native-iap:** `npm install react-native-iap`
2. **Apply migrations** to Supabase
3. **Deploy Edge Function**
4. **Configure IAP products** in App Store Connect
5. **Add IAP initialization** to root App component
6. **Test search flow** end-to-end
7. **Build Credits purchase screen** (future)
8. **Build Loads request posting** (future)
9. **Implement screenshot uploads** (future)
10. **Add push notifications for alerts** (future)

## Support

For issues or questions:
- Check Supabase logs for Edge Function errors
- Check RLS policies if data access fails
- Verify IAP products are configured correctly in App Store Connect
- Use sandbox environment for IAP testing
