import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { fcDevMirrorScheduleLogToFile } from "../../../dev/fcDevFileLogger";
import { formatSubmitButtonLabel } from "../../flica-actions/flicaTradeBoardPostRequestCapturedForm";
import {
  buildTradeboardPostRequestPayload,
  dryRunTradeboardPostRequest,
  submitTradeboardPostRequest,
} from "../../flica-actions/flicaTradeBoardPostRequestPayload";
import {
  isValidCompactTradeTypeCode,
  mergeFlicaPostRequestTypeOptions,
} from "../../flica-actions/flicaTradeBoardPostRequestFieldMap";
import type {
  TradeboardPostRequestActivity,
  TradeboardPostRequestComposerState,
  TradeboardPostRequestDryRun,
  TradeboardPostRequestFormParse,
} from "../../flica-actions/flicaTradeBoardPostRequestTypes";
import type { CrewScheduleTrip } from "../types";
import { CREW_HUB_SHEET_SURFACE, SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";
import TradeBoardActivityPickerSheet from "./TradeBoardActivityPickerSheet";

const MONO: TextStyle = Platform.select<TextStyle>({
  ios: { fontFamily: "Menlo" },
  android: { fontFamily: "monospace" },
  default: { fontFamily: "monospace" },
});

const COMMENT_ACCESSORY_ID = "tb-post-request-comment-done";

function CommentKeyboardAccessory() {
  if (Platform.OS !== "ios") return null;
  return (
    <InputAccessoryView nativeID={COMMENT_ACCESSORY_ID}>
      <View style={accessoryStyles.bar}>
        <Pressable onPress={() => Keyboard.dismiss()} style={accessoryStyles.doneBtn} hitSlop={8}>
          <Text style={accessoryStyles.doneTxt}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  formParse: TradeboardPostRequestFormParse | null;
  formLoading: boolean;
  formError: string | null;
  profileBase: string | null;
  profileRole: string | null;
  monthTrips: CrewScheduleTrip[];
  seedActivity?: TradeboardPostRequestActivity | null;
  /** Pre-select compact FLICA code (e.g. R for Trade a Reserve Day). */
  seedRequestType?: string;
  editReqId?: string;
  editTreq?: string;
};

function requestTypeLabel(value: string, options: { value: string; label: string }[]): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function logActivitySelect(activity: TradeboardPostRequestActivity) {
  fcDevMirrorScheduleLogToFile("FC_TB_POST_ACTIVITY_SELECT", activity);
  if (__DEV__) {
    console.log("[FC_TB_POST_ACTIVITY_SELECT]", JSON.stringify(activity));
  }
}

export default function TradeBoardPostRequestComposerSheet({
  visible,
  onClose,
  onSubmitted,
  formParse,
  formLoading,
  formError,
  profileBase,
  profileRole,
  monthTrips: _monthTrips,
  seedActivity,
  seedRequestType,
  editReqId,
  editTreq,
}: Props) {
  const insets = useSafeAreaInsets();
  const [composer, setComposer] = useState<TradeboardPostRequestComposerState | null>(null);
  const [preview, setPreview] = useState<TradeboardPostRequestDryRun | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activityPickerOpen, setActivityPickerOpen] = useState(false);

  const detected = formParse?.detected;
  const requestTypes = useMemo(
    () => mergeFlicaPostRequestTypeOptions(detected?.requestTypes ?? []),
    [detected?.requestTypes],
  );

  useEffect(() => {
    if (!visible || !detected) return;
    const seedCode = String(seedRequestType ?? "").trim().toUpperCase();
    const fromSeed =
      seedCode && isValidCompactTradeTypeCode(seedCode)
        ? requestTypes.find((o) => o.value.toUpperCase() === seedCode)?.value
        : undefined;
    const fromDetected = requestTypes.find(
      (o) => o.value === detected.selectedRequestType,
    )?.value;
    const initialRequestType = fromSeed ?? fromDetected ?? requestTypes[0]?.value ?? "T";
    setComposer({
      requestType: initialRequestType,
      base: detected.base || profileBase?.trim().toUpperCase() || "",
      equipment: detected.equipment,
      position: detected.position || profileRole?.trim().toUpperCase() || "FA",
      comments: detected.comments,
      flicaResponse: detected.flicaResponseChecked || detected.flicaResponseRequired,
      emailResponse: detected.emailResponse,
      emailAddress: detected.emailAddress,
      phoneResponse: detected.phoneResponse,
      phoneNumber: detected.phoneNumber,
      deleteAfter: detected.deleteAfter,
      activities: seedActivity ? [seedActivity] : [],
      reqId: editReqId,
      treq: editTreq,
    });
    setPreview(null);
  }, [
    visible,
    detected,
    profileBase,
    profileRole,
    requestTypes,
    seedActivity,
    seedRequestType,
    editReqId,
    editTreq,
  ]);

  const requestTypeDisplay = useMemo(() => {
    if (!composer) return "";
    return requestTypeLabel(composer.requestType, requestTypes);
  }, [composer, requestTypes]);

  const patchComposer = useCallback((patch: Partial<TradeboardPostRequestComposerState>) => {
    setComposer((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const onPreview = useCallback(() => {
    dismissKeyboard();
    if (!formParse?.ok || !composer) {
      Alert.alert("Post Request", formError ?? "Refresh FLICA first — form not loaded.");
      return;
    }
    const payload = buildTradeboardPostRequestPayload(formParse, composer);
    setPreview(dryRunTradeboardPostRequest(payload));
  }, [composer, dismissKeyboard, formError, formParse]);

  const onConfirmSubmit = useCallback(async () => {
    if (!preview || !formParse || !composer) return;
    if (preview.submitBlocked) {
      Alert.alert(
        "Cannot submit",
        `Required FLICA fields are still blank:\n${preview.submitBlockers.join("\n")}`,
      );
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitTradeboardPostRequest(preview);
      if (result.ok) {
        Alert.alert("Posted", result.message, [
          {
            text: "OK",
            onPress: () => {
              setPreview(null);
              onSubmitted();
              onClose();
            },
          },
        ]);
      } else if (result.outcome === "session_expired") {
        Alert.alert("Refresh FLICA first", result.message);
      } else {
        Alert.alert("Submit failed", result.message);
      }
    } finally {
      setSubmitting(false);
    }
  }, [formParse, onClose, onSubmitted, preview]);

  const pickActivity = useCallback(
    (a: TradeboardPostRequestActivity) => {
      logActivitySelect(a);
      patchComposer({ activities: [a] });
      setActivityPickerOpen(false);
    },
    [patchComposer],
  );

  const renderFooter = useCallback(
    (onPreviewPress: () => void) => (
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Pressable style={styles.previewBtn} onPress={onPreviewPress}>
          <Text style={styles.previewBtnTxt}>Preview Request</Text>
        </Pressable>
        <Pressable
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={onPreviewPress}
          disabled={submitting}
        >
          <Text style={styles.submitBtnTxt}>Submit Request</Text>
        </Pressable>
      </View>
    ),
    [insets.bottom, submitting],
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <CommentKeyboardAccessory />
      <KeyboardAvoidingView
        style={styles.kavRoot}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 4 : 0}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissKeyboard}
            accessibilityLabel="Dismiss keyboard"
          />
          <View style={[styles.sheet, { maxHeight: "92%" }]}>
            <Pressable onPress={dismissKeyboard} style={styles.handleHit}>
              <View style={styles.handle} />
            </Pressable>
            <View style={styles.header}>
              <Text style={styles.title}>{editReqId ? "Edit Request" : "Post Request"}</Text>
              <Pressable
                onPress={() => {
                  dismissKeyboard();
                  onClose();
                }}
                hitSlop={12}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>

            {formLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={SCHEDULE_MOCK_HEADER_RED} />
                <Text style={styles.loadingTxt}>
                  Loading FLICA form…{"\n"}
                  (may use WebView if native fetch is empty)
                </Text>
              </View>
            ) : formError || !formParse?.ok || !composer ? (
              <View style={styles.center}>
                <Text style={styles.errTxt}>
                  {formError ?? "Refresh FLICA first — could not load Post Request form."}
                </Text>
              </View>
            ) : (
              <View style={styles.formColumn}>
                <ScrollView
                  style={styles.bodyScroll}
                  contentContainerStyle={styles.bodyContent}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  <TouchableWithoutFeedback onPress={dismissKeyboard} accessible={false}>
                    <View>
              <Text style={styles.section}>Request type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {requestTypes.map((opt) => {
                  const on = composer.requestType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => patchComposer({ requestType: opt.value })}
                    >
                      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>
                        {opt.label || opt.value}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.section}>Base / position</Text>
              <View style={styles.row2}>
                <TextInput
                  style={styles.input}
                  value={composer.base}
                  onChangeText={(base) => patchComposer({ base })}
                  placeholder="Base"
                  autoCapitalize="characters"
                />
                <TextInput
                  style={styles.input}
                  value={composer.position}
                  onChangeText={(position) => patchComposer({ position })}
                  placeholder="Position"
                  autoCapitalize="characters"
                />
              </View>

              <Text style={styles.section}>Comments</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={composer.comments}
                onChangeText={(comments) => patchComposer({ comments })}
                placeholder="Comment for crew…"
                multiline
                inputAccessoryViewID={
                  Platform.OS === "ios" ? COMMENT_ACCESSORY_ID : undefined
                }
              />

              <Text style={styles.section}>Response methods</Text>
              <Pressable
                style={styles.checkRow}
                onPress={() =>
                  patchComposer({ flicaResponse: !composer.flicaResponse })
                }
              >
                <Ionicons
                  name={composer.flicaResponse ? "checkbox" : "square-outline"}
                  size={20}
                  color={SCHEDULE_MOCK_HEADER_RED}
                />
                <Text style={styles.checkLbl}>FLICA Response (required)</Text>
              </Pressable>
              <Pressable
                style={styles.checkRow}
                onPress={() => patchComposer({ emailResponse: !composer.emailResponse })}
              >
                <Ionicons
                  name={composer.emailResponse ? "checkbox" : "square-outline"}
                  size={20}
                  color={SCHEDULE_MOCK_HEADER_RED}
                />
                <Text style={styles.checkLbl}>Email</Text>
              </Pressable>
              {composer.emailResponse ? (
                <TextInput
                  style={styles.input}
                  value={composer.emailAddress}
                  onChangeText={(emailAddress) => patchComposer({ emailAddress })}
                  placeholder="Email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={dismissKeyboard}
                />
              ) : null}
              <Pressable
                style={styles.checkRow}
                onPress={() => patchComposer({ phoneResponse: !composer.phoneResponse })}
              >
                <Ionicons
                  name={composer.phoneResponse ? "checkbox" : "square-outline"}
                  size={20}
                  color={SCHEDULE_MOCK_HEADER_RED}
                />
                <Text style={styles.checkLbl}>Phone</Text>
              </Pressable>
              {composer.phoneResponse ? (
                <TextInput
                  style={styles.input}
                  value={composer.phoneNumber}
                  onChangeText={(phoneNumber) => patchComposer({ phoneNumber })}
                  placeholder="Phone"
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={dismissKeyboard}
                />
              ) : null}

              <Text style={styles.section}>Activity / pairing</Text>
              {composer.activities[0] ? (
                <View style={styles.activityCard}>
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() => {
                      dismissKeyboard();
                      setActivityPickerOpen(true);
                    }}
                  >
                    <Text style={styles.activityTxt}>{composer.activities[0].displayLabel}</Text>
                    {composer.activities[0].sourceType === "flica_selector" ? (
                      <Text style={styles.activitySub}>
                        FLICA selector · row {composer.activities[0].flicaRowIndex ?? "—"}
                      </Text>
                    ) : null}
                  </Pressable>
                  <Pressable onPress={() => patchComposer({ activities: [] })} hitSlop={8}>
                    <Text style={styles.removeTxt}>Remove</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.hint}>No pairing selected yet.</Text>
              )}
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => {
                  dismissKeyboard();
                  setActivityPickerOpen(true);
                }}
              >
                <Ionicons name="add-circle-outline" size={16} color={SCHEDULE_MOCK_HEADER_RED} />
                <Text style={styles.secondaryBtnTxt}>Add Activity</Text>
              </Pressable>

              {composer.deleteAfter ? (
                <>
                  <Text style={styles.section}>Delete request after</Text>
                  <Text style={styles.hint}>{composer.deleteAfter}</Text>
                </>
              ) : null}
                    </View>
                  </TouchableWithoutFeedback>
                </ScrollView>
                {renderFooter(onPreview)}
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <TradeBoardActivityPickerSheet
        visible={activityPickerOpen}
        onClose={() => setActivityPickerOpen(false)}
        onConfirm={pickActivity}
        tradeTypeCode={composer?.requestType ?? "T"}
        requestTypeLabel={requestTypeDisplay || "Trade"}
        initialActivity={composer?.activities[0] ?? null}
      />

      <Modal visible={preview != null} transparent animationType="slide">
        <View style={styles.pickerBackdrop}>
          <View style={[styles.pickerCard, { maxHeight: "85%" }]}>
            <Text style={styles.pickerTitle}>Preview (dry run)</Text>
            <ScrollView>
              <Text style={[styles.mono, MONO]} selectable>
                REAL CAPTURED FORM ACTION:
                {"\n"}
                {preview?.capturedSubmit?.actionResolved || preview?.actionUrl || "—"}
                {"\n"}
                REAL SUBMIT BUTTON:
                {"\n"}
                {formatSubmitButtonLabel(preview?.capturedSubmit?.submitButton ?? null)}
                {"\n"}
                FRAME URL:
                {"\n"}
                {preview?.capturedSubmit?.frameUrl || "—"}
                {"\n"}
                METHOD:
                {"\n"}
                {preview?.capturedSubmit?.method || preview?.method || "—"}
                {"\n\n"}
                Type: {requestTypeLabel(preview?.summary.requestType ?? "", requestTypes)}
                {"\n"}
                Base: {preview?.summary.base} · Pos: {preview?.summary.position}
                {"\n"}
                Comments: {preview?.summary.comments || "—"}
                {"\n"}
                Response: {(preview?.summary.responseMethods ?? []).join(", ") || "—"}
                {"\n"}
                Activity:{" "}
                {preview?.summary.activities[0]?.displayLabel ?? "—"}
                {"\n"}
                Activity source: {preview?.activitySource?.label ?? "—"}
                {"\n"}
                Selector URL:{" "}
                {preview?.activitySource?.selectorUrl ||
                  preview?.summary.activities[0]?.flicaSelectorUrl ||
                  "—"}
                {"\n"}
                FLICA row index:{" "}
                {preview?.activitySource?.flicaRowIndex ??
                  preview?.summary.activities[0]?.flicaRowIndex ??
                  "—"}
                {"\n"}
                Pairing/date:{" "}
                {preview?.summary.activities[0]
                  ? `${preview.summary.activities[0].pairingId}:${preview.summary.activities[0].dateYmd}`
                  : "—"}
                {"\n"}
                Block/layover:{" "}
                {preview?.summary.activities[0]
                  ? `${preview.summary.activities[0].blockHrs ?? "—"} / ${preview.summary.activities[0].layovers ?? "—"}`
                  : "—"}
                {"\n\n"}
                Mapped fields ({preview?.mappedFields.length ?? 0}):
                {"\n"}
                {(preview?.mappedFields ?? [])
                  .map((m) => `${m.name}=${m.value.slice(0, 80)} (${m.source})`)
                  .join("\n") || "—"}
                {"\n\n"}
                Still blank critical fields:
                {"\n"}
                {(preview?.blankCriticalFields ?? []).join("\n") || "—"}
                {"\n\n"}
                Real Chrome parity check:
                {"\n"}
                {(preview?.chromeParityDiffs ?? []).length
                  ? (preview?.chromeParityDiffs ?? [])
                      .map((d) => `${d.field}: expected "${d.expected}" got "${d.actual}"`)
                      .join("\n")
                  : "All checked fields match the captured Chrome POST pattern."}
                {preview?.submitBlocked ? (
                  <>
                    {"\n\n"}
                    Submit blocked — fix:
                    {"\n"}
                    {(preview?.submitBlockers ?? []).join("\n")}
                  </>
                ) : (
                  "\n\nSubmit ready (dry run only until you confirm)."
                )}
                {"\n\n"}
                Payload fields ({preview?.fields.length ?? 0}):
                {"\n"}
                {(preview?.fields ?? [])
                  .filter((f) => f.name.toLowerCase().startsWith("hdn") || /^TradeType|selBase|selPos|Comment|PAIR/i.test(f.name))
                  .slice(0, 50)
                  .map((f) => `${f.name}=${f.value.slice(0, 80)}`)
                  .join("\n")}
              </Text>
            </ScrollView>
            <View style={styles.footer}>
              <Pressable style={styles.previewBtn} onPress={() => setPreview(null)}>
                <Text style={styles.previewBtnTxt}>Back</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.submitBtn,
                  (submitting || preview?.submitBlocked) && styles.submitBtnDisabled,
                ]}
                onPress={() => void onConfirmSubmit()}
                disabled={submitting || Boolean(preview?.submitBlocked)}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnTxt}>Confirm Submit</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const accessoryStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f1f5f9",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#cbd5e1",
  },
  doneBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  doneTxt: { fontSize: 16, fontWeight: "600", color: SCHEDULE_MOCK_HEADER_RED },
});

