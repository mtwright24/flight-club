import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useState } from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import DropDownPicker from "react-native-dropdown-picker";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing } from "../../src/styles/theme";
import {
  getFcScheduleDebugLogPath,
  readFcScheduleDebugLogText,
} from "../dev/fcDevFileLogger";
import { clearAllScheduleMonthUISnapshots } from "../features/crew-schedule/scheduleSnapshotCache";

/** System share message size cap (avoid iOS share failures on huge payloads). */
const FC_DEBUG_LOG_SHARE_MAX = 120_000;

/** Safe on-screen preview: never render more than this in a single Text node. */
const FC_DEBUG_LOG_UI_PREVIEW_TAIL = 10_000;

/** When filtering by tag, cap rendered preview to the end of the filtered blob. */
const FC_DEBUG_LOG_UI_FILTER_PREVIEW_MAX = 12_000;

const FC_DEBUG_LOG_FILTER_TAGS = [
  "FC_LAYOVER_COLUMN_AUDIT",
  "FC_RAW_PAIRING_DETAIL_INDEX_AUDIT",
  "FC_HYBRID_ROW_GAPS",
  "FC_HYBRID_CALENDAR_ROWS",
  "FC_CAL_LEDGER_BLOCKED",
  "FC_RAW_HTML_READ_CHECK",
] as const;

type DebugLogFilterTag = (typeof FC_DEBUG_LOG_FILTER_TAGS)[number];

function filterLogLinesContaining(
  full: string,
  tag: string,
): { joined: string; lineCount: number } {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i <= full.length; i += 1) {
    if (i === full.length || full[i] === "\n") {
      const line = full.slice(start, i);
      if (line.includes(tag)) lines.push(line);
      start = i + 1;
    }
  }
  return { joined: lines.join("\n"), lineCount: lines.length };
}

/** True when this native binary includes Expo’s clipboard module (avoid requiring JS if not). */
function nativeExpoClipboardLinked(): boolean {
  if (Platform.OS === "web") return false;
  const mod = (NativeModules as Record<string, unknown>).ExpoClipboard;
  return mod != null && typeof mod === "object";
}

/**
 * Clipboard: web uses the browser API. Native uses expo-clipboard only when the native module
 * is present; otherwise `require("expo-clipboard")` throws during load and can bypass catches.
 */
async function copyStringToClipboardWithFallback(text: string): Promise<
  "clipboard" | "share" | "failed"
> {
  if (Platform.OS === "web") {
    try {
      await navigator.clipboard.writeText(text);
      return "clipboard";
    } catch {
      return "failed";
    }
  }

  if (nativeExpoClipboardLinked()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { setStringAsync } = require("expo-clipboard") as {
        setStringAsync: (s: string) => Promise<void>;
      };
      await setStringAsync(text);
      return "clipboard";
    } catch {
      /* native module flaky — fall through to share */
    }
  }

  try {
    const snippet =
      text.length > FC_DEBUG_LOG_SHARE_MAX
        ? text.slice(-FC_DEBUG_LOG_SHARE_MAX) +
          "\n…[truncated for share — rebuild dev client to link expo-clipboard for one-tap copy]"
        : text;
    await Share.share({ message: snippet, title: "fc-schedule-debug.log" });
    return "share";
  } catch {
    return "failed";
  }
}

