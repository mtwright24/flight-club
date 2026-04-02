import { supabase } from '../src/lib/supabaseClient';

export async function getMyProfile() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    console.error('getMyProfile auth error', authError);
    throw authError;
  }
  if (!user) throw new Error('No user logged in');

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('getMyProfile query error', error);
    throw error;
  }

  // If no row yet, return a minimal default shape so first-time users can edit & save.
  return (
    data || {
      id: user.id,
      display_name: '',
      full_name: '',
      first_name: '',
      username: '',
      bio: '',
      role: '',
      airline: '',
      base: '',
      fleet: '',
      aviation_since_year: '',
      commuter_status: '',
      languages: '',
      hometown: '',
      lives_in: '',
      favorite_layover_city: '',
      interests: '',
      avatar_url: null,
      cover_url: null,
    }
  );
}

export async function upsertMyProfile(updates: Record<string, any>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    console.error('upsertMyProfile auth error', authError);
    return { success: false, error: authError };
  }
  if (!user) return { success: false, error: new Error('No user logged in') };

  const payload: Record<string, any> = {
    id: user.id,
    ...updates,
  };

  const attemptPayload = { ...payload } as Record<string, any>;
  for (let attempt = 0; attempt < 8; attempt++) {
    const { error } = await supabase
      .from('profiles')
      .upsert(attemptPayload, { onConflict: 'id' });

    if (!error) return { success: true };

    const message = String(error?.message || '');
    if (error.code !== 'PGRST204') {
      console.error('upsertMyProfile error', { userId: user.id, error, payload: attemptPayload });
      return { success: false, error };
    }

    const colMatch = message.match(/'([^']+)'/);
    const missingCol = colMatch?.[1];
    if (!missingCol || !Object.prototype.hasOwnProperty.call(attemptPayload, missingCol)) {
      console.error('upsertMyProfile missing-column parse error', { userId: user.id, error, payload: attemptPayload });
      return { success: false, error };
    }

    console.warn(`upsertMyProfile: ${missingCol} column missing on profiles table; retrying without it`);
    delete attemptPayload[missingCol];
  }

  return { success: false, error: new Error('Profile update failed after column compatibility retries.') };

}

export async function updateProfile(updates: Record<string, any>) {
  // Backwards-compatible wrapper for existing callers
  const result = await upsertMyProfile({
    ...updates,
    updated_at: new Date().toISOString(),
  });
  return result.success;
}

export async function checkUsernameAvailable(username: string) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    if (authError) console.error('checkUsernameAvailable auth error', authError);
    return false;
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .neq('id', user.id);
  if (error) {
    console.error('checkUsernameAvailable query error', error);
    return false;
  }
  return (data || []).length === 0;
}
