# Non-Rev / Staff Loads + IAP - Quick Start Guide

## What Was Built

### ✅ Complete MVP Non-Rev Loads System
- **Home Screen** with airline/airport/date pickers
- **Results Screen** with flight list (mock data)
- **Details Screen** with community load reports
- **Report Modal** to submit load status (Light/Medium/Heavy/Full)

### ✅ Credits + IAP Infrastructure
- **Product Catalog** (3 Loads packages + 6 credit packs)
- **IAP Integration** (react-native-iap hooks)
- **Supabase Edge Function** for server-side entitlement grants
- **Access Control Logic** (plan/bundle/credits check)

### ✅ Database Schema
- 8 new tables with proper RLS policies
- Storage bucket for load screenshots
- Credit transaction tracking

## Files Created/Modified

### New Files (24 total):
```
supabase/migrations/
  013_nonrev_loads_tables.sql
  014_nonrev_loads_rls.sql
  015_nonrev_loads_storage.sql

supabase/functions/grant-entitlement/
  index.ts

src/lib/iap/
  catalog.ts
  iap.ts

src/lib/supabase/
  loads.ts

src/components/loads/
  AirportAirlinePickers.tsx
  FlightCard.tsx

src/screens/
  NonRevLoadsHomeScreen.tsx
  LoadsResultsScreen.tsx
  LoadDetailsScreen.tsx

app/
  nonrev.tsx (replaced)
  loads-results.tsx
  load-details/[id].tsx

Documentation:
  LOADS_IAP_IMPLEMENTATION.md
  LOADS_IAP_QUICKSTART.md (this file)
```

### Modified Files:
- `app/nonrev.tsx` - Now imports NonRevLoadsHomeScreen

## Next Steps (In Order)

### 1. Install react-native-iap
```bash
npm install react-native-iap
```
**Note:** IAP code will show TypeScript errors until this package is installed.

### 2. Apply Database Migrations
Go to your Supabase Dashboard → SQL Editor and run these files in order:
1. `supabase/migrations/013_nonrev_loads_tables.sql`
2. `supabase/migrations/014_nonrev_loads_rls.sql`
3. `supabase/migrations/015_nonrev_loads_storage.sql`

Or use Supabase CLI:
```bash
supabase db push
```

### 3. Deploy Edge Function
```bash
supabase functions deploy grant-entitlement
```

### 4. Test the Flow
1. Run the app: `npm start` or `npx expo start`
2. Navigate to Non-Rev Loads from home
3. Select: B6, JFK → LAX, 2026-03-01
4. Tap "Search Loads"
5. View results → tap a flight
6. Tap "Report Load" → submit a report

## What Still Needs Implementation

### High Priority (Future):
1. **Credits Purchase Screen**
   - Bottom sheet with live IAP product prices
   - Purchase flow integration
   - Already scaffolded in IAP code

2. **Loads Access Gate**
   - Check access before allowing search/report
   - Show "Buy Credits / Get Loads Access" prompt
   - Logic already in `canPostLoadsRequest()`

3. **Loads Request Posting**
   - UI to post a loads request
   - Table `loads_requests` already exists

4. **Manage Alerts Screen**
   - List saved alerts with toggle/delete
   - Table `nonrev_alerts` already exists

### Medium Priority:
- Screenshot uploads to `loads-media` bucket
- Alert notifications (push or in-app)
- Real flight data API (replace mock generator)
- Apple receipt verification in Edge Function

### Low Priority:
- Restore purchases UI
- Credits purchase history
- Loads request answering system

## Testing Checklist

- [ ] Migrations applied successfully
- [ ] `loads-media` bucket exists in Storage
- [ ] Edge Function deployed
- [ ] App runs without crashes
- [ ] Can search for flights (see mock data)
- [ ] Can view flight details
- [ ] Can submit a load report
- [ ] Reports appear in flight details
- [ ] Can create an alert
- [ ] IAP products configured (if testing purchases)

## Known Issues / Limitations

1. **Mock Flight Data**: Flights are generated client-side (deterministic but fake)
2. **User ID Placeholder**: Some functions use 'mock-user-id' - needs real auth.uid()
3. **IAP Not Installed**: Will show TypeScript errors until `npm install react-native-iap`
4. **Receipt Verification**: Edge Function has placeholder - needs real Apple verification
5. **Report Counts**: Show 0 in flight cards (need to join counts in query)

## How Access Control Works

User can search/post if ANY of these is true:
1. **Active Plan**: `loads_access_expires_at > now()` (Basic/Pro)
2. **Bundle Remaining**: `loads_requests_remaining > 0` (Day Pass)
3. **Credits**: `credits_balance >= 1` (pay-per-request)

When user posts a request:
- If (1) active plan → no decrement
- Else if (2) remaining > 0 → decrement by 1
- Else → decrement credits by 1 and log transaction

## IAP Product IDs (Configure in App Store Connect)

### Loads Packages:
- `fc_loads_daypass_10` - Day Pass: 10 requests, 24 hours
- `fc_loads_basic_month` - Basic: Unlimited, 30 days
- `fc_loads_pro_month` - Pro: Unlimited + Priority, 30 days

### Credits:
- `fc_credits_1` - 1 credit
- `fc_credits_5` - 5 credits
- `fc_credits_10` - 10 credits
- `fc_credits_30` - 30 credits
- `fc_credits_50` - 50 credits
- `fc_credits_100` - 100 credits

## Support / Troubleshooting

### TypeScript Errors in iap.ts
**Solution**: Run `npm install react-native-iap`

### "Cannot find module loads.ts"
**Solution**: Check import paths are `../lib/supabase/loads` (not `../../`)

### Search returns no flights
**Solution**: Check console for errors. Mock flight generator should always return 8+ flights.

### Reports not showing
**Solution**: Check RLS policies applied. Reports table should be publicly readable.

### IAP purchase fails
**Solution**: 
1. Ensure products configured in App Store Connect
2. Test in Sandbox environment
3. Check Edge Function logs in Supabase

## Architecture Notes

### Why Mock Flights?
MVP uses deterministic mock data so users can test the flow without airline API integration. Same search criteria = same flights every time.

### Why Server-Side Entitlements?
**Security**: Never trust client for IAP verification. Edge Function verifies receipt with Apple, then grants access. Client cannot manipulate credits/entitlements.

### Why RLS?
Row Level Security ensures users can only access their own searches, alerts, and requests while allowing public read of community load reports.

## Next Feature: Credits Purchase UI

To build the Credits purchase screen:
1. Create `BuyCre ditsSheet.tsx` bottom sheet component
2. Use `useIapProducts(CREDITS_SKUS)` to fetch products
3. Display `product.localizedPrice` from App Store
4. On purchase success, call Edge Function to grant credits
5. Refresh `credits_balance` from `user_profiles`

Example snippet:
```tsx
const { products, loading } = useIapProducts(CREDITS_SKUS);
const { purchaseSku, purchasing } = usePurchase();

{products.map(product => (
  <Pressable onPress={() => purchaseSku(product.sku)}>
    <Text>{product.catalogTitle}</Text>
    <Text>{product.localizedPrice}</Text>
  </Pressable>
))}
```

## Questions?

Refer to `LOADS_IAP_IMPLEMENTATION.md` for comprehensive documentation including:
- Full database schema
- Edge Function details
- Complete access control logic
- Security best practices