const GOOGLE_PLACES_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || "YOUR_GOOGLE_PLACES_API_KEY";
const stateOptions = [
  "",
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

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
    legal_first_name: "",
    legal_last_name: "",
    email: "",
    phone: "",
    address_line_1: "",
    address_line_2: "",
    zip_code: "",
    city: "",
    state: "",
    login_provider: "google",
    avatar_url: "",
    autoplay_media: true,
    sound_vibration: true,
  } as Profile);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState("light");
  const [stateOpen, setStateOpen] = useState(false);
  const [stateValue, setStateValue] = useState(profile.state || "");
  const [stateItems, setStateItems] = useState([
    { label: "Select State", value: "" },
    ...stateOptions.filter(Boolean).map((s) => ({ label: s, value: s })),
  ]);
  const [showPassword, setShowPassword] = useState(false);
  const [scheduleDebugLogModal, setScheduleDebugLogModal] = useState<{
    visible: boolean;
    loading: boolean;
    pathLine: string;
    fullText: string;
    error: string | null;
    byteHint: string;
  }>({
    visible: false,
    loading: false,
    pathLine: "",
    fullText: "",
    error: null,
    byteHint: "",
  });
  const [scheduleLogFilterTag, setScheduleLogFilterTag] = useState<
    DebugLogFilterTag | null
  >(null);

  const scheduleLogPreview = React.useMemo(() => {
    if (!scheduleDebugLogModal.visible || scheduleDebugLogModal.loading) {
      return null;
    }
    if (scheduleDebugLogModal.error) return null;

    const full = scheduleDebugLogModal.fullText;
    const tag = scheduleLogFilterTag;

    if (!tag) {
      const n = FC_DEBUG_LOG_UI_PREVIEW_TAIL;
      const slice = full.length <= n ? full : full.slice(-n);
      const label =
        full.length === 0
          ? "Log file is empty."
          : full.length <= n
            ? `Showing all ${full.length.toLocaleString()} characters.`
            : `Showing last ${slice.length.toLocaleString()} of ${full.length.toLocaleString()} characters.`;
      return {
        previewText: slice.length ? slice : "(empty)",
        label,
      };
    }

    const { joined, lineCount } = filterLogLinesContaining(full, tag);
    const maxP = FC_DEBUG_LOG_UI_FILTER_PREVIEW_MAX;
    if (lineCount === 0) {
      return {
        previewText: "(no matching lines)",
        label: `Filter: ${tag} — no matching lines (file has ${full.length.toLocaleString()} characters).`,
      };
    }
    const slice = joined.length <= maxP ? joined : joined.slice(-maxP);
    const label =
      joined.length <= maxP
        ? `Filter: ${tag} — ${lineCount} matching lines, ${joined.length.toLocaleString()} characters (all shown).`
        : `Filter: ${tag} — ${lineCount} matching lines, ${joined.length.toLocaleString()} characters total; showing last ${slice.length.toLocaleString()}.`;

    return {
      previewText: slice,
      label,
    };
  }, [
    scheduleDebugLogModal.visible,
    scheduleDebugLogModal.loading,
    scheduleDebugLogModal.error,
    scheduleDebugLogModal.fullText,
    scheduleLogFilterTag,
  ]);

  const openScheduleDebugLogModal = React.useCallback(() => {
    setScheduleLogFilterTag(null);
    setScheduleDebugLogModal({
      visible: true,
      loading: true,
      pathLine: "",
      fullText: "",
      error: null,
      byteHint: "",
    });
    void (async () => {
      const path = getFcScheduleDebugLogPath();
      const pathLine =
        path ?? "(unavailable — cacheDirectory is null, e.g. web preview)";
      try {
        const text = await readFcScheduleDebugLogText();
        setScheduleDebugLogModal({
          visible: true,
          loading: false,
          pathLine,
          fullText: text,
          error: null,
          byteHint: `${text.length.toLocaleString()} characters in file`,
        });
      } catch (e) {
        setScheduleDebugLogModal({
          visible: true,
          loading: false,
          pathLine,
          fullText: "",
          error: e instanceof Error ? e.message : "Failed to read log file.",
          byteHint: "—",
        });
      }
    })();
  }, []);

  const closeScheduleDebugLogModal = React.useCallback(() => {
    setScheduleLogFilterTag(null);
    setScheduleDebugLogModal({
      visible: false,
      loading: false,
      pathLine: "",
      fullText: "",
      error: null,
      byteHint: "",
    });
  }, []);

  const shareScheduleDebugLogFromModal = React.useCallback(async () => {
    const { pathLine, fullText } = scheduleDebugLogModal;
    const snippet =
      fullText.length > FC_DEBUG_LOG_SHARE_MAX
        ? fullText.slice(-FC_DEBUG_LOG_SHARE_MAX) +
          `\n…[share truncated: last ${FC_DEBUG_LOG_SHARE_MAX.toLocaleString()} of ${fullText.length.toLocaleString()} chars — use “Copy full log” for entire file]`
        : fullText;
    try {
      await Share.share({
        title: "fc-schedule-debug.log",
        message: `${pathLine}\n\n---\n\n${snippet || "(empty)"}`,
      });
    } catch {
      /* dismissed */
    }
  }, [scheduleDebugLogModal]);

  const copyFullScheduleDebugLog = React.useCallback(async () => {
    const t = scheduleDebugLogModal.fullText;
    if (scheduleDebugLogModal.error) {
      Alert.alert("Cannot copy", scheduleDebugLogModal.error);
      return;
    }
    if (!t.length) {
      Alert.alert("Nothing to copy", "Log file is empty.");
      return;
    }
    const result = await copyStringToClipboardWithFallback(t);
    if (result === "clipboard") {
      Alert.alert(
        "Copied",
        `Full log (${t.length.toLocaleString()} characters) copied to clipboard.`,
      );
    } else if (result === "share") {
      Alert.alert(
        "Share sheet",
        "Clipboard is not available in this dev build. The log was opened in the share sheet so you can copy or save it there. Rebuild the dev client (expo-clipboard is included) for one-tap clipboard copy.",
      );
    } else {
      Alert.alert("Copy failed", "Could not copy or share.");
    }
  }, [scheduleDebugLogModal.fullText, scheduleDebugLogModal.error]);

  const copyPreviewScheduleDebugLog = React.useCallback(async () => {
    if (!scheduleLogPreview?.previewText) {
      Alert.alert("Nothing to copy", "No preview text available.");
      return;
    }
    const preview = scheduleLogPreview.previewText;
    const result = await copyStringToClipboardWithFallback(preview);
    if (result === "clipboard") {
      Alert.alert(
        "Copied",
        `Preview (${preview.length.toLocaleString()} characters) copied.`,
      );
    } else if (result === "share") {
      Alert.alert(
        "Share sheet",
        "Clipboard is not available in this dev build. Use the share sheet to copy the preview. Rebuild the dev client for direct clipboard.",
      );
    } else {
      Alert.alert("Copy failed", "Could not copy or share.");
    }
  }, [scheduleLogPreview]);

  React.useEffect(() => {
    setProfile((p: Profile) => ({ ...p, state: stateValue }));
  }, [stateValue]);

  const reloadFromStorage = React.useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem("account_settings");
      if (saved) setProfile(JSON.parse(saved));
    } catch {
      /* keep current */
    }
  }, []);

  React.useEffect(() => {
    void reloadFromStorage();
  }, [reloadFromStorage]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await AsyncStorage.setItem("account_settings", JSON.stringify(profile));
      Alert.alert("Saved", "Your settings have been saved.");
    } catch (e) {
      Alert.alert("Error", "Failed to save settings.");
    }
    setSaving(false);
  };

  // Keyboard avoidance and dismiss
  const keyboardVerticalOffset = Platform.OS === "ios" ? 80 : 0;

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }}>
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" color={colors.headerRed} />
        </View>
      </SafeAreaView>
    );
  }

  // FlatList sections, GooglePlacesAutocomplete is its own item
  const sections: Section[] = [
    {
      key: "header",
      render: () => (
        <View style={styles.headerBar}>
          <Text style={styles.title}>Account & Settings</Text>
        </View>
      ),
    },
    {
      key: "personal",
      render: () => (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Info</Text>
          <View style={styles.field}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={styles.input}
              value={profile.legal_first_name}
              onChangeText={(v: string) =>
                setProfile((p: Profile) => ({ ...p, legal_first_name: v }))
              }
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Last Name</Text>
            <TextInput
              style={styles.input}
              value={profile.legal_last_name}
              onChangeText={(v: string) =>
                setProfile((p: Profile) => ({ ...p, legal_last_name: v }))
              }
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={profile.email}
              onChangeText={(v: string) =>
                setProfile((p: Profile) => ({ ...p, email: v }))
              }
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={profile.phone}
              onChangeText={(v: string) =>
                setProfile((p: Profile) => ({ ...p, phone: v }))
              }
              keyboardType="phone-pad"
            />
          </View>
        </View>
      ),
    },
    {
      key: "address",
      render: () => (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Address</Text>
        </View>
      ),
    },
    {
      key: "autocomplete",
      render: () => (
        <View style={styles.section}>
          <GooglePlacesAutocomplete
            placeholder="Start typing your address..."
            minLength={3}
            fetchDetails={true}
            onPress={(data: any, details: any = null) => {
              let city = profile.city;
              let zip = profile.zip_code;
              if (details && details.address_components) {
                for (const comp of details.address_components as Array<{
                  types: string[];
                  long_name: string;
                }>) {
                  if (comp.types.includes("locality")) city = comp.long_name;
                  if (comp.types.includes("postal_code")) zip = comp.long_name;
                }
              }
              setProfile((p: Profile) => ({
                ...p,
                address_line_1: data.description,
                city,
                zip_code: zip,
              }));
            }}
            query={{
              key: GOOGLE_PLACES_API_KEY,
              language: "en",
              components: "country:us",
            }}
            styles={{
              textInput: styles.input,
              listView: { backgroundColor: "#fff", zIndex: 10, maxHeight: 200 },
              row: { backgroundColor: "#fff" },
            }}
            enablePoweredByContainer={false}
            debounce={200}
            textInputProps={{
              value: profile.address_line_1,
              onChangeText: (text: string) =>
                setProfile({ ...profile, address_line_1: text }),
              autoCapitalize: "words",
            }}
          />
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
          <View style={styles.field}>
            <Text style={styles.label}>City</Text>
            <TextInput
              style={styles.input}
              value={profile.city}
              onChangeText={(v: string) =>
                setProfile((p: Profile) => ({ ...p, city: v }))
              }
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Zip Code</Text>
            <TextInput
              style={styles.input}
              value={profile.zip_code}
              onChangeText={(v: string) =>
                setProfile((p: Profile) => ({ ...p, zip_code: v }))
              }
              keyboardType="numeric"
            />
          </View>
        </View>
      ),
    },
    {
      key: "preferences",
      render: () => (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <Pressable
            style={styles.linkRow}
            onPress={() => router.push("/home-shortcuts")}
          >
            <Text style={styles.linkLabel}>Home screen shortcuts</Text>
          </Pressable>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Autoplay Media</Text>
            <Switch
              value={profile.autoplay_media}
              onValueChange={(v: boolean) =>
                setProfile((p: Profile) => ({ ...p, autoplay_media: v }))
              }
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Sound & Vibration</Text>
            <Switch
              value={profile.sound_vibration}
              onValueChange={(v: boolean) =>
                setProfile((p: Profile) => ({ ...p, sound_vibration: v }))
              }
            />
          </View>
        </View>
      ),
    },
    {
      key: "theme",
      render: () => (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Theme</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Dark Mode</Text>
            <Switch
              value={theme === "dark"}
              onValueChange={(v: boolean) => setTheme(v ? "dark" : "light")}
            />
          </View>
        </View>
      ),
    },
    {
      key: "provider",
      render: () => (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Provider</Text>
          <Text style={styles.valueText}>
            {profile.login_provider === "google"
              ? "Google"
              : profile.login_provider === "apple"
                ? "Apple"
                : "Email"}
          </Text>
        </View>
      ),
    },
    {
      key: "changePassword",
      render: () => (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Change Password</Text>
          <Pressable
            style={styles.linkRow}
            onPress={() =>
              Alert.alert("Change Password", "Password change flow here.")
            }
          >
            <Text style={styles.linkLabel}>Change Password</Text>
          </Pressable>
        </View>
      ),
    },
    {
      key: "privacy",
      render: () => (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Safety</Text>
          <Pressable
            style={styles.linkRow}
            onPress={() =>
              Alert.alert("Privacy & Safety", "Go to privacy & safety screen.")
            }
          >
            <Text style={styles.linkLabel}>Privacy & Safety Settings</Text>
          </Pressable>
        </View>
      ),
    },
    ...(typeof __DEV__ !== "undefined" && __DEV__
      ? ([
          {
            key: "dev_schedule_display_cache",
            render: () => (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Developer</Text>
                <Pressable
                  style={styles.linkRow}
                  onPress={() => {
                    clearAllScheduleMonthUISnapshots();
                    Alert.alert(
                      "Display cache cleared",
                      "In-memory classic/list schedule UI snapshots were cleared. Imported trips and crew_schedule rows were not changed.",
                    );
                  }}
                >
                  <Text style={styles.linkLabel}>
                    Clear schedule display cache
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.linkRow}
                  onPress={openScheduleDebugLogModal}
                >
                  <Text style={styles.linkLabel}>
                    View / share fc-schedule-debug.log
                  </Text>
                </Pressable>
              </View>
            ),
          },
        ] satisfies Section[])
      : []),
    {
      key: "logout",
      render: () => (
        <View style={styles.section}>
          <Pressable
            style={styles.logoutBtn}
            onPress={() => Alert.alert("Log Out", "Log out flow here.")}
          >
            <Text style={styles.logoutText}>Log Out</Text>
          </Pressable>
          <Pressable
            style={styles.deleteBtn}
            onPress={() =>
              Alert.alert("Delete Account", "Delete account flow here.")
            }
          >
            <Text style={styles.deleteText}>Delete Account</Text>
          </Pressable>
        </View>
      ),
    },
    {
      key: "save",
      render: () => (
        <Pressable
          style={styles.saveButton}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveText}>{saving ? "Saving..." : "Save"}</Text>
        </Pressable>
      ),
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }}>
      <Modal
        visible={scheduleDebugLogModal.visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeScheduleDebugLogModal}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }}>
          <View style={styles.debugLogModalHeader}>
            <Pressable
              onPress={closeScheduleDebugLogModal}
              style={styles.debugLogModalHeaderBtn}
            >
              <Text style={styles.debugLogModalHeaderBtnText}>Close</Text>
            </Pressable>
            <Text style={styles.debugLogModalTitle}>fc-schedule-debug.log</Text>
            <Pressable
              onPress={() => void shareScheduleDebugLogFromModal()}
              style={styles.debugLogModalHeaderBtn}
            >
              <Text style={styles.debugLogModalHeaderBtnText}>Share…</Text>
            </Pressable>
          </View>

          <Text style={styles.debugLogHint}>
            {scheduleDebugLogModal.byteHint}
            {scheduleDebugLogModal.error
              ? ` · ${scheduleDebugLogModal.error}`
              : ""}
          </Text>

          <Text style={styles.debugLogSectionLabel}>Path</Text>
          <View style={styles.debugLogPathBox}>
            <ScrollView horizontal keyboardShouldPersistTaps="handled">
              <Text selectable style={styles.debugLogSelectable}>
                {scheduleDebugLogModal.pathLine || "—"}
              </Text>
            </ScrollView>
          </View>

          {scheduleDebugLogModal.loading ? (
            <View style={styles.debugLogLoading}>
              <ActivityIndicator size="large" color={colors.headerRed} />
              <Text style={styles.debugLogLoadingLabel}>Loading log…</Text>
            </View>
          ) : scheduleDebugLogModal.error ? (
            <Text style={styles.debugLogErrorText}>{scheduleDebugLogModal.error}</Text>
          ) : (
            <>
              {scheduleLogPreview ? (
                <Text style={styles.debugLogPreviewBanner}>{scheduleLogPreview.label}</Text>
              ) : null}

              <Text style={styles.debugLogSectionLabel}>Filter by tag</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.debugLogChipScroll}
                contentContainerStyle={styles.debugLogChipScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <Pressable
                  onPress={() => setScheduleLogFilterTag(null)}
                  style={[
                    styles.debugLogChip,
                    scheduleLogFilterTag === null && styles.debugLogChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.debugLogChipText,
                      scheduleLogFilterTag === null && styles.debugLogChipTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    All
                  </Text>
                </Pressable>
                {FC_DEBUG_LOG_FILTER_TAGS.map((tag) => (
                  <Pressable
                    key={tag}
                    onPress={() =>
                      setScheduleLogFilterTag((cur) => (cur === tag ? null : tag))
                    }
                    style={[
                      styles.debugLogChip,
                      scheduleLogFilterTag === tag && styles.debugLogChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.debugLogChipText,
                        scheduleLogFilterTag === tag && styles.debugLogChipTextSelected,
                      ]}
                      numberOfLines={2}
                    >
                      {tag}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.debugLogActionRow}>
                <Pressable
                  style={styles.debugLogActionBtn}
                  onPress={() => void copyFullScheduleDebugLog()}
                >
                  <Text style={styles.debugLogActionBtnText}>Copy full log</Text>
                </Pressable>
                <Pressable
                  style={styles.debugLogActionBtn}
                  onPress={() => void copyPreviewScheduleDebugLog()}
                  disabled={!scheduleLogPreview?.previewText}
                >
                  <Text style={styles.debugLogActionBtnText}>Copy preview</Text>
                </Pressable>
              </View>

              <Text style={styles.debugLogSectionLabel}>Log (preview only)</Text>
              <ScrollView
                style={styles.debugLogScroll}
                contentContainerStyle={styles.debugLogScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {scheduleLogPreview ? (
                  <Text selectable style={styles.debugLogSelectable}>
                    {scheduleLogPreview.previewText}
                  </Text>
                ) : (
                  <Text style={styles.debugLogSelectable}>(no preview)</Text>
                )}
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Modal>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.cardBg,
    marginBottom: spacing.md,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  field: { marginBottom: spacing.md },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.screenBg,
  },
  valueText: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  toggleLabel: { fontSize: 15, color: colors.textPrimary },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  linkLabel: { fontSize: 15, color: colors.accentBlue, fontWeight: "600" },
  logoutBtn: {
    backgroundColor: colors.headerRed,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  logoutText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  deleteBtn: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.headerRed,
  },
  deleteText: { fontSize: 16, fontWeight: "600", color: colors.headerRed },
  saveButton: {
    backgroundColor: colors.headerRed,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    margin: spacing.md,
  },
  saveText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  debugLogModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  debugLogModalHeaderBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  debugLogModalHeaderBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.accentBlue,
  },
  debugLogModalTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  debugLogHint: {
    fontSize: 12,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  debugLogSectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  debugLogScroll: { flex: 1 },
  debugLogScrollContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  debugLogSelectable: {
    fontSize: 11,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    color: colors.textPrimary,
  },
  debugLogPathBox: {
    marginHorizontal: spacing.md,
    maxHeight: 44,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.cardBg,
  },
  debugLogPreviewBanner: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  debugLogChipScroll: { maxHeight: 44, marginBottom: spacing.sm },
  debugLogChipScrollContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    alignItems: "center",
    flexDirection: "row",
  },
  debugLogChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.cardBg,
    maxWidth: 200,
  },
  debugLogChipSelected: {
    borderColor: colors.accentBlue,
    backgroundColor: `${colors.accentBlue}18`,
  },
  debugLogChipText: { fontSize: 10, color: colors.textPrimary, fontWeight: "600" },
  debugLogChipTextSelected: { color: colors.accentBlue },
  debugLogActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  debugLogActionBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentBlue,
    backgroundColor: colors.cardBg,
  },
  debugLogActionBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.accentBlue,
  },
  debugLogLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  debugLogLoadingLabel: { fontSize: 14, color: colors.textSecondary },
  debugLogErrorText: {
    fontSize: 14,
    color: colors.headerRed,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
});
