import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_KEY = 'profileDraft';

export async function saveProfileDraft(draft: any) {
  try {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {
    console.error('Failed to save profile draft', e);
  }
}

export async function getProfileDraft() {
  try {
    const value = await AsyncStorage.getItem(DRAFT_KEY);
    return value ? JSON.parse(value) : null;
  } catch (e) {
    console.error('Failed to load profile draft', e);
    return null;
  }
}

export async function clearProfileDraft() {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
  } catch (e) {
    console.error('Failed to clear profile draft', e);
  }
}