const styles = StyleSheet.create({
  kavRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: CREW_HUB_SHEET_SURFACE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    minHeight: 200,
    overflow: "hidden",
  },
  formColumn: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
  bodyScroll: { flexGrow: 1, flexShrink: 1 },
  bodyContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  handleHit: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  header: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "800" },
  center: { padding: 32, alignItems: "center", gap: 12 },
  loadingTxt: { color: "#64748b", fontSize: 13 },
  errTxt: { color: "#b91c1c", fontSize: 13, textAlign: "center" },
  section: {
    fontSize: 11,
    fontWeight: "800",
    color: "#78716c",
    letterSpacing: 0.4,
    marginTop: 14,
    marginBottom: 6,
  },
  chipRow: { flexDirection: "row", marginBottom: 4 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginRight: 8,
    backgroundColor: "#fff",
  },
  chipOn: { backgroundColor: SCHEDULE_MOCK_HEADER_RED, borderColor: SCHEDULE_MOCK_HEADER_RED },
  chipTxt: { fontSize: 12, fontWeight: "600", color: "#475569" },
  chipTxtOn: { color: "#fff" },
  row2: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "#fff",
    marginBottom: 6,
  },
  textArea: { minHeight: 72, textAlignVertical: "top" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  checkLbl: { fontSize: 13, color: "#334155" },
  hint: { fontSize: 12, color: "#94a3b8", marginBottom: 8 },
  activityCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(92, 16, 24, 0.15)",
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  activityTxt: { fontSize: 13, fontWeight: "700", color: "#1e293b" },
  activitySub: { fontSize: 10, color: "#94a3b8", marginTop: 2 },
  removeTxt: { fontSize: 12, fontWeight: "700", color: SCHEDULE_MOCK_HEADER_RED },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    marginBottom: 12,
  },
  secondaryBtnTxt: { fontSize: 13, fontWeight: "700", color: SCHEDULE_MOCK_HEADER_RED },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    backgroundColor: CREW_HUB_SHEET_SURFACE,
  },
  previewBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SCHEDULE_MOCK_HEADER_RED,
    alignItems: "center",
  },
  previewBtnTxt: { color: SCHEDULE_MOCK_HEADER_RED, fontWeight: "800", fontSize: 13 },
  submitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  pickerCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
  },
  pickerTitle: { fontSize: 15, fontWeight: "800", marginBottom: 10, color: "#1e293b" },
  pickerRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  pickerRowTxt: { fontSize: 13, fontWeight: "600", color: "#334155" },
  mono: { fontSize: 10, color: "#334155", lineHeight: 14 },
});
