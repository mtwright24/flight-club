import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { supabase } from '../../src/lib/supabaseClient';
import { colors, radius, spacing } from '../../src/styles/theme';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';

export default function CompleteSetupScreen() {
	const router = useRouter();
	const { session } = useAuth();
	const userId = session?.user?.id;
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [missing, setMissing] = useState<string[]>([]);
	const [profile, setProfile] = useState({
		years_of_service: '',
		fleet: '',
		commuter_status: '',
		languages: '',
		hometown: '',
		interests: '',
		recommendations: '',
		personalization: '',
		state: '',
	});

	const loadProfile = useCallback(
		async (opts?: { silent?: boolean }) => {
		if (!userId) return;
		if (!opts?.silent) setLoading(true);
		try {
			const { data, error } = await supabase
				.from('profiles')
				.select('*')
				.eq('id', userId)
				.single();
			if (error) {
				Alert.alert('Error', 'Failed to load profile');
				return;
			}
			setProfile({
				years_of_service: data?.years_of_service || '',
				fleet: data?.fleet || '',
				commuter_status: data?.commuter_status || '',
				languages: data?.languages || '',
				hometown: data?.hometown || '',
				interests: data?.interests || '',
				recommendations: data?.recommendations || '',
				personalization: data?.personalization || '',
				state: data?.state || '',
			});
			const missingFields = [];
			if (!data?.years_of_service) missingFields.push('Years of Service');
			if (!data?.fleet) missingFields.push('Fleet');
			if (!data?.commuter_status) missingFields.push('Commuter Status');
			if (!data?.languages) missingFields.push('Languages');
			if (!data?.hometown) missingFields.push('Hometown/City');
			if (!data?.interests) missingFields.push('Interests/Tags');
			setMissing(missingFields);
		} catch {
			Alert.alert('Error', 'Something went wrong');
		} finally {
			if (!opts?.silent) setLoading(false);
		}
	},
		[userId],
	);

	useEffect(() => {
		void loadProfile();
	}, [loadProfile]);

	const handleSave = async () => {
		if (!userId) return;
		setSaving(true);
		try {
			const { error } = await supabase
				.from('profiles')
				.update({
					years_of_service: profile.years_of_service,
					fleet: profile.fleet,
					commuter_status: profile.commuter_status,
					languages: profile.languages,
					hometown: profile.hometown,
					interests: profile.interests,
					recommendations: profile.recommendations,
					personalization: profile.personalization,
					state: profile.state,
				})
				.eq('id', userId);
			if (error) {
				Alert.alert('Error', 'Failed to save setup');
				return;
			}
			Alert.alert('Success', 'Setup completed!');
			await loadProfile({ silent: true });
		} catch (err) {
			Alert.alert('Error', 'Something went wrong');
		} finally {
			setSaving(false);
		}
	};

	// US States for Picker
	const stateOptions = [
		'', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
	];
	const [stateOpen, setStateOpen] = useState(false);
	const [stateValue, setStateValue] = useState(profile.state || '');
	const [stateItems, setStateItems] = useState(
		[
			{ label: 'Select State', value: '' },
			...stateOptions.filter(Boolean).map((s) => ({ label: s, value: s }))
		]
	);
	useEffect(() => {
		setProfile((p) => ({ ...p, state: stateValue }));
		// eslint-disable-next-line
	}, [stateValue]);

	const { refreshing: completeSetupPullRefreshing, onRefresh: onCompleteSetupPullRefresh } = usePullToRefresh(
		async () => {
			await loadProfile({ silent: true });
		},
	);

	if (loading) {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }} edges={['top', 'bottom', 'left', 'right']}>
				<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
					<ActivityIndicator size="large" color={colors.headerRed} />
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }} edges={['top', 'bottom', 'left', 'right']}>
			<View style={styles.header}>
				<Pressable onPress={() => router.back()} style={styles.headerBtn}>
					<Text style={styles.headerBack}>{'<'}</Text>
				</Pressable>
				<Text style={styles.headerTitle}>Complete Your Setup</Text>
				<View style={{ width: 40 }} />
			</View>
			<KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
				contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={completeSetupPullRefreshing}
						onRefresh={onCompleteSetupPullRefresh}
						colors={REFRESH_CONTROL_COLORS}
						tintColor={REFRESH_TINT}
					/>
				}
			>
				<Text style={styles.sectionTitle}>Missing Items</Text>
				{missing.length === 0 ? (
					<Text style={styles.completeText}>All setup items are complete!</Text>
				) : (
					missing.map((item: string, idx: number) => (
						<Text key={idx} style={styles.missingText}>{item}</Text>
					))
				)}
				<Text style={styles.sectionTitle}>Personalization & Preferences</Text>
				{/* Address Autocomplete */}
				<View style={styles.field}>
					<Text style={styles.label}>Hometown/City</Text>
					<GooglePlacesAutocomplete
						placeholder="Start typing your address..."
						minLength={3}
						fetchDetails={true}
						onPress={(data: any, details: any = null) => {
							let city = profile.hometown;
							if (details && details.address_components) {
								for (const comp of details.address_components as Array<{ types: string[]; long_name: string }>) {
									if (comp.types.includes('locality')) city = comp.long_name;
								}
							}
							setProfile((p) => ({ ...p, hometown: data.description }));
						}}
						query={{
							key: process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || 'YOUR_GOOGLE_PLACES_API_KEY',
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
							value: profile.hometown,
							onChangeText: (text: string) => setProfile({ ...profile, hometown: text }),
							autoCapitalize: 'words',
						}}
					/>
				</View>
				{/* State Dropdown */}
				<View style={styles.field}>
					<Text style={styles.label}>State</Text>
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
				{/* Other fields */}
				{(
					[
						'years_of_service',
						'fleet',
						'commuter_status',
						'languages',
						'interests',
						'recommendations',
						'personalization',
					] as const
				).map((key) => (
					<View style={styles.field} key={key}>
						<Text style={styles.label}>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Text>
						<TextInput
							style={styles.input}
							value={profile[key] || ''}
							onChangeText={(v: string) => setProfile({ ...profile, [key]: v })}
						/>
					</View>
				))}
				<Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
					<Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
				</Pressable>
			</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.cardBg, borderBottomWidth: 1, borderBottomColor: colors.border },
	headerBtn: { padding: spacing.sm },
	headerBack: { fontSize: 18, color: colors.headerRed },
	headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
	sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.md },
	completeText: { fontSize: 15, color: colors.textPrimary, marginBottom: spacing.md },
	missingText: { fontSize: 15, color: colors.error, marginBottom: spacing.xs },
	field: { marginBottom: spacing.md },
	label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
	input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, color: colors.textPrimary, backgroundColor: colors.screenBg },
	saveButton: { backgroundColor: colors.headerRed, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md },
	saveText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
