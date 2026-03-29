/**
 * Poll Expo push receipts for pending ticket IDs and deactivate invalid tokens.
 * Schedule via Supabase cron or call manually with service role.
 *
 * @example
 * curl -X POST "$SUPABASE_URL/functions/v1/process-expo-push-receipts" \
 *   -H "Authorization: Bearer $SERVICE_ROLE_KEY"
 */
// @ts-expect-error Deno std
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runExpoPushReceiptSweep } from '../_shared/expoPushSender.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // @ts-expect-error Deno.env
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-expect-error Deno.env
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!url || !key) {
      return new Response(JSON.stringify({ error: 'Missing Supabase env' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(url, key);
    const result = await runExpoPushReceiptSweep(supabase, 500);

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[process-expo-push-receipts]', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
