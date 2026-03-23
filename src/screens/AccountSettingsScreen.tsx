



import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';


import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, Text, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../../src/styles/theme';

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || 'YOUR_GOOGLE_PLACES_API_KEY';
const stateOptions = ['', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

export default function AccountSettingsScreen() {
  const router = useRouter();
    type Section = { key: string; render: () => React.ReactElement };
  type Profile = {
    legal_first_name: string;
    legal_last_name: string;
    email: string;
    phone: string;
    address_line_1: string;
    address_line_2: string;
    zip_code: string;
    city: string;
    state: string;
    login_provider: string;
    avatar_url: string | null;
    autoplay_media: boolean;
    sound_vibration: boolean;
  };
  const [profile, setProfile] = useState({
    legal_first_name: '',
    legal_last_name: '',
    email: '',
    phone: '',
    address_line_1: '',
    address_line_2: '',
    zip_code: '',
    city: '',
    state: '',
    login_provider: 'google',
    avatar_url: '',
    autoplay_media: true,
    sound_vibration: true,
  } as Profile);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState('light');
  const [stateOpen, setStateOpen] = useState(false);
  const [stateValue, setStateValue] = useState(profile.state || '');
  const [stateItems, setStateItems] = useState([
    { label: 'Select State', value: '' },
    ...stateOptions.filter(Boolean).map((s) => ({ label: s, value: s }))
  ]);
  const [showPassword, setShowPassword] = useState(false);

  React.useEffect(() => {
    setProfile((p: Profile) => ({ ...p, state: stateValue }));
  }, [stateValue]);

  // Simulate persistent save (AsyncStorage for React Native)
  React.useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('account_settings');
        if (saved) setProfile(JSON.parse(saved));
      } catch (e) {
        // handle error
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await AsyncStorage.setItem('account_settings', JSON.stringify(profile));
      Alert.alert('Saved', 'Your settings have been saved.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save settings.');
    }
    setSaving(false);
  };

  // Keyboard avoidance and dismiss
  const keyboardVerticalOffset = Platform.OS === 'ios' ? 80 : 0;


  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.headerRed} />
        </View>
      </SafeAreaView>
    );
  }

  // FlatList sections, GooglePlacesAutocomplete is its own item
  const sections: Section[] = [
    { key: 'header', render: () => (
      <View style={styles.headerBar}>
        <Text style={styles.title}>Account & Settings</Text>
      </View>
    ) },
    { key: 'personal', render: () => (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Personal Info</Text>
        <View style={styles.field}><Text style={styles.label}>First Name</Text>
          <TextInput style={styles.input} value={profile.legal_first_name} onChangeText={(v: string) => setProfile((p: Profile) => ({ ...p, legal_first_name: v }))} />
        </View>
        <View style={styles.field}><Text style={styles.label}>Last Name</Text>
          <TextInput style={styles.input} value={profile.legal_last_name} onChangeText={(v: string) => setProfile((p: Profile) => ({ ...p, legal_last_name: v }))} />
        </View>
        <View style={styles.field}><Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={profile.email} onChangeText={(v: string) => setProfile((p: Profile) => ({ ...p, email: v }))} keyboardType="email-address" autoCapitalize="none" />
        </View>
        <View style={styles.field}><Text style={styles.label}>Phone</Text>
          <TextInput style={styles.input} value={profile.phone} onChangeText={(v: string) => setProfile((p: Profile) => ({ ...p, phone: v }))} keyboardType="phone-pad" />
        </View>
      </View>
    ) },
    { key: 'address', render: () => (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Address</Text>
      </View>
    ) },
    { key: 'autocomplete', render: () => (
      <View style={styles.section}>
        <GooglePlacesAutocomplete
          placeholder="Start typing your address..."
          minLength={3}
          fetchDetails={true}
          onPress={(data: any, details: any = null) => {
            let city = profile.city;
            let zip = profile.zip_code;
            if (details && details.address_components) {
              for (const comp of details.address_components as Array<{ types: string[]; long_name: string }>) {
                if (comp.types.includes('locality')) city = comp.long_name;
                if (comp.types.includes('postal_code')) zip = comp.long_name;
              }
            }
            setProfile((p: Profile) => ({ ...p, address_line_1: data.description, city, zip_code: zip }));
          }}
          query={{
            key: GOOGLE_PLACES_API_KEY,
            language: 'en',
            components: 'country:us',
          }}
          styles={{
            textInput: styles.input,
            listView: { backgroundColor: '#fff', zIndex: 10, maxHeight: 200 },
            row: { backgroundColor: '#fff' },
          }}
          enablePoweredByContainer={false}
          debounce={200}
          textInputProps={{
            value: profile.address_line_1,
            onChangeText: (text: string) => setProfile({ ...profile, address_line_1: text }),
            autoCapitalize: 'words',
          }}
        />
        <View style={styles.field}><Text style={styles.label}>State</Text>
          <DropDownPicker
            open={stateOpen}
            value={stateValue}
            items={stateItems}
            setOpen={setStateOpen}
            setValue={setStateValue}
            setItems={setStateItems}
            searchable={true}
            placeholder="Select State"
            style={{ ...styles.input, zIndex: 1000 }}
            dropDownContainerStyle={{ zIndex: 2000 }}
            listMode="SCROLLVIEW"
          />
        </View>
        <View style={styles.field}><Text style={styles.label}>City</Text>
          <TextInput style={styles.input} value={profile.city} onChangeText={(v: string) => setProfile((p: Profile) => ({ ...p, city: v }))} />
        </View>
        <View style={styles.field}><Text style={styles.label}>Zip Code</Text>
          <TextInput style={styles.input} value={profile.zip_code} onChangeText={(v: string) => setProfile((p: Profile) => ({ ...p, zip_code: v }))} keyboardType="numeric" />
        </View>
      </View>
    ) },
    { key: 'preferences', render: () => (
      <View style={styles.section}><Text style={styles.sectionTitle}>Preferences</Text>
        <Pressable style={styles.linkRow} onPress={() => router.push('/home-shortcuts')}>
          <Text style={styles.linkLabel}>Home screen shortcuts</Text>
        </Pressable>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Autoplay Media</Text>
          <Switch value={profile.autoplay_media} onValueChange={(v: boolean) => setProfile((p: Profile) => ({ ...p, autoplay_media: v }))} /></View>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Sound & Vibration</Text>
          <Switch value={profile.sound_vibration} onValueChange={(v: boolean) => setProfile((p: Profile) => ({ ...p, sound_vibration: v }))} /></View>
      </View>
    ) },
    { key: 'theme', render: () => (
      <View style={styles.section}><Text style={styles.sectionTitle}>Theme</Text>
        <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Dark Mode</Text>
          <Switch value={theme === 'dark'} onValueChange={(v: boolean) => setTheme(v ? 'dark' : 'light')} /></View>
      </View>
    ) },
    { key: 'provider', render: () => (
      <View style={styles.section}><Text style={styles.sectionTitle}>Provider</Text>
        <Text style={styles.valueText}>{profile.login_provider === 'google' ? 'Google' : profile.login_provider === 'apple' ? 'Apple' : 'Email'}</Text>
      </View>
    ) },
    { key: 'changePassword', render: () => (
      <View style={styles.section}><Text style={styles.sectionTitle}>Change Password</Text>
        <Pressable style={styles.linkRow} onPress={() => Alert.alert('Change Password', 'Password change flow here.') }>
          <Text style={styles.linkLabel}>Change Password</Text>
        </Pressable>
      </View>
    ) },
    { key: 'privacy', render: () => (
      <View style={styles.section}><Text style={styles.sectionTitle}>Privacy & Safety</Text>
        <Pressable style={styles.linkRow} onPress={() => Alert.alert('Privacy & Safety', 'Go to privacy & safety screen.') }>
          <Text style={styles.linkLabel}>Privacy & Safety Settings</Text>
        </Pressable>
      </View>
    ) },
    { key: 'logout', render: () => (
      <View style={styles.section}>
        <Pressable style={styles.logoutBtn} onPress={() => Alert.alert('Log Out', 'Log out flow here.') }>
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
        <Pressable style={styles.deleteBtn} onPress={() => Alert.alert('Delete Account', 'Delete account flow here.') }>
          <Text style={styles.deleteText}>Delete Account</Text>
        </Pressable>
      </View>
    ) },
    { key: 'save', render: () => (
      <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
      </Pressable>
    ) },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <FlatList
            data={sections}
            renderItem={({ item }: { item: Section }) => item.render()}
            keyExtractor={(item: Section) => item.key}
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          />
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.cardBg, marginBottom: spacing.md },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, color: colors.textPrimary, backgroundColor: colors.screenBg },
  valueText: { fontSize: 15, color: colors.textSecondary, marginBottom: spacing.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  toggleLabel: { fontSize: 15, color: colors.textPrimary },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  linkLabel: { fontSize: 15, color: colors.accentBlue, fontWeight: '600' },
  logoutBtn: { backgroundColor: colors.headerRed, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  deleteBtn: { backgroundColor: colors.cardBg, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm, borderWidth: 1, borderColor: colors.headerRed },
  deleteText: { fontSize: 16, fontWeight: '600', color: colors.headerRed },
  saveButton: { backgroundColor: colors.headerRed, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', margin: spacing.md },
  saveText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});




