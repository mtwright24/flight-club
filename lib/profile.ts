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

  const { error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    const isMissingColumn = (col: string) =>
      error.code === 'PGRST204' &&
      typeof error.message === 'string' &&
      error.message.includes(`'${col}'`);

    // If certain optional columns don't exist yet (older DB without migrations), retry without them
    const retryPayload = { ...payload } as Record<string, any>;
    let shouldRetry = false;

    if (isMissingColumn('bio') && Object.prototype.hasOwnProperty.call(retryPayload, 'bio')) {
      console.warn('upsertMyProfile: bio column missing on profiles table; retrying without bio');
      delete retryPayload.bio;
      shouldRetry = true;
    }
    if (isMissingColumn('display_name') && Object.prototype.hasOwnProperty.call(retryPayload, 'display_name')) {
      console.warn('upsertMyProfile: display_name column missing on profiles table; retrying without display_name');
      delete retryPayload.display_name;
      shouldRetry = true;
    }

    if (shouldRetry) {
      const { error: retryError } = await supabase
        .from('profiles')
        .upsert(retryPayload, { onConflict: 'id' });
      if (retryError) {
        console.error('upsertMyProfile retry error', { userId: user.id, error: retryError, payload: retryPayload });
        return { success: false, error: retryError };
      }
      return { success: true };
    }

    console.error('upsertMyProfile error', { userId: user.id, error, payload });
    return { success: false, error };
  }

  return { success: true };
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
