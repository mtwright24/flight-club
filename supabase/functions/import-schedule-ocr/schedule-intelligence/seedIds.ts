/**
 * Stable seed UUIDs — must match supabase/migrations/*schedule_intelligence*.sql
 */

export const SEED_IDS = {
  airlineJetBlue: '00000000-0000-4000-8000-000000000001',
  roleFA: '00000000-0000-4000-8000-000000000101',
  softwareFlica: '00000000-0000-4000-8000-000000000201',
  softwareGeneric: '00000000-0000-4000-8000-000000000299',
  viewMonthlyTable: '00000000-0000-4000-8000-000000000301',
  templateGenericFallback: '00000000-0000-4000-8000-000000000499',
  viewGenericFallback: '00000000-0000-4000-8000-000000000399',
} as const;
