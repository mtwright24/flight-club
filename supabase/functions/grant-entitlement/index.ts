/**
 * Server-side entitlement grant after IAP (trusted: caller JWT must match body.user_id).
 * Updates user_entitlements and/or credits (profiles + user_credits + credits_ledger).
 */
// @ts-expect-error Deno std
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = {
  user_id?: string;
  entitlement_type?: string;
  product_id?: string | null;
  source?: string | null;
  receipt?: string | null;
  credits_amount?: number | null;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // @ts-expect-error Deno
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-expect-error Deno
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // @ts-expect-error Deno
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !serviceRole || !anonKey) {
      throw new Error('Missing Supabase env');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const userClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken);
    if (userErr || !userData.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authUserId = userData.user.id;

    const raw = (await req.json()) as Body;
    const userId = typeof raw.user_id === 'string' ? raw.user_id.trim() : '';
    const entitlementType = String(raw.entitlement_type ?? '');
    const productId = raw.product_id ?? null;
    const source = String(raw.source ?? 'APPLE_IAP');
    const receipt = raw.receipt ?? null;
    const creditsAmount = typeof raw.credits_amount === 'number' && raw.credits_amount > 0 ? Math.floor(raw.credits_amount) : 1;

    if (!userId || userId !== authUserId) {
      return new Response(JSON.stringify({ error: 'user_id must match signed-in user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRole);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const dayPassExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    let entitlementUpdates: Record<string, unknown> = { updated_at: now };
    let creditsToAdd = 0;

    switch (entitlementType) {
      case 'LOADS_DAY_PASS':
        entitlementUpdates.loads_plan = 'NONE';
        entitlementUpdates.loads_requests_remaining = 10;
        entitlementUpdates.loads_access_expires_at = dayPassExpiresAt;
        break;
      case 'LOADS_BASIC':
        entitlementUpdates.loads_plan = 'LOADS_BASIC';
        entitlementUpdates.loads_requests_remaining = 0;
        entitlementUpdates.loads_access_expires_at = expiresAt;
        break;
      case 'LOADS_PRO':
        entitlementUpdates.loads_plan = 'LOADS_PRO';
        entitlementUpdates.loads_requests_remaining = 0;
        entitlementUpdates.loads_access_expires_at = expiresAt;
        break;
      case 'CREDITS':
        creditsToAdd = creditsAmount;
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown entitlement type: ${entitlementType}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }

    if (entitlementType !== 'CREDITS') {
      const { error: entitlementError } = await supabase.from('user_entitlements').upsert(
        {
          user_id: userId,
          ...entitlementUpdates,
        },
        { onConflict: 'user_id' },
      );
      if (entitlementError) throw entitlementError;
    }

    if (creditsToAdd > 0) {
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('credits_balance')
        .eq('id', userId)
        .maybeSingle();
      if (profErr) throw profErr;
      const curBal = prof?.credits_balance ?? 0;
      const newBal = curBal + creditsToAdd;

      const { error: profileUpErr } = await supabase
        .from('profiles')
        .update({ credits_balance: newBal })
        .eq('id', userId);
      if (profileUpErr) throw profileUpErr;

      const { data: ucRow } = await supabase.from('user_credits').select('balance').eq('user_id', userId).maybeSingle();
      const newUcBal = (ucRow?.balance ?? 0) + creditsToAdd;
      const { error: ucErr } = await supabase.from('user_credits').upsert(
        {
          user_id: userId,
          balance: newUcBal,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      );
      if (ucErr) throw ucErr;

      const { error: ledgerErr } = await supabase.from('credits_ledger').insert({
        user_id: userId,
        amount: creditsToAdd,
        reason: `purchase ${productId ?? 'credits'}`,
        source,
      });
      if (ledgerErr) throw ledgerErr;

      const { error: txErr } = await supabase.from('credit_transactions').insert({
        user_id: userId,
        provider: source === 'PROMO' ? 'PROMO' : source === 'ADMIN' ? 'ADMIN' : 'APPLE_IAP',
        product_id: productId ?? `fc_credits_${creditsToAdd}`,
        credits_delta: creditsToAdd,
        amount_usd: null,
        currency: 'USD',
        receipt_data: receipt,
      });
      if (txErr) {
        console.warn('[grant-entitlement] credit_transactions insert skipped', txErr.message);
      }

      return new Response(
        JSON.stringify({
          success: true,
          entitlement_type: entitlementType,
          credits_added: creditsToAdd,
          new_balance: newBal,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: updated, error: fetchErr } = await supabase
      .from('user_entitlements')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    return new Response(
      JSON.stringify({
        success: true,
        entitlement_type: entitlementType,
        entitlements: updated,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[grant-entitlement]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
