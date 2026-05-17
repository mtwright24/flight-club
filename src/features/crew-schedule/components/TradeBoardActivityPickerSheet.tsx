import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  buildTradeboardActivitySelectorUrl,
  fetchTradeboardActivitySelector,
  flicaSelectorRowToActivity,
} from "../../flica-actions/flicaTradeBoardActivitySelector";
import type { FlicaActivitySelectorRow } from "../../flica-actions/flicaTradeBoardActivitySelectorTypes";
import type { TradeboardPostRequestActivity } from "../../flica-actions/flicaTradeBoardPostRequestTypes";
import { CREW_HUB_SHEET_SURFACE, SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";

const MONO: TextStyle = { fontFamily: "Menlo" };

const COL = {
  action: 56,
  date: 44,
  pairing: 52,
  days: 28,
  report: 40,
  depart: 40,
  arrive: 40,
  block: 44,
  layover: 44,
} as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (activity: TradeboardPostRequestActivity) => void;
  /** Composer request type code (T, D, P, …). */
  tradeTypeCode: string;
  requestTypeLabel: string;
  initialActivity?: TradeboardPostRequestActivity | null;
};

function actionButtonLabel(row: FlicaActivitySelectorRow, selected: boolean): string {
  if (selected) return "Undo";
  if (row.actionType === "undo" || row.selectedOnFlica) return "Undo";
  if (row.actionType === "drop") return "Drop";
  if (row.actionType === "trade") return "Trade";
  if (row.locked || row.actionType === "locked") return "—";
  return "";
}

function rowKey(row: FlicaActivitySelectorRow): string {
  return `${row.orderIndex}:${row.kind}:${row.pairingId}:${row.dateLabel}`;
}

