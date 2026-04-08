/**
 * User schedule memory — public.user_schedule_profiles
 * Survives across imports so routing + classification are not cold-start every time.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ClassificationResult, UserScheduleProfileRow } from './types.ts';

export async function fetchUserScheduleProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<UserScheduleProfileRow> {
  const { data } = await supabase
    .from('user_schedule_profiles')
    .select('airline_id, role_id, software_id, default_view_type_id, last_successful_template_id, last_successful_month_key')
    .eq('user_id', userId)
    .maybeSingle();
  return data as UserScheduleProfileRow;
}

export async function persistUserMemoryAfterSuccessfulImport(
  supabase: SupabaseClient,
  userId: string,
  classification: ClassificationResult,
  appliedTemplateId: string,
  monthKey: string
): Promise<void> {
  await supabase.from('user_schedule_profiles').upsert(
    {
      user_id: userId,
      airline_id: classification.airline_guess_id,
      role_id: classification.role_guess_id,
      software_id: classification.software_guess_id,
      default_view_type_id: classification.view_guess_id,
      last_successful_template_id: appliedTemplateId,
      last_successful_month_key: monthKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
}
