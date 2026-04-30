import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOW, SPACING } from '../../../styles/theme';
import FlicaSyncBrandedHero from './FlicaSyncBrandedHero';
import FlicaSyncProgressSteps, { type FlicaSyncProgressPhase } from './FlicaSyncProgressSteps';
import FlicaSyncPromoBanner from './FlicaSyncPromoBanner';
import FlicaSyncSmartSuggestionStrip from './FlicaSyncSmartSuggestionStrip';
import {
  FLICA_SYNC_BANNER_SUCCESS,
  FLICA_SYNC_BANNER_VERIFY,
  FLICA_SYNC_BANNER_VERIFY_PROGRESS,
  FLICA_SYNC_IMPORT_ROTATING_PROMOS,
  type FlicaSyncPromoItem,
} from './flicaSyncPromoConfig';

export type FlicaSyncPresentationPanel = 'verify' | 'verifyProgress' | 'import' | 'success' | 'error';

export type FlicaSyncSuccessSnapshot = {
  monthLabel: string;
  trips: number;
  block: string;
  credit: string;
  daysOff: number;
};

const SUCCESS_GREEN = '#22C55E';
const STAR_GOLD = '#EAB308';

type VerifyRow = { key: string; label: string; state: 'active' | 'done' | 'pending' };

function VerificationProgressPinkCard({ rows, tip }: { rows: VerifyRow[]; tip: string }) {
  return (
    <View style={pinkStyles.card}>
      <View style={pinkStyles.row}>
        <View style={pinkStyles.radar}>
          {[40, 28, 16].map((sz, i) => (
            <View
              key={i}
              style={[
                pinkStyles.radarRing,
                { width: sz, height: sz, borderRadius: sz / 2, position: 'absolute' as const },
              ]}
            />
          ))}
          <View style={pinkStyles.radarDot} />
        </View>
        <View style={pinkStyles.list}>
          {rows.map((r) => (
            <View key={r.key} style={pinkStyles.listRow}>
              {r.state === 'done' ? (
                <Ionicons name="checkmark-circle" size={18} color={SUCCESS_GREEN} />
              ) : r.state === 'active' ? (
                r.key === 'd' ? (
                  <ActivityIndicator size="small" color={COLORS.red} />
                ) : (
                  <View style={pinkStyles.dotted} />
                )
              ) : r.label.includes('Opening') ? (
                <Ionicons name="time-outline" size={17} color={COLORS.text2} />
              ) : r.label.includes('Importing') ? (
                <Ionicons name="cloud-outline" size={17} color={COLORS.text2} />
              ) : (
                <Ionicons name="ellipse-outline" size={16} color={COLORS.text2} />
              )}
              <Text
                style={[
                  pinkStyles.listTxt,
                  r.state === 'done' && pinkStyles.listTxtDone,
                  r.state === 'pending' && pinkStyles.listTxtPending,
                ]}
                numberOfLines={1}
              >
                {r.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={pinkStyles.tip}>
        <Ionicons name="bulb-outline" size={16} color="#EA580C" />
        <Text style={pinkStyles.tipTxt}>{tip}</Text>
      </View>
    </View>
  );
}

const pinkStyles = StyleSheet.create({
  card: {
    marginTop: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    padding: SPACING.sm,
    ...SHADOW.soft,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  radar: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: {
    borderWidth: 1,
    borderColor: COLORS.red + '55',
  },
  radarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.red,
  },
  list: { flex: 1, minWidth: 0, gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listTxt: { flex: 1, fontSize: 12, fontWeight: '800', color: COLORS.navy },
  listTxtDone: { color: COLORS.text2, fontWeight: '700' },
  listTxtPending: { color: COLORS.text2, fontWeight: '600' },
  dotted: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.red,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: SPACING.sm,
    backgroundColor: '#FFEDD5',
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  tipTxt: { flex: 1, fontSize: 11, fontWeight: '700', color: '#9A3412', lineHeight: 15 },
});

function ImportHoldShimmer() {
  const shift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shift, {
        toValue: 1,
        duration: 1800,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shift]);
  const translateX = shift.interpolate({
    inputRange: [0, 1],
    outputRange: [-140, 420],
  });
  return (
    <View style={shimmerStyles.wrap}>
      <View style={shimmerStyles.tracks}>
        <View style={shimmerStyles.track} />
        <View style={[shimmerStyles.track, { width: '72%' }]} />
        <View style={[shimmerStyles.track, { width: '88%' }]} />
      </View>
      <Animated.View style={[shimmerStyles.sheen, { transform: [{ translateX }] }]} />
      <Text style={shimmerStyles.caption}>We&apos;re preparing your March–May schedule — trips, hotels, and duty rows.</Text>
    </View>
  );
}

const shimmerStyles = StyleSheet.create({
  wrap: {
    marginTop: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.cardAlt,
    overflow: 'hidden',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  tracks: { gap: 8 },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.line + '66',
    width: '100%',
  },
  sheen: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 72,
    backgroundColor: 'rgba(255,255,255,0.5)',
    opacity: 0.35,
  },
  caption: {
    marginTop: SPACING.sm,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text2,
    lineHeight: 15,
    textAlign: 'center',
  },
});

function FlicaSyncRotatingPromoBanners({ items }: { items: FlicaSyncPromoItem[] }) {
  const [idx, setIdx] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => {
      Animated.timing(opacity, { toValue: 0.2, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        setIdx((i) => (i + 1) % items.length);
        Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(id);
  }, [items.length, opacity]);
  const item = items[idx] ?? items[0];
  if (!item) return null;
  return (
    <Animated.View style={{ opacity }}>
      <FlicaSyncPromoBanner item={item} presentationMode="sync" />
    </Animated.View>
  );
}

function SyncContinueCta({ awaitingWeb }: { awaitingWeb: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (awaitingWeb) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.02, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [awaitingWeb, pulse]);
  return (
    <View style={styles.continueCtaShell}>
      <Animated.View
        style={[
          styles.continueCta,
          awaitingWeb && styles.continueCtaDim,
          { transform: [{ scale: pulse }] },
        ]}
      >
        {!awaitingWeb ? <ActivityIndicator color="#fff" style={styles.continueSpinner} /> : null}
        <Text style={styles.continueCtaText}>
          {awaitingWeb ? 'Waiting for verification…' : 'Continuing automatically…'}
        </Text>
      </Animated.View>
      <Text style={styles.continueFoot} numberOfLines={2}>
        {awaitingWeb
          ? 'Finish the prompt in the secure window below. Flight Club advances on its own when FLICA confirms you.'
          : 'Session secured — moving to your schedule.'}
      </Text>
    </View>
  );
}

function ImportMilestonePills({
  parsing,
  totals,
  hotels,
  crew,
}: {
  parsing: boolean;
  totals: boolean;
  hotels: boolean;
  crew: boolean;
}) {
  const items = [
    { k: 'p', label: 'Parsing pairings', on: parsing },
    { k: 't', label: 'Loading totals', on: totals },
    { k: 'h', label: 'Matching hotels', on: hotels },
    { k: 'c', label: 'Preparing crew info', on: crew },
  ];
  return (
    <View style={pillStyles.row}>
      {items.map((it) => (
        <View key={it.k} style={pillStyles.pill}>
          <View style={[pillStyles.dot, it.on && pillStyles.dotOn]} />
          <Text style={pillStyles.pillTxt} numberOfLines={1}>
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const pillStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.line,
  },
  dotOn: { backgroundColor: SUCCESS_GREEN },
  pillTxt: { fontSize: 9, fontWeight: '800', color: COLORS.navy, maxWidth: 118 },
});

type Props = {
  panel: FlicaSyncPresentationPanel;
  progressPhase: FlicaSyncProgressPhase;
  overlayMessage: string;
  statusLines: { contact: boolean; verified: boolean; opening: boolean; importing: boolean };
  importMilestones: {
    parsing: boolean;
    totals: boolean;
    hotels: boolean;
    crew: boolean;
  };
  errorMessage: string | null;
  success: FlicaSyncSuccessSnapshot | null;
  /** @deprecated Promos render below the card; kept for call-site compatibility */
  embedDiscovery?: boolean;
  omitBrandedStripe?: boolean;
  fuseBottomToWebChrome?: boolean;
  /** When FLICA web verification UI is showing — drives pink-card “Contacting” row. */
  webVerificationActive?: boolean;
  onOpenSchedule: () => void;
  onViewImported: () => void;
  onRetryError: () => void;
};

export default function FlicaSyncPresentationLayer({
  panel,
  progressPhase,
  overlayMessage: _overlayMessage,
  statusLines,
  importMilestones,
  errorMessage,
  success,
  embedDiscovery: _embedDiscovery,
  omitBrandedStripe: _omitBrandedStripe = true,
  fuseBottomToWebChrome = false,
  webVerificationActive = false,
  onOpenSchedule: _onOpenSchedule,
  onViewImported,
  onRetryError,
}: Props) {
  void _overlayMessage;
  void _embedDiscovery;
  void _omitBrandedStripe;
  void _onOpenSchedule;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    opacity.setValue(0.97);
    Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [panel, opacity]);

  const verifyRows: VerifyRow[] = useMemo(() => {
    const wv = webVerificationActive;
    return [
      { key: 'a', label: 'Contacting FLICA…', state: wv ? 'active' : 'done' },
      {
        key: 'b',
        label: 'Verification complete',
        state: statusLines.verified ? 'done' : wv ? 'pending' : 'active',
      },
      {
        key: 'c',
        label: 'Opening your schedule…',
        state: statusLines.importing ? 'done' : statusLines.opening ? 'active' : 'pending',
      },
      {
        key: 'd',
        label: 'Importing your data…',
        state: statusLines.importing ? 'active' : 'pending',
      },
    ];
  }, [statusLines, webVerificationActive]);

  const cardChrome =
    fuseBottomToWebChrome && (panel === 'verify' || panel === 'verifyProgress') ? styles.cardFusedBottom : null;

  const stepsPhase: FlicaSyncProgressPhase = panel === 'import' ? 'import' : progressPhase;

  const successBlurb = useMemo(() => {
    if (!success) return '';
    const m = success.monthLabel.trim();
    if (/april/i.test(m)) return 'Your April schedule is now ready in Flight Club.';
    if (/march|may|–|-/i.test(m)) return `Your ${m} window is now ready in Flight Club.`;
    return `${m} is now ready in Flight Club.`;
  }, [success]);

  const stackBody = (
    <>
      <View style={styles.stack}>
        {panel === 'verify' ? (
          <>
            <View style={[styles.card, styles.cardHero, cardChrome]}>
              <Text style={styles.cardTitleCenter}>Secure FLICA Verification</Text>
              <Text style={styles.subCenter}>
                For your security, a quick verification is required before we can import your schedule.
              </Text>
              <FlicaSyncProgressSteps phase={stepsPhase} compact />
              <View style={styles.secureFrame}>
                <View style={styles.secureFrameHead}>
                  <View style={styles.shieldGlyph}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                  <Text style={styles.secureFrameHeadTxt}>Complete the verification below</Text>
                </View>
                <Text style={styles.secureFrameNote} numberOfLines={2}>
                  Only the airline verification prompt below is shown — the rest stays inside the secure browser
                  surface.
                </Text>
              </View>
              <SyncContinueCta awaitingWeb={webVerificationActive} />
              {errorMessage ? <Text style={styles.err}>{errorMessage}</Text> : null}
            </View>
            <FlicaSyncPromoBanner item={FLICA_SYNC_BANNER_VERIFY} presentationMode="sync" />
            <FlicaSyncSmartSuggestionStrip presentationMode="sync" />
          </>
        ) : null}

        {panel === 'verifyProgress' ? (
          <>
            <View style={[styles.card, styles.cardHero, cardChrome]}>
              <Text style={styles.cardTitleCenter}>Verification in progress</Text>
              <Text style={styles.subCenter}>We&apos;re confirming your verification with FLICA…</Text>
              <FlicaSyncProgressSteps phase={stepsPhase} compact />
              {statusLines.verified ? (
                <View style={styles.recaptchaDoneCard}>
                  <Ionicons name="checkmark-circle" size={20} color={SUCCESS_GREEN} />
                  <Text style={styles.recaptchaDoneTxt}>Verification complete</Text>
                </View>
              ) : null}
              <VerificationProgressPinkCard
                rows={verifyRows}
                tip="This will only take a few seconds. Please don’t close this screen."
              />
            </View>
            <FlicaSyncPromoBanner item={FLICA_SYNC_BANNER_VERIFY_PROGRESS} presentationMode="sync" />
          </>
        ) : null}

        {panel === 'import' ? (
          <>
            <View style={[styles.card, styles.cardHero, styles.cardSyncDense]}>
              <Text style={styles.cardTitle}>Importing your schedule</Text>
              <Text style={styles.subTight}>Hang tight — we&apos;re curating your schedule inside Flight Club.</Text>
              <FlicaSyncProgressSteps phase={stepsPhase} compact stepStyle="importMockup" />
              <ImportHoldShimmer />
              <ImportMilestonePills {...importMilestones} />
              <View style={styles.importPromoSlot}>
                <Text style={styles.importPromoKicker}>While you wait</Text>
                <FlicaSyncRotatingPromoBanners items={FLICA_SYNC_IMPORT_ROTATING_PROMOS} />
              </View>
            </View>
          </>
        ) : null}

        {panel === 'success' && success ? (
          <>
            <View style={[styles.card, styles.successCard, styles.cardHero]}>
              <View style={styles.successIconRow}>
                <View style={styles.successCheckWrap}>
                  <Ionicons name="star" size={14} color={STAR_GOLD} style={styles.starL} />
                  <Ionicons name="star" size={14} color={STAR_GOLD} style={styles.starR} />
                  <Ionicons name="checkmark-circle" size={40} color={SUCCESS_GREEN} />
                </View>
              </View>
              <Text style={styles.cardTitleCenter}>Schedule imported</Text>
              <Text style={styles.subCenter}>{successBlurb}</Text>
              <View style={styles.statsRowDivided}>
                <View style={styles.statCell}>
                  <Text style={styles.statLab}>Trips</Text>
                  <Text style={styles.statVal}>{success.trips}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statLab}>Block</Text>
                  <Text style={styles.statVal}>{success.block}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statLab}>Credit</Text>
                  <Text style={styles.statVal}>{success.credit}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statLab}>Days off</Text>
                  <Text style={styles.statVal}>{success.daysOff}</Text>
                </View>
              </View>
              <View style={styles.autoNavHint}>
                <ActivityIndicator size="small" color={COLORS.red} />
                <Text style={styles.autoNavHintTxt}>Opening your crew schedule…</Text>
              </View>
              <Text style={styles.successQuietLine} numberOfLines={2}>
                You don&apos;t need to tap anything — we&apos;ll switch you to Crew Schedule automatically.
              </Text>
              <Pressable style={styles.secondaryOutline} onPress={onViewImported}>
                <Text style={styles.secondaryOutlineTxt}>View Imported Trips</Text>
              </Pressable>
            </View>
            <FlicaSyncPromoBanner item={FLICA_SYNC_BANNER_SUCCESS} variant="slim" presentationMode="sync" />
          </>
        ) : null}

        {panel === 'error' ? (
          <View style={styles.card}>
            <View style={styles.errIcon}>
              <Ionicons name="cloud-offline-outline" size={36} color={COLORS.red} />
            </View>
            <Text style={styles.cardTitle}>We couldn&apos;t finish importing</Text>
            <Text style={styles.subTight}>{errorMessage ?? 'Something went wrong. Try again in a moment.'}</Text>
            <Pressable style={styles.primaryBtn} onPress={onRetryError}>
              <Text style={styles.primaryBtnText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <LinearGradient
      colors={[COLORS.red, '#E8E4E2', COLORS.bg]}
      locations={[0, 0.28, 0.46]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.shellGrad}
    >
      <Animated.View style={[styles.screenLight, { opacity }]} pointerEvents="box-none">
        {panel === 'error' ? (
          <ScrollView
            style={styles.scrollFlex}
            contentContainerStyle={styles.scrollContentError}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <FlicaSyncBrandedHero compact />
            {stackBody}
          </ScrollView>
        ) : (
          <View style={styles.noScrollColumn}>
            <FlicaSyncBrandedHero compact={fuseBottomToWebChrome} syncTight />
            <View style={styles.noScrollBody}>{stackBody}</View>
          </View>
        )}
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  shellGrad: {
    flex: 1,
    minHeight: 0,
  },
  screenLight: {
    flex: 1,
    paddingHorizontal: SPACING.sm,
    minHeight: 0,
  },
  scrollFlex: {
    flex: 1,
  },
  scrollContentError: {
    flexGrow: 1,
    paddingBottom: SPACING.lg + 8,
  },
  noScrollColumn: {
    flex: 1,
    minHeight: 0,
  },
  noScrollBody: {
    flex: 1,
    minHeight: 0,
    paddingBottom: SPACING.sm,
  },
  stack: {
    gap: SPACING.sm,
    justifyContent: 'flex-start',
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...SHADOW.card,
  },
  cardHero: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
  },
  cardSyncDense: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  importPromoSlot: {
    marginTop: SPACING.sm,
  },
  importPromoKicker: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.65,
    marginBottom: 6,
  },
  cardFusedBottom: {
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    marginBottom: -1,
  },
  successCard: { borderColor: COLORS.red + '33' },
  cardTitle: { fontSize: 19, fontWeight: '900', color: COLORS.navy, marginBottom: 6, letterSpacing: -0.35 },
  cardTitleCenter: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.navy,
    marginBottom: 8,
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  subTight: { fontSize: 13, color: COLORS.text2, lineHeight: 18, fontWeight: '600' },
  subCenter: {
    fontSize: 13,
    color: COLORS.text2,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  secureFrame: {
    marginTop: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.red + '44',
    backgroundColor: COLORS.cardAlt,
    padding: SPACING.sm,
  },
  secureFrameHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shieldGlyph: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: COLORS.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secureFrameHeadTxt: { flex: 1, fontSize: 13, fontWeight: '900', color: COLORS.navy },
  secureFrameNote: { marginTop: 6, fontSize: 10, fontWeight: '600', color: COLORS.text2, lineHeight: 14 },
  continueCtaShell: { marginTop: SPACING.sm },
  continueCta: {
    backgroundColor: COLORS.red,
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  continueCtaDim: {
    opacity: 0.78,
  },
  continueSpinner: {
    marginRight: 0,
  },
  continueCtaText: { color: '#fff', fontWeight: '900', fontSize: 15, flexShrink: 1 },
  continueFoot: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text2,
    lineHeight: 15,
    textAlign: 'center',
  },
  recaptchaDoneCard: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.card,
  },
  recaptchaDoneTxt: { fontSize: 13, fontWeight: '800', color: COLORS.navy, flex: 1 },
  err: { marginTop: SPACING.sm, color: COLORS.red, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  successIconRow: { alignItems: 'center', marginBottom: 8 },
  successCheckWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  starL: { position: 'absolute', top: 0, left: 0 },
  starR: { position: 'absolute', top: 2, right: 0 },
  statsRowDivided: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.cardAlt,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  statCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: COLORS.line, marginVertical: 4 },
  statLab: { fontSize: 8, fontWeight: '800', color: COLORS.text2, textTransform: 'uppercase' },
  statVal: { fontSize: 15, fontWeight: '900', color: COLORS.navy, marginTop: 2 },
  successQuietLine: {
    marginTop: SPACING.sm,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text2,
    lineHeight: 17,
    textAlign: 'center',
  },
  autoNavHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: SPACING.sm,
    paddingVertical: 12,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  autoNavHintTxt: { flex: 1, fontSize: 14, fontWeight: '800', color: COLORS.navy },
  primaryBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  secondaryOutline: {
    marginTop: SPACING.sm,
    paddingVertical: 13,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.red,
    backgroundColor: COLORS.card,
  },
  secondaryOutlineTxt: { color: COLORS.red, fontWeight: '900', fontSize: 15 },
  primaryBtn: {
    backgroundColor: COLORS.red,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  errIcon: { alignItems: 'center', marginBottom: SPACING.xs },
});