export default function TradeBoardActivityPickerSheet({
  visible,
  onClose,
  onConfirm,
  tradeTypeCode,
  requestTypeLabel,
  initialActivity,
}: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parse, setParse] = useState<Awaited<ReturnType<typeof fetchTradeboardActivitySelector>> | null>(
    null,
  );
  const [selectedOrderIndex, setSelectedOrderIndex] = useState<number | null>(null);

  const selectorUrl = useMemo(
    () => buildTradeboardActivitySelectorUrl(tradeTypeCode),
    [tradeTypeCode],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTradeboardActivitySelector(tradeTypeCode);
      setParse(result);
      if (!result.ok) {
        const src = result.htmlSource === "webview" ? "WebView capture" : "Native fetch";
        const detail = result.warnings.length
          ? result.warnings.join("\n")
          : `No eligible FLICA activities found (${src}).`;
        setError(detail);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setParse(null);
    } finally {
      setLoading(false);
    }
  }, [tradeTypeCode]);

  useEffect(() => {
    if (!visible) {
      setSelectedOrderIndex(null);
      setParse(null);
      setError(null);
      return;
    }
    const idx = initialActivity?.flicaRowIndex;
    setSelectedOrderIndex(typeof idx === "number" ? idx : null);
    void load();
  }, [visible, load, initialActivity?.flicaRowIndex]);

  const rows = parse?.rows ?? [];

  const selectedRow = useMemo(() => {
    if (selectedOrderIndex == null) return null;
    const byIndex = rows.find((r) => r.flicaRowIndex === selectedOrderIndex && r.selectable);
    if (byIndex) return byIndex;
    return rows.find((r) => r.orderIndex === selectedOrderIndex && r.selectable) ?? null;
  }, [rows, selectedOrderIndex]);

  const onRowPress = useCallback((row: FlicaActivitySelectorRow) => {
    if (!row.selectable || row.flicaRowIndex == null) return;
    setSelectedOrderIndex((prev) =>
      prev === row.flicaRowIndex ? null : row.flicaRowIndex,
    );
  }, []);

  const onAdd = useCallback(() => {
    if (!selectedRow || !parse) return;
    const activity = flicaSelectorRowToActivity(selectedRow, parse.requestedUrl);
    onConfirm(activity);
  }, [onConfirm, parse, selectedRow]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={styles.handleHit}>
            <View style={styles.handle} />
          </View>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Add Activity</Text>
              <Text style={styles.subtitle}>
                {requestTypeLabel} · FLICA activity selector
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.topBanner}>
            <Text style={styles.topBannerLbl}>Request action</Text>
            <Text style={styles.topBannerVal}>{requestTypeLabel}</Text>
          </View>

          <View style={styles.colHeader}>
            <Text style={[styles.colHdr, { width: COL.action }]} />
            <Text style={[styles.colHdr, { width: COL.date }]}>Date</Text>
            <Text style={[styles.colHdr, { width: COL.pairing }]}>Pair</Text>
            <Text style={[styles.colHdr, { width: COL.days }]}>Dy</Text>
            <Text style={[styles.colHdr, { width: COL.report }]}>Rpt</Text>
            <Text style={[styles.colHdr, { width: COL.depart }]}>Dep</Text>
            <Text style={[styles.colHdr, { width: COL.arrive }]}>Arr</Text>
            <Text style={[styles.colHdr, { width: COL.block }]}>Blk</Text>
            <Text style={[styles.colHdr, { width: COL.layover, flex: 1 }]}>Lay</Text>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={SCHEDULE_MOCK_HEADER_RED} size="large" />
              <Text style={styles.loadingTxt}>
                Loading FLICA activities…{"\n"}
                (uses WebView if native fetch is empty)
              </Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={styles.errTxt}>{error}</Text>
              <Pressable style={styles.retryBtn} onPress={() => void load()}>
                <Text style={styles.retryTxt}>Retry</Text>
              </Pressable>
            </View>
          ) : rows.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.errTxt}>
                No activity rows to display. Native fetch and WebView capture did not return a
                parseable selector.
              </Text>
              <Pressable style={styles.retryBtn} onPress={() => void load()}>
                <Text style={styles.retryTxt}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {rows.map((row) => {
                if (row.kind === "date_header") {
                  return (
                    <View key={rowKey(row)} style={styles.dateHeader}>
                      <Text style={styles.dateHeaderTxt}>
                        {row.dateLabel || row.sectionDateLabel || row.rawRowText}
                      </Text>
                    </View>
                  );
                }

                if (row.kind === "blank") {
                  return <View key={rowKey(row)} style={styles.blankRow} />;
                }

                if (row.kind === "carryover") {
                  return (
                    <View key={rowKey(row)} style={styles.carryRow}>
                      <Text style={styles.carryTxt} numberOfLines={1}>
                        {row.rawRowText || " "}
                      </Text>
                    </View>
                  );
                }

                const selected =
                  row.flicaRowIndex != null && selectedOrderIndex === row.flicaRowIndex;
                const btnLabel = actionButtonLabel(row, selected);
                const showBtn = row.selectable || row.locked;

                return (
                  <Pressable
                    key={rowKey(row)}
                    style={[styles.tripRow, selected && styles.tripRowSelected]}
                    onPress={() => onRowPress(row)}
                    disabled={!row.selectable}
                  >
                    <View style={[styles.actionCell, { width: COL.action }]}>
                      {showBtn ? (
                        <Pressable
                          style={[
                            styles.actionBtn,
                            selected && styles.actionBtnSelected,
                            (row.locked || !row.selectable) && styles.actionBtnDisabled,
                          ]}
                          disabled={row.locked || !row.selectable}
                          onPress={() => onRowPress(row)}
                        >
                          <Text
                            style={[
                              styles.actionBtnTxt,
                              selected && styles.actionBtnTxtSelected,
                              (row.locked || !row.selectable) && styles.actionBtnTxtDisabled,
                            ]}
                            numberOfLines={1}
                          >
                            {btnLabel || "—"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Text style={[styles.cell, { width: COL.date }]} numberOfLines={1}>
                      {row.dateLabel}
                    </Text>
                    <Text style={[styles.cell, styles.cellBold, { width: COL.pairing }]} numberOfLines={1}>
                      {row.pairingId}
                    </Text>
                    <Text style={[styles.cell, { width: COL.days }]} numberOfLines={1}>
                      {row.days}
                    </Text>
                    <Text style={[styles.cell, styles.mono, { width: COL.report }]} numberOfLines={1}>
                      {row.report}
                    </Text>
                    <Text style={[styles.cell, styles.mono, { width: COL.depart }]} numberOfLines={1}>
                      {row.depart}
                    </Text>
                    <Text style={[styles.cell, styles.mono, { width: COL.arrive }]} numberOfLines={1}>
                      {row.arrive}
                    </Text>
                    <Text style={[styles.cell, styles.mono, { width: COL.block }]} numberOfLines={1}>
                      {row.blockHrs}
                    </Text>
                    <Text style={[styles.cell, { flex: 1, minWidth: COL.layover }]} numberOfLines={1}>
                      {row.layover}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.addBtn, !selectedRow && styles.addBtnDisabled]}
              onPress={onAdd}
              disabled={!selectedRow}
            >
              <Text style={styles.addBtnTxt}>Add Activity</Text>
            </Pressable>
          </View>

          {__DEV__ && parse ? (
            <Text style={styles.devUrl} numberOfLines={2}>
              {selectorUrl}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: CREW_HUB_SHEET_SURFACE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "92%",
    minHeight: 320,
  },
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
    alignItems: "flex-start",
    gap: 8,
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  topBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "rgba(92, 16, 24, 0.08)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  topBannerLbl: { fontSize: 11, fontWeight: "700", color: "#78716c" },
  topBannerVal: { fontSize: 13, fontWeight: "800", color: SCHEDULE_MOCK_HEADER_RED },
  colHeader: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  colHdr: { fontSize: 9, fontWeight: "800", color: "#94a3b8", textTransform: "uppercase" },
  list: { flexGrow: 1, flexShrink: 1 },
  listContent: { paddingBottom: 8 },
  center: { padding: 32, alignItems: "center", gap: 12, flex: 1 },
  loadingTxt: { fontSize: 13, color: "#64748b" },
  errTxt: { fontSize: 13, color: "#b91c1c", textAlign: "center" },
  hint: { fontSize: 13, color: "#94a3b8" },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
  },
  retryTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  dateHeader: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(92, 16, 24, 0.12)",
  },
  dateHeaderTxt: { fontSize: 12, fontWeight: "800", color: "#5c1018", letterSpacing: 0.3 },
  blankRow: { height: 10, backgroundColor: "#fff" },
  carryRow: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: "#fafafa",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
  },
  carryTxt: { fontSize: 11, color: "#94a3b8" },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
  },
  tripRowSelected: { backgroundColor: "rgba(176, 24, 26, 0.08)" },
  actionCell: { alignItems: "center", justifyContent: "center" },
  actionBtn: {
    minWidth: 48,
    paddingHorizontal: 4,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: SCHEDULE_MOCK_HEADER_RED,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  actionBtnSelected: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    borderColor: SCHEDULE_MOCK_HEADER_RED,
  },
  actionBtnDisabled: {
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  actionBtnTxt: {
    fontSize: 9,
    fontWeight: "800",
    color: SCHEDULE_MOCK_HEADER_RED,
    textTransform: "uppercase",
  },
  actionBtnTxtSelected: { color: "#fff" },
  actionBtnTxtDisabled: { color: "#94a3b8" },
  cell: { fontSize: 10, color: "#334155" },
  cellBold: { fontWeight: "800", color: "#1e293b" },
  mono: MONO,
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    backgroundColor: CREW_HUB_SHEET_SURFACE,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
  },
  cancelBtnTxt: { fontWeight: "800", fontSize: 13, color: "#475569" },
  addBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    alignItems: "center",
  },
  addBtnDisabled: { opacity: 0.45 },
  addBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  devUrl: { fontSize: 8, color: "#94a3b8", paddingHorizontal: 12, paddingBottom: 4 },
});
