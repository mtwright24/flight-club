/**
 * Schedule Intelligence Platform — client reads for templates, dictionary, and user memory.
 * Parsing runs on the Edge Function; this module only surfaces DB reference data to the app.
 */

import { supabase } from '../../lib/supabaseClient';

export type ScheduleTemplateRow = {
  id: string;
  template_name: string;
  parser_key: string;
  airline_id: string | null;
  role_id: string | null;
  software_id: string | null;
  view_type_id: string;
  active: boolean;
};

export type ScheduleCodeRow = {
  id: string;
  code: string;
  meaning: string;
  category: string | null;
  priority: number;
  airline_id: string | null;
  software_id: string | null;
};

export type UserScheduleProfileApi = {
  airline_id: string | null;
  role_id: string | null;
  software_id: string | null;
  default_view_type_id: string | null;
  last_successful_template_id: string | null;
  last_successful_month_key: string | null;
};

export async function fetchScheduleTemplates(): Promise<ScheduleTemplateRow[]> {
  const { data, error } = await supabase
    .from('schedule_templates')
    .select('id, template_name, parser_key, airline_id, role_id, software_id, view_type_id, active')
    .eq('active', true)
    .order('template_name');
  if (error) throw error;
  return (data ?? []) as ScheduleTemplateRow[];
}

export async function fetchScheduleCodeDictionary(): Promise<ScheduleCodeRow[]> {
  const { data, error } = await supabase
    .from('schedule_code_dictionary')
    .select('id, code, meaning, category, priority, airline_id, software_id')
    .eq('active', true)
    .order('priority', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduleCodeRow[];
}

export async function fetchMyScheduleProfile(): Promise<UserScheduleProfileApi | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from('user_schedule_profiles')
    .select('airline_id, role_id, software_id, default_view_type_id, last_successful_template_id, last_successful_month_key')
    .eq('user_id', u.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as UserScheduleProfileApi | null;
}
