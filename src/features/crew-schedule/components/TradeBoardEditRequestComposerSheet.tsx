import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  buildTradeboardEditRequestPayload,
  dryRunTradeboardEditRequest,
  submitTradeboardEditRequest,
} from "../../flica-actions/flicaTradeBoardEditRequestPayload";
import type {
  TradeboardPostRequestActivity,
  TradeboardPostRequestComposerState,
  TradeboardPostRequestDryRun,
  TradeboardPostRequestFormParse,
  TradeboardPostRequestSelectOption,
} from "../../flica-actions/flicaTradeBoardPostRequestTypes";
import { CREW_HUB_SHEET_SURFACE, SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";
import TradeBoardActivityPickerSheet from "./TradeBoardActivityPickerSheet";

const MONO: TextStyle = Platform.select<TextStyle>({
  ios: { fontFamily: "Menlo" },
  android: { fontFamily: "monospace" },
  default: { fontFamily: "monospace" },
});

const COMMENT_ACCESSORY_ID = "tb-edit-request-comment-done";

type EditSnapshot = {
  requestType: string;
  comments: string;
  emailResponse: boolean;
  emailAddress: string;
  phoneResponse: boolean;
  phoneNumber: string;
  activities: TradeboardPostRequestActivity[];
  deleteMonthYyyyMm: string;
  deleteAfterDay: string;
  submitAllowPickup: boolean;
  submitWaitApproval: boolean;
};

function snapshotFromState(
  composer: TradeboardPostRequestComposerState,
  deleteMonthYyyyMm: string,
  deleteAfterDay: string,
  submitAllowPickup: boolean,
  submitWaitApproval: boolean,
): EditSnapshot {
  return {
    requestType: composer.requestType,
    comments: composer.comments,
    emailResponse: composer.emailResponse,
    emailAddress: composer.emailAddress,
    phoneResponse: composer.phoneResponse,
    phoneNumber: composer.phoneNumber,
    activities: composer.activities.map((a) => ({ ...a })),
    deleteMonthYyyyMm,
    deleteAfterDay,
    submitAllowPickup,
    submitWaitApproval,
  };
}

function snapshotsEqual(a: EditSnapshot, b: EditSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function optionLabel(opts: TradeboardPostRequestSelectOption[], value: string): string {
  return opts.find((o) => o.value === value)?.label ?? value;
}

type SelectChipRowProps = {
  label: string;
  options: TradeboardPostRequestSelectOption[];
  value: string;
  onChange: (v: string) => void;
};

function SelectChipRow({ label, options, value, onChange }: SelectChipRowProps) {
  if (!options.length) {
    return (
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.readOnly}>{value || "—"}</Text>
      </View>
    );
  }
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {options.map((opt) => {
          const on = opt.value === value;
          return (
            <Pressable
              key={`${opt.value}-${opt.label}`}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => onChange(opt.value)}
            >
              <Text style={[styles.chipTxt, on && styles.chipTxtOn]} numberOfLines={1}>
                {opt.label || opt.value}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onUpdated: () => void;
  formParse: TradeboardPostRequestFormParse | null;
  formLoading: boolean;
  formError: string | null;
  reqId: string;
  treq?: string;
};

export default function TradeBoardEditRequestComposerSheet({
  visible,
  onClose,
  onUpdated,
  formParse,
  formLoading,
  formError,
  reqId,
  treq,
}: Props) {
  const insets = useSafeAreaInsets();
  const [composer, setComposer] = useState<TradeboardPostRequestComposerState | null>(null);
  const [deleteMonthYyyyMm, setDeleteMonthYyyyMm] = useState("");
  const [deleteAfterDay, setDeleteAfterDay] = useState("");
  const [submitAllowPickup, setSubmitAllowPickup] = useState(false);
  const [submitWaitApproval, setSubmitWaitApproval] = useState(false);
  const [preview, setPreview] = useState<TradeboardPostRequestDryRun | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activityPickerOpen, setActivityPickerOpen] = useState(false);
  const initialSnapshotRef = useRef<EditSnapshot | null>(null);

  const detected = formParse?.detected;
  const typeDisplay =
    detected?.requestTypeDisplayLabel?.trim() ||
    detected?.requestTypes.find((o) => o.selected)?.label ||
    detected?.requestTypes[0]?.label ||
    "—";

  useEffect(() => {
    if (!visible || !detected || !formParse?.primaryForm) return;

    const fromForm = detected.selectedActivity ?? null;

    const initial: TradeboardPostRequestComposerState = {
      requestType: detected.selectedRequestType,
      base: detected.base || "JFK",
      equipment: detected.equipment || "ALL",
      position: detected.position || "FA",
      comments: detected.comments,
      flicaResponse: true,
      emailResponse: detected.emailResponse,
      emailAddress: detected.emailAddress,
      phoneResponse: detected.phoneResponse,
      phoneNumber: detected.phoneNumber,
      deleteAfter: detected.deleteAfter,
      activities: fromForm ? [fromForm] : [],
      reqId,
      treq,
    };

    const month = detected.selectedDeleteMonthYyyyMm ?? "";
    const day = detected.selectedDeleteDay ?? "";
    const allowPickup = detected.submitMethodAllowPickupWithoutApproval ?? false;
    const waitApproval = detected.submitMethodWaitForApproval ?? false;

    setComposer(initial);
    setDeleteMonthYyyyMm(month);
    setDeleteAfterDay(day);
    setSubmitAllowPickup(allowPickup);
    setSubmitWaitApproval(waitApproval);
    initialSnapshotRef.current = snapshotFromState(initial, month, day, allowPickup, waitApproval);
    setPreview(null);
  }, [visible, detected, formParse, reqId, treq]);

  const patchComposer = useCallback((patch: Partial<TradeboardPostRequestComposerState>) => {
    setComposer((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const isDirty = useCallback(() => {
    if (!composer || !initialSnapshotRef.current) return false;
    return !snapshotsEqual(
      initialSnapshotRef.current,
      snapshotFromState(
        composer,
        deleteMonthYyyyMm,
        deleteAfterDay,
        submitAllowPickup,
        submitWaitApproval,
      ),
    );
  }, [composer, deleteAfterDay, deleteMonthYyyyMm, submitAllowPickup, submitWaitApproval]);

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const buildPayload = useCallback(() => {
    if (!formParse?.ok || !composer) return null;
    return buildTradeboardEditRequestPayload(formParse, composer, {
      deleteAfterMonthYyyyMm: deleteMonthYyyyMm,
      deleteAfterDay,
      submitMethodAllowPickupWithoutApproval: submitAllowPickup,
      submitMethodWaitForApproval: submitWaitApproval,
    });
  }, [
    composer,
    deleteAfterDay,
    deleteMonthYyyyMm,
    formParse,
    submitAllowPickup,
    submitWaitApproval,
  ]);

  const handleCancel = useCallback(() => {
    dismissKeyboard();
    if (!isDirty()) {
      onClose();
      return;
    }
    Alert.alert(
      "Unsaved changes",
      "Are you sure you want to exit without saving changes? Click 'Okay' to continue without saving.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Okay", style: "destructive", onPress: onClose },
      ],
    );
  }, [dismissKeyboard, isDirty, onClose]);

  const onPreview = useCallback(() => {
    dismissKeyboard();
    if (!formParse?.ok || !composer) {
      Alert.alert("Edit Request", formError ?? "Refresh FLICA first — form not loaded.");
      return;
    }
    const payload = buildPayload();
    if (!payload) return;
    setPreview(dryRunTradeboardEditRequest(payload));
  }, [buildPayload, composer, dismissKeyboard, formError, formParse]);

  const onConfirmUpdate = useCallback(async () => {
    if (!preview || !composer) return;
    if (preview.submitBlocked) {
      Alert.alert(
        "Cannot update",
        `Fix these before submitting:\n${preview.submitBlockers.join("\n")}`,
      );
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitTradeboardEditRequest(preview);
      if (result.ok) {
        Alert.alert("Updated", result.message, [
          {
            text: "OK",
            onPress: () => {
              setPreview(null);
              onUpdated();
              onClose();
            },
          },
        ]);
      } else if (result.outcome === "session_expired") {
        Alert.alert("Refresh FLICA first", result.message);
      } else {
        Alert.alert("Update failed", result.message);
      }
    } finally {
      setSubmitting(false);
    }
  }, [composer, onClose, onUpdated, preview]);

  const pickActivity = useCallback(
    (a: TradeboardPostRequestActivity) => {
      patchComposer({ activities: [a] });
      setActivityPickerOpen(false);
    },
    [patchComposer],
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleCancel}>
      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={COMMENT_ACCESSORY_ID}>
          <View style={styles.accessoryBar}>
            <Pressable onPress={dismissKeyboard} hitSlop={8}>
              <Text style={styles.accessoryDone}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
      <KeyboardAvoidingView
        style={styles.kavRoot}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismissKeyboard} />
          <View style={[styles.sheet, { maxHeight: "92%" }]}>
            <View style={styles.header}>
              <Text style={styles.title}>Edit Request</Text>
              <Pressable onPress={handleCancel} hitSlop={12}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>

            {formLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={SCHEDULE_MOCK_HEADER_RED} />
                <Text style={styles.loadingTxt}>Loading FLICA edit form…</Text>
              </View>
            ) : formError || !formParse?.ok || !composer ? (
              <View style={styles.center}>
                <Text style={styles.errTxt}>
                  {formError ?? "Refresh FLICA first — could not load Edit Request form."}
                </Text>
              </View>
            ) : (
              <View style={styles.formColumn}>
                <ScrollView
                  style={styles.bodyScroll}
                  contentContainerStyle={styles.bodyContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <TouchableWithoutFeedback onPress={dismissKeyboard} accessible={false}>
                    <View>
                      <Text style={styles.intro}>
                        Fill in the information below for the request you would like to post:
                      </Text>

                      <Text style={styles.stepHeader}>Step 1: General Request Information</Text>

                      <View style={styles.fieldBlock}>
                        <Text style={styles.fieldLabel}>Type</Text>
                        <View style={styles.readOnlyBox}>
                          <Text style={styles.readOnly}>{typeDisplay}</Text>
                        </View>
                        {(detected?.requestTypes ?? []).map((opt) => (
                          <Text key={`${opt.value}-${opt.label}`} style={styles.typeOptionHint}>
                            {opt.label || opt.value}
                          </Text>
                        ))}
                      </View>

                      <View style={styles.row3}>
                        <View style={styles.row3Cell}>
                          <Text style={styles.fieldLabel}>Base</Text>
                          <Text style={styles.readOnly}>{composer.base || "JFK"}</Text>
                        </View>
                        <View style={styles.row3Cell}>
                          <Text style={styles.fieldLabel}>Equipment</Text>
                          <Text style={styles.readOnly}>{composer.equipment || "ALL"}</Text>
                        </View>
                        <View style={styles.row3Cell}>
                          <Text style={styles.fieldLabel}>Position</Text>
                          <Text style={styles.readOnly}>{composer.position || "FA"}</Text>
                        </View>
                      </View>

                      <View style={styles.fieldBlock}>
                        <Text style={styles.fieldLabel}>Comments</Text>
                        <TextInput
                          style={[styles.input, styles.textArea]}
                          value={composer.comments}
                          onChangeText={(comments) => patchComposer({ comments })}
                          multiline
                          inputAccessoryViewID={
                            Platform.OS === "ios" ? COMMENT_ACCESSORY_ID : undefined
                          }
                        />
                      </View>

                      <Text style={styles.subSection}>Response Methods</Text>
                      <View style={styles.checkRow}>
                        <Ionicons name="checkbox" size={20} color="#94a3b8" />
                        <Text style={[styles.checkLbl, styles.disabledLbl]}>FLICA Response</Text>
                      </View>
                      <Pressable
                        style={styles.checkRow}
                        onPress={() =>
                          patchComposer({ emailResponse: !composer.emailResponse })
                        }
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
                          autoCapitalize="none"
                        />
                      ) : null}
                      <Pressable
                        style={styles.checkRow}
                        onPress={() =>
                          patchComposer({ phoneResponse: !composer.phoneResponse })
                        }
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
                        />
                      ) : null}

                      {detected?.submitMethodFieldsPresent ? (
                        <>
                          <Text style={styles.subSection}>Submit Method</Text>
                          <Pressable
                            style={styles.checkRow}
                            disabled={detected.submitMethodAllowPickupDisabled}
                            onPress={() => {
                              if (detected.submitMethodAllowPickupDisabled) return;
                              setSubmitAllowPickup((v) => !v);
                              if (!submitAllowPickup) setSubmitWaitApproval(false);
                            }}
                          >
                            <Ionicons
                              name={submitAllowPickup ? "checkbox" : "square-outline"}
                              size={20}
                              color={
                                detected.submitMethodAllowPickupDisabled
                                  ? "#94a3b8"
                                  : SCHEDULE_MOCK_HEADER_RED
                              }
                            />
                            <Text
                              style={[
                                styles.checkLbl,
                                detected.submitMethodAllowPickupDisabled && styles.disabledLbl,
                              ]}
                            >
                              Allow anyone to pickup without my approval
                            </Text>
                          </Pressable>
                          <Pressable
                            style={styles.checkRow}
                            disabled={detected.submitMethodWaitDisabled}
                            onPress={() => {
                              if (detected.submitMethodWaitDisabled) return;
                              setSubmitWaitApproval((v) => !v);
                              if (!submitWaitApproval) setSubmitAllowPickup(false);
                            }}
                          >
                            <Ionicons
                              name={submitWaitApproval ? "checkbox" : "square-outline"}
                              size={20}
                              color={
                                detected.submitMethodWaitDisabled
                                  ? "#94a3b8"
                                  : SCHEDULE_MOCK_HEADER_RED
                              }
                            />
                            <Text
                              style={[
                                styles.checkLbl,
                                detected.submitMethodWaitDisabled && styles.disabledLbl,
                              ]}
                            >
                              Wait for my approval
                            </Text>
                          </Pressable>
                        </>
                      ) : null}

                      <Text style={styles.stepHeader}>Step 2: Pairing Information</Text>

                      <View style={styles.box}>
                        <Text style={styles.boxTitle}>Pairing Information</Text>
                        {composer.activities[0] ? (
                          <View style={styles.activityRow}>
                            <Text style={styles.activityTxt}>
                              {composer.activities[0].displayLabel}
                            </Text>
                            <Pressable onPress={() => patchComposer({ activities: [] })} hitSlop={8}>
                              <Text style={styles.removeTxt}>Remove</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Text style={styles.hint}>No pairing selected.</Text>
                        )}
                        <Pressable
                          style={styles.addActivityLink}
                          onPress={() => setActivityPickerOpen(true)}
                        >
                          <Text style={styles.addActivityLinkTxt}>Click here to add activity</Text>
                        </Pressable>
                      </View>

                      <View style={styles.box}>
                        <Text style={styles.boxTitle}>Delete My Request After:</Text>
                        <SelectChipRow
                          label="Day"
                          options={detected?.deleteAfterDayOptions ?? []}
                          value={deleteAfterDay}
                          onChange={setDeleteAfterDay}
                        />
                        <SelectChipRow
                          label="Month"
                          options={detected?.deleteAfterMonthOptions ?? []}
                          value={deleteMonthYyyyMm}
                          onChange={setDeleteMonthYyyyMm}
                        />
                        {deleteMonthYyyyMm && deleteAfterDay ? (
                          <Text style={styles.hint}>
                            Selected: {optionLabel(detected?.deleteAfterMonthOptions ?? [], deleteMonthYyyyMm)}{" "}
                            {optionLabel(detected?.deleteAfterDayOptions ?? [], deleteAfterDay)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </TouchableWithoutFeedback>
                </ScrollView>
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
                  <Pressable style={styles.cancelBtn} onPress={handleCancel}>
                    <Text style={styles.cancelBtnTxt}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.updateBtn} onPress={onPreview}>
                    <Text style={styles.updateBtnTxt}>Update Request Info</Text>
                  </Pressable>
                </View>
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
        requestTypeLabel={typeDisplay}
        initialActivity={composer?.activities[0] ?? null}
      />

      <Modal visible={preview != null} transparent animationType="slide">
        <View style={styles.previewBackdrop}>
          <View style={[styles.previewCard, { maxHeight: "85%" }]}>
            <Text style={styles.previewTitle}>Preview (dry run)</Text>
            <ScrollView>
              <Text style={[styles.mono, MONO]} selectable>
                ACTION:
                {"\n"}
                {preview?.actionUrl}
                {"\n\n"}
                METHOD: {preview?.method}
                {"\n\n"}
                {(preview?.fields ?? [])
                  .filter((f) => /^hdn|TradeType|Comment|reqId|Month|Day/i.test(f.name))
                  .map((f) => `${f.name}=${f.value}`)
                  .join("\n")}
                {preview?.submitBlocked ? (
                  <>
                    {"\n\n"}
                    Blocked:
                    {"\n"}
                    {(preview?.submitBlockers ?? []).join("\n")}
                  </>
                ) : (
                  "\n\nReady to confirm update."
                )}
              </Text>
            </ScrollView>
            <View style={styles.footer}>
              <Pressable style={styles.cancelBtn} onPress={() => setPreview(null)}>
                <Text style={styles.cancelBtnTxt}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.updateBtn, (submitting || preview?.submitBlocked) && styles.btnDisabled]}
                onPress={() => void onConfirmUpdate()}
                disabled={submitting || Boolean(preview?.submitBlocked)}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.updateBtnTxt}>Confirm Update</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kavRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: CREW_HUB_SHEET_SURFACE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  formColumn: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
  bodyScroll: { flexGrow: 1, flexShrink: 1 },
  bodyContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
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
  intro: { fontSize: 13, color: "#475569", lineHeight: 18, marginBottom: 12 },
  stepHeader: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1e293b",
    marginTop: 8,
    marginBottom: 10,
  },
  subSection: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
    marginTop: 12,
    marginBottom: 6,
  },
  fieldBlock: { marginBottom: 10 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#78716c", marginBottom: 4 },
  readOnlyBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f8fafc",
  },
  readOnly: { fontSize: 14, fontWeight: "600", color: "#334155" },
  typeOptionHint: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  row3: { flexDirection: "row", gap: 8, marginBottom: 8 },
  row3Cell: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "#fff",
  },
  textArea: { minHeight: 72, textAlignVertical: "top" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  checkLbl: { fontSize: 13, color: "#334155", flex: 1 },
  disabledLbl: { color: "#94a3b8" },
  hint: { fontSize: 12, color: "#94a3b8", marginBottom: 6 },
  box: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  boxTitle: { fontSize: 13, fontWeight: "800", color: "#1e293b", marginBottom: 8 },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  activityTxt: { fontSize: 14, fontWeight: "700", color: "#1e293b", flex: 1 },
  removeTxt: { fontSize: 12, fontWeight: "700", color: SCHEDULE_MOCK_HEADER_RED },
  addActivityLink: { paddingVertical: 4 },
  addActivityLinkTxt: {
    fontSize: 13,
    fontWeight: "700",
    color: SCHEDULE_MOCK_HEADER_RED,
    textDecorationLine: "underline",
  },
  chipScroll: { flexGrow: 0 },
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
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
  },
  cancelBtnTxt: { fontSize: 13, fontWeight: "700", color: "#64748b" },
  updateBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    alignItems: "center",
  },
  updateBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  btnDisabled: { opacity: 0.6 },
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  previewCard: { backgroundColor: "#fff", borderRadius: 14, padding: 16 },
  previewTitle: { fontSize: 15, fontWeight: "800", marginBottom: 10, color: "#1e293b" },
  mono: { fontSize: 10, lineHeight: 14, color: "#334155" },
  accessoryBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 8,
    backgroundColor: "#f1f5f9",
  },
  accessoryDone: { fontWeight: "600", color: SCHEDULE_MOCK_HEADER_RED },
});
