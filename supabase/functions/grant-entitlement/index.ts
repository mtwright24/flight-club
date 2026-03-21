// @ts-ignore: Deno Deploy remote import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore: Deno Deploy remote import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// @ts-ignore: Deno global for Supabase Edge
Deno.env.get('SUPABASE_URL') || '',
// @ts-ignore: Deno global for Supabase Edge
Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
)

const now = new Date().toISOString()
const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
const dayPassExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours

// Determine entitlement updates based on type
let entitlementUpdates: any = { updated_at: now }
let creditsToAdd = 0

switch (entitlement_type) {
  case 'LOADS_DAY_PASS':
    entitlementUpdates.loads_plan = 'NONE'
    entitlementUpdates.loads_requests_remaining = 10
    entitlementUpdates.loads_access_expires_at = dayPassExpiresAt
    break

  case 'LOADS_BASIC':
    entitlementUpdates.loads_plan = 'LOADS_BASIC'
    entitlementUpdates.loads_requests_remaining = 0
    entitlementUpdates.loads_access_expires_at = expiresAt
    break

  case 'LOADS_PRO':
    entitlementUpdates.loads_plan = 'LOADS_PRO'
    entitlementUpdates.loads_requests_remaining = 0
    entitlementUpdates.loads_access_expires_at = expiresAt
    break

  case 'CREDITS':
    creditsToAdd = credits_amount || 1
    break

  default:
    return new Response(
      JSON.stringify({ error: `Unknown entitlement type: ${entitlement_type}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
}

// Upsert user_entitlements row
const { error: entitlementError } = await supabase
  .from('user_entitlements')
  .upsert(
    {
      user_id,
      ...entitlementUpdates,
    },
    { onConflict: 'user_id' }
  )
  .throwOnError()

if (entitlementError) throw entitlementError

// If credits, update user_profiles and log transaction
if (creditsToAdd > 0) {
  // Increment credits balance
  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({ credits_balance: supabase.rpc('increment_credits', { user_id, amount: creditsToAdd }) })
    .eq('id', user_id)
    .throwOnError()

  // Log transaction (using RPC would be better but for now use simple insert)
  const { error: transactionError } = await supabase
    .from('credit_transactions')
    .insert({
      user_id,
      provider: source || 'APPLE_IAP',
      product_id: product_id || `fc_credits_${creditsToAdd}`,
      credits_delta: creditsToAdd,
      amount_usd: null,
      currency: 'USD',
      receipt_data: receipt || null,
    })
    .throwOnError()

  if (transactionError) throw transactionError

  // Fetch updated balance
  const { data: updatedProfile } = await supabase
    .from('user_profiles')
    .select('credits_balance')
    .eq('id', user_id)
    .single()

  return new Response(
    JSON.stringify({
      success: true,
      entitlement_type,
      credits_added: creditsToAdd,
      new_balance: (updatedProfile?.credits_balance || 0) + creditsToAdd,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// Fetch updated entitlements
const { data: updated } = await supabase
  .from('user_entitlements')
  .select('*')
  .eq('user_id', user_id)
  .single()

return new Response(
  JSON.stringify({
    success: true,
    entitlement_type,
    entitlements: updated,
  }),
  { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
)
} catch (error: any) {
  console.error('Error:', error)
  return new Response(
    JSON.stringify({ error: error?.message || 'Internal server error' }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
