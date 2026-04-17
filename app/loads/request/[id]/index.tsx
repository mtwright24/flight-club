import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../../../../src/components/FlightClubHeader';
import {
  STAFF_LOADS_VISUAL,
  StaffChip,
  StaffLoadsCardShell,
  staffLoadsAnsweredAccentStripFromSnapshot,
  staffLoadsOpenSeatsHighlightBox,
} from '../../../../src/components/loads/StaffLoadsRequestPresentation';
import { StaffLoadsFlightStatusSection } from '../../../../src/components/loads/StaffLoadsFlightStatusSection';
import { StaffLoadsTileInner } from '../../../../src/components/loads/StaffLoadsTileInner';
import { useAuth } from '../../../../src/hooks/useAuth';
import {
  addStaffRequestComment,
  addStaffRequestStatusUpdate,
  buildStaffRequestActivity,
  deleteStaffLoadRequest,
  filterStaffRequestActivity,
  buildStaffLoadsTimezoneContextLine,
  getStaffLoadRequestDetail,
  listActiveStaffLoadsTravelOfferTemplates,
  listStaffLoadsAirlineNoteEntries,
  listStaffLoadsAirportTimezones,
  listStaffLoadsRouteKnowledge,
  matchStaffLoadsTravelOffersForRequest,
  staffLoadsAirlineDisplayName,
  staffLoadsAirlineNoteCategoryLabel,
  type StaffLoadsAirlineNoteCategory,
  type StaffLoadsAirlineNoteEntry,
  type StaffLoadsAirportTimezone,
  type StaffLoadsRouteKnowledgeBlock,
  type StaffLoadsTravelOfferTemplate,
  isStaffRequestPinned,
  markStaffLoadRequestStale,
  pinStaffRequestForUser,
  reportInaccurateStaffLoads,
  reopenStaleStaffLoadRequest,
  requestStaffLoadRefresh,
  upgradeStaffRequestToPriority,
  updateStaffRequestSettings,
  type NonrevFlightReportSummary,
  type StaffActivityFilter,
  type StaffActivityItem,
  type StaffAnswerRow,
  type StaffInaccuracyReportRow,
  type StaffLoadRequestRow,
  type StaffRequestCommentRow,
  type StaffRequestStatusUpdateRow,
  type StaffTimelineRow,
} from '../../../../src/lib/supabase/staffLoads';
import type { NonRevLoadFlight } from '../../../../src/lib/supabase/loads';
import { buildFlightKey } from '../../../../src/lib/supabase/flightTracker';
import { colors } from '../../../../src/styles/theme';

function normalizeFlightNumberForTracker(raw: string | null | undefined): string {
  const s = (raw || '').trim().toUpperCase();
  const m = s.match(/(\d+[A-Z]?)$/);
  return m ? m[1] : s.replace(/\D/g, '') || '1';
}

function formatDurationLabel(depIso: string | null | undefined, arrIso: string | null | undefined): string | null {
  if (!depIso || !arrIso) return null;
  const ms = Math.max(0, new Date(arrIso).getTime() - new Date(depIso).getTime());
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m block time`;
}

/** StaffTraveler-style “about 21 hours ago” copy. */
function formatRelativeTimeAgo(iso: string | null | undefined): string {
  if (!iso) return 'recently';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'recently';
  const ms = Math.max(0, Date.now() - d.getTime());
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'just now';
  if (mins < 60) return `about ${mins} minute${mins === 1 ? '' : 's'} ago`;
  if (hours < 24) return `about ${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (days < 7) return `about ${days} day${days === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString();
}

function formatCabinLabel(key: string): string {
  const lower = key.trim().toLowerCase();
  if (lower === 'f' || lower === 'first') return 'First';
  if (lower === 'j' || lower === 'business' || lower === 'biz') return 'Business';
  if (lower === 'w' || lower === 'premium' || lower === 'premium_economy' || lower === 'premium economy') return 'Premium Eco';
  if (lower === 'y' || lower === 'eco' || lower === 'economy' || lower === 'coach') return 'Eco';
  if (lower === 'main') return 'Main';
  if (!key) return 'Cabin';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function cabinBreakdownForDisplay(by: Record<string, unknown> | null | undefined): { label: string; n: number }[] {
  if (!by || typeof by !== 'object') return [];
  return Object.entries(by)
    .map(([k, raw]) => ({
      label: formatCabinLabel(k),
      n: typeof raw === 'number' ? raw : Number(raw) || 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function timelineEventLabel(eventType: string): string {
  switch (eventType) {
    case 'answer':
    case 'loads_update':
      return 'Loads update';
    case 'status_update':
      return 'Status';
    case 'gate_change':
      return 'Gate';
    case 'request_created':
      return 'Request';
    case 'priority_upgrade':
      return 'Priority';
    case 'report_inaccurate':
      return 'Inaccuracy';
    case 'refresh_requested':
      return 'Refresh';
    case 'pin':
      return 'Pin';
    case 'settings':
      return 'Settings';
    case 'system':
      return 'System';
    default:
      return eventType;
  }
}

function routeKnowledgeKindLabel(kind: StaffLoadsRouteKnowledgeBlock['block_kind']): string {
  switch (kind) {
    case 'timezone':
      return 'Timezone';
    case 'weather':
      return 'Weather';
    case 'route_context':
      return 'Route';
    case 'arrival':
      return 'Arrival';
    default:
      return 'Tip';
  }
}

function statusKindLabel(kind: StaffRequestStatusUpdateRow['kind']): string {
  switch (kind) {
    case 'gate_change':
      return 'Gate change';
    case 'terminal':
      return 'Terminal';
    case 'flight_status':
      return 'Flight status';
    case 'dep_arr':
      return 'Dep / arr';
    case 'ops_note':
      return 'Ops note';
    default:
      return kind;
  }
}

function renderActivityBody(it: StaffActivityItem): { title: string; subtitle?: string; body: string; meta: string } {
  if (it.source === 'comment') {
    return {
      title: it.author?.display_name || 'Crew',
      body: it.body,
      meta: new Date(it.created_at).toLocaleString(),
    };
  }
  if (it.source === 'status_update') {
    return {
      title: it.title?.trim() ? it.title! : statusKindLabel(it.kind),
      body: it.body,
      meta: `${new Date(it.created_at).toLocaleString()} · ${it.author?.display_name || 'Crew'}`,
    };
  }
  const t = it.row;
  const actor = t.actor?.display_name || (t.actor_user_id ? 'Crew' : 'System');
  return {
    title: t.title?.trim() ? t.title! : timelineEventLabel(t.event_type),
    subtitle: timelineEventLabel(t.event_type),
    body: t.body?.trim() || '',
    meta: `${new Date(t.created_at).toLocaleString()} · ${actor}`,
  };
}

export default function StaffLoadRequestDetailRoute() {
  const { id, focusReport: focusReportParam, focusRefresh: focusRefreshParam } = useLocalSearchParams<{
    id: string;
    focusReport?: string | string[];
    focusRefresh?: string | string[];
  }>();
  const focusReport = Array.isArray(focusReportParam) ? focusReportParam[0] : focusReportParam;
  const focusRefresh = Array.isArray(focusRefreshParam) ? focusRefreshParam[0] : focusRefreshParam;
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [request, setRequest] = useState<StaffLoadRequestRow | null>(null);
  const [flight, setFlight] = useState<NonRevLoadFlight | null>(null);
  const [timeline, setTimeline] = useState<StaffTimelineRow[]>([]);
  const [answers, setAnswers] = useState<StaffAnswerRow[]>([]);
  const [comments, setComments] = useState<StaffRequestCommentRow[]>([]);
  const [statusUpdates, setStatusUpdates] = useState<StaffRequestStatusUpdateRow[]>([]);
  const [inaccuracyReports, setInaccuracyReports] = useState<StaffInaccuracyReportRow[]>([]);
  const [airlineNoteEntries, setAirlineNoteEntries] = useState<StaffLoadsAirlineNoteEntry[]>([]);
  const [routeKnowledgeBlocks, setRouteKnowledgeBlocks] = useState<StaffLoadsRouteKnowledgeBlock[]>([]);
  const [airportTzRows, setAirportTzRows] = useState<StaffLoadsAirportTimezone[]>([]);
  const [travelOfferCards, setTravelOfferCards] = useState<StaffLoadsTravelOfferTemplate[]>([]);
  const [airlineNotesExpanded, setAirlineNotesExpanded] = useState(false);
  const [goodToKnowExpanded, setGoodToKnowExpanded] = useState(true);
  const [airlineNotesModalOpen, setAirlineNotesModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [lockHolderDisplayName, setLockHolderDisplayName] = useState<string | null>(null);
  const [reportSummary, setReportSummary] = useState<NonrevFlightReportSummary | null>(null);
  const [activityFilter, setActivityFilter] = useState<StaffActivityFilter>('all');

  const [textModal, setTextModal] = useState<null | 'report' | 'refresh' | 'status'>(null);
  const [modalText, setModalText] = useState('');
  const [statusKind, setStatusKind] = useState<StaffRequestStatusUpdateRow['kind']>('ops_note');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const d = await getStaffLoadRequestDetail(id);
    setRequest(d.request);
    setFlight(d.flight);
    setTimeline(d.timeline);
    setAnswers(d.answers);
    setComments(d.comments);
    setStatusUpdates(d.statusUpdates);
    setInaccuracyReports(d.inaccuracyReports);
    setLockHolderDisplayName(d.lockHolderDisplayName ?? null);
    setReportSummary(d.reportSummary ?? null);
    if (d.request) {
      const code = d.request.airline_code;
      const from = d.request.from_airport;
      const to = d.request.to_airport;
      const date = d.request.travel_date;
      const [notesRes, rkRes, tzRows, offers] = await Promise.all([
        listStaffLoadsAirlineNoteEntries(code),
        listStaffLoadsRouteKnowledge({ fromAirport: from, toAirport: to, travelDate: date }),
        listStaffLoadsAirportTimezones([from, to]),
        listActiveStaffLoadsTravelOfferTemplates(),
      ]);
      setAirlineNoteEntries(notesRes.data);
      setRouteKnowledgeBlocks(rkRes.data);
      setAirportTzRows(tzRows);
      setTravelOfferCards(matchStaffLoadsTravelOffersForRequest(offers, from, to));
    } else {
      setAirlineNoteEntries([]);
      setRouteKnowledgeBlocks([]);
      setAirportTzRows([]);
      setTravelOfferCards([]);
    }
    if (userId && id) {
      setPinned(await isStaffRequestPinned(userId, id));
    }
    setLoading(false);
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const mine = request && userId && request.user_id === userId;
  const latest = answers.find((a) => a.is_latest) ?? answers[0];
  const lockActive =
    request?.locked_by &&
    request.lock_expires_at &&
    new Date(request.lock_expires_at).getTime() > Date.now();
  const lockedByOther = !!(lockActive && userId && request.locked_by !== userId);
  const openCabinBreakdown = latest
    ? cabinBreakdownForDisplay(latest.open_seats_by_cabin as Record<string, unknown> | null | undefined)
    : [];
  const nonrevCabinBreakdown = latest
    ? cabinBreakdownForDisplay(latest.nonrev_by_cabin as Record<string, unknown> | null | undefined)
    : [];
  const canRespondLoads =
    !!userId &&
    !!request &&
    request.user_id !== userId &&
    (request.status === 'open' || request.status === 'answered') &&
    !lockedByOther;

  const activity = useMemo(
    () => buildStaffRequestActivity(comments, statusUpdates, timeline),
    [comments, statusUpdates, timeline]
  );
  const filteredActivity = useMemo(() => filterStaffRequestActivity(activity, activityFilter), [activity, activityFilter]);

  const commentsCount = comments.length;
  const loadsUpdatesCount = answers.length;
  const statusEventsCount =
    statusUpdates.length +
    timeline.filter((t) =>
      ['status_update', 'gate_change', 'refresh_requested', 'report_inaccurate'].includes(t.event_type)
    ).length;

  const openSeatsHighlight = useMemo(
    () =>
      latest
        ? staffLoadsOpenSeatsHighlightBox(latest.open_seats_total, latest.nonrev_listed_total, latest.load_level)
        : null,
    [latest]
  );

  const summaryAccentStrip = useMemo(
    () =>
      latest
        ? staffLoadsAnsweredAccentStripFromSnapshot({
            openSeats: latest.open_seats_total,
            listedNonrev: latest.nonrev_listed_total,
            loadLevel: latest.load_level,
          })
        : STAFF_LOADS_VISUAL.strip.neutral,
    [latest]
  );

  const canAddStructuredStatus = !!userId && !!request && (mine || request.enable_status_updates);

  const timezoneContextLine = useMemo(() => {
    if (!request) return null;
    return buildStaffLoadsTimezoneContextLine(
      request.travel_date,
      request.from_airport,
      request.to_airport,
      airportTzRows
    );
  }, [request, airportTzRows]);

  const airlineNoteCategories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of airlineNoteEntries) {
      if (!seen.has(e.note_category)) {
        seen.add(e.note_category);
        out.push(e.note_category);
      }
    }
    return out;
  }, [airlineNoteEntries]);

  const openTextModal = (kind: 'report' | 'refresh' | 'status') => {
    setModalText('');
    if (kind === 'status') setStatusKind('ops_note');
    setTextModal(kind);
  };

  const submitTextModal = async () => {
    if (!request || !userId) return;
    const raw = modalText.trim();
    if (textModal === 'report') {
      if (!latest) {
        Alert.alert('Nothing to report', 'There is no loads answer on this request yet.');
        setTextModal(null);
        return;
      }
      const r = await reportInaccurateStaffLoads(request.id, latest.id, raw || undefined);
      if (!r.ok) Alert.alert('Report', r.error || 'Failed');
      else if (r.duplicate) Alert.alert('Already reported', 'You already flagged this answer.');
      else void load();
      setTextModal(null);
      return;
    }
    if (textModal === 'refresh') {
      if (!mine) {
        setTextModal(null);
        return;
      }
      const r = await requestStaffLoadRefresh(request.id, raw);
      if (!r.ok) Alert.alert('Request update', r.error || 'Failed');
      else void load();
      setTextModal(null);
      return;
    }
    if (textModal === 'status') {
      if (!raw) {
        Alert.alert('Status update', 'Add a short note.');
        return;
      }
      const r = await addStaffRequestStatusUpdate(request.id, { kind: statusKind, body: raw });
      if (!r.ok) Alert.alert('Status update', r.error || 'Failed');
      else void load();
      setTextModal(null);
    }
  };

  useEffect(() => {
    if (focusReport !== '1' || !request || loading) return;
    const latestA = answers.find((a) => a.is_latest) ?? answers[0];
    if (!latestA) {
      Alert.alert('Nothing to report', 'There is no loads answer on this request yet.');
      router.setParams({ focusReport: undefined } as never);
      return;
    }
    openTextModal('report');
    router.setParams({ focusReport: undefined } as never);
  }, [focusReport, request, loading, answers, router]);

  useEffect(() => {
    if (focusRefresh !== '1' || !request || !mine || loading) return;
    openTextModal('refresh');
    router.setParams({ focusRefresh: undefined } as never);
  }, [focusRefresh, request, mine, loading, router]);

  const onMore = async (action: string) => {
    if (!request || !userId) return;
    setMoreOpen(false);
    if (action === 'upgrade' && mine) {
      const r = await upgradeStaffRequestToPriority(request.id);
      if (!r.ok) {
        const e = r.error || '';
        if (e.includes('insufficient') || e.includes('credit')) {
          Alert.alert('Not enough credits', 'Upgrade costs 1 additional credit. Add credits in the Wallet tab.', [
            { text: 'Wallet', onPress: () => router.push('/loads?tab=wallet' as any) },
            { text: 'OK', style: 'cancel' },
          ]);
        } else Alert.alert('Upgrade', e || 'Could not upgrade.');
      }
      void load();
    }
    if (action === 'delete' && mine) {
      Alert.alert('Delete request?', 'Credits will be refunded if there are no answers yet.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const d = await deleteStaffLoadRequest(request.id);
            if (!d.ok) Alert.alert('Delete', d.error || 'Failed');
            else router.back();
          },
        },
      ]);
    }
    if (action === 'pin') {
      const next = !pinned;
      const r = await pinStaffRequestForUser(userId, request.id, next);
      if (r.ok) setPinned(next);
    }
    if (action === 'status' && mine) {
      await updateStaffRequestSettings(request.id, { enable_status_updates: !request.enable_status_updates });
      void load();
    }
    if (action === 'auto' && mine) {
      await updateStaffRequestSettings(request.id, { enable_auto_updates: !request.enable_auto_updates });
      void load();
    }
    if (action === 'share') {
      const url = `flightclub://loads/request/${request.id}`;
      await Share.share({
        message: `${request.airline_code} ${request.from_airport}→${request.to_airport} ${request.travel_date}\n${url}`,
      });
    }
    if (action === 'report') {
      if (!latest) {
        Alert.alert('Nothing to report', 'There is no loads answer on this request yet.');
        return;
      }
      openTextModal('report');
    }
    if (action === 'history') {
      router.push(`/loads/request/${request.id}/history`);
    }
    if (action === 'update' && mine) {
      openTextModal('refresh');
    }
  };

  const sendComment = async () => {
    if (!id || !comment.trim()) return;
    const r = await addStaffRequestComment(id, comment.trim());
    if (r.ok) {
      setComment('');
      void load();
    } else Alert.alert('Comment', r.error || 'Failed');
  };

  const openFlightTracker = useCallback(() => {
    if (!request) return;
    const fn = normalizeFlightNumberForTracker(request.flight_number);
    if (!fn || !request.travel_date) {
      router.push('/flight-tracker' as any);
      return;
    }
    const key = buildFlightKey({
      airlineCode: request.airline_code,
      flightNumber: fn,
      serviceDate: request.travel_date,
      origin: request.from_airport,
      destination: request.to_airport,
    });
    router.push(`/flight-tracker/flight/${encodeURIComponent(key)}` as any);
  }, [request, router]);

  const onToggleFlightStatusPush = useCallback(
    async (next: boolean) => {
      if (!mine || !request) return;
      const r = await updateStaffRequestSettings(request.id, { enable_auto_updates: next });
      if (!r.ok) Alert.alert('Settings', r.error || 'Could not update');
      else void load();
    },
    [mine, request, load]
  );

  if (loading || !request) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <FlightClubHeader title="Load request" showLogo={false} />
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.headerRed} />
      </SafeAreaView>
    );
  }

  const depIso = flight?.depart_at ?? request.depart_at ?? null;
  const arrIso = flight?.arrive_at ?? request.arrive_at ?? null;
  const flightStatusLastUpdated = latest?.as_of ?? latest?.created_at ?? request.created_at ?? flight?.created_at ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlightClubHeader title="Load request" showLogo={false} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.pad}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        {!latest ? (
          <StaffLoadsCardShell accentColor={STAFF_LOADS_VISUAL.strip.neutral} style={styles.headerShell}>
            <StaffLoadsTileInner
              airlineCode={request.airline_code}
              flightNumber={request.flight_number}
              fromAirport={request.from_airport}
              toAirport={request.to_airport}
              travelDate={request.travel_date}
              departAt={depIso}
              arriveAt={arrIso}
              aircraftType={(flight as { aircraft_type?: string } | null)?.aircraft_type ?? request.aircraft_type ?? null}
              flightIdForPlaceholder={request.id}
              previewLine={null}
              edgeAction={
                <Pressable
                  style={styles.stEdgeKebab}
                  onPress={() => setMoreOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="More actions"
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color="#94a3b8" />
                </Pressable>
              }
              trailingBadge={
                request.request_kind === 'priority' ? (
                  <StaffChip
                    label="Priority"
                    backgroundColor={STAFF_LOADS_VISUAL.chip.bgPriority}
                    color={STAFF_LOADS_VISUAL.chip.fgPriority}
                  />
                ) : null
              }
            />
            {request.request_kind === 'priority' && request.priority_upgraded_at ? (
              <Text style={styles.upgradeMeta}>Priority since {new Date(request.priority_upgraded_at).toLocaleDateString()}</Text>
            ) : null}
            {request.refresh_requested_at ? (
              <View style={styles.calloutRefresh}>
                <Ionicons name="refresh-circle-outline" size={16} color={STAFF_LOADS_VISUAL.chip.fgRefresh} />
                <Text style={styles.calloutRefreshTx} numberOfLines={2}>
                  Refresh requested · {new Date(request.refresh_requested_at).toLocaleString()}
                </Text>
              </View>
            ) : null}
            {lockActive ? (
              <View style={styles.calloutLock}>
                <Ionicons name="lock-closed-outline" size={16} color={STAFF_LOADS_VISUAL.chip.fgLock} />
                <Text style={styles.calloutLockTx} numberOfLines={3}>
                  {lockedByOther
                    ? lockHolderDisplayName
                      ? `${lockHolderDisplayName} is answering.`
                      : 'Another crew member is answering.'
                    : 'You have the answer lock — finish on the answer screen.'}
                </Text>
              </View>
            ) : null}
          </StaffLoadsCardShell>
        ) : null}

        {!latest ? (
          <View style={styles.sectionLabelRow}>
            <View style={styles.sectionAccentRule} />
            <Text style={styles.sectionTitle}>Loads summary</Text>
          </View>
        ) : null}
        <StaffLoadsCardShell accentColor={summaryAccentStrip} compact={!!latest} style={styles.summaryShell}>
          {latest ? (
            <>
              <StaffLoadsTileInner
                airlineCode={request.airline_code}
                flightNumber={request.flight_number}
                fromAirport={request.from_airport}
                toAirport={request.to_airport}
                travelDate={request.travel_date}
                departAt={depIso}
                arriveAt={arrIso}
                aircraftType={(flight as { aircraft_type?: string } | null)?.aircraft_type ?? request.aircraft_type ?? null}
                flightIdForPlaceholder={request.id}
                previewLine={null}
                trailingBadge={
                  request.request_kind === 'priority' ? (
                    <StaffChip
                      label="Priority"
                      size="sm"
                      backgroundColor={STAFF_LOADS_VISUAL.chip.bgPriority}
                      color={STAFF_LOADS_VISUAL.chip.fgPriority}
                    />
                  ) : null
                }
                edgeAction={
                  <Pressable
                    style={styles.stEdgeKebab}
                    onPress={() => setMoreOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="More actions"
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                  >
                    <Ionicons name="ellipsis-vertical" size={18} color="#94a3b8" />
                  </Pressable>
                }
              />

              <View style={styles.stSummaryDivider} />

              {request.refresh_requested_at ? (
                <View style={styles.stUpdateBannerCompact}>
                  <Text style={styles.stUpdateBannerTxCompact}>An update has been requested.</Text>
                </View>
              ) : null}
              {lockActive ? (
                <View style={styles.stLockBannerCompact}>
                  <Ionicons name="lock-closed-outline" size={14} color={colors.headerRed} />
                  <Text style={styles.stLockBannerTxCompact} numberOfLines={3}>
                    {lockedByOther
                      ? lockHolderDisplayName
                        ? `${lockHolderDisplayName} is answering.`
                        : 'Another crew member is answering.'
                      : 'You have the answer lock — finish on the answer screen.'}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.stSectionTitle}>Open seats</Text>
              <View style={styles.stMetricRow}>
                <View
                  style={[
                    styles.stTotalBoxOpen,
                    openSeatsHighlight && {
                      backgroundColor: openSeatsHighlight.bg,
                      borderColor: openSeatsHighlight.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.stTotalNum, openSeatsHighlight && { color: openSeatsHighlight.fg }]}>
                    {latest.open_seats_total ?? '—'}
                  </Text>
                  <Text style={[styles.stTotalLabel, openSeatsHighlight && { color: openSeatsHighlight.labelFg }]}>
                    Total
                  </Text>
                </View>
                <View style={styles.stCabinStations}>
                  {openCabinBreakdown.length ? (
                    openCabinBreakdown.map((c) => (
                      <View key={`o-${c.label}`} style={styles.stCabinStation}>
                        <Text style={styles.stCabinStationNum}>{c.n}</Text>
                        <Text style={styles.stCabinStationLbl}>{c.label}</Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.stCabinMutedWrap}>
                      <Text style={styles.stCabinMuted}>No cabin breakdown</Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={[styles.stSectionTitle, styles.stSectionTitleSpaced]}>Listed non-rev passengers</Text>
              <View style={styles.stMetricRow}>
                <View style={styles.stTotalBoxNonrev}>
                  <Text style={styles.stTotalNumDark}>{latest.nonrev_listed_total ?? '—'}</Text>
                  <Text style={styles.stTotalLabelDark}>Total</Text>
                </View>
                <View style={styles.stCabinStations}>
                  {nonrevCabinBreakdown.length ? (
                    nonrevCabinBreakdown.map((c) => (
                      <View key={`n-${c.label}`} style={styles.stCabinStation}>
                        <Text style={styles.stCabinStationNum}>{c.n}</Text>
                        <Text style={styles.stCabinStationLbl}>{c.label}</Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.stCabinMutedWrap}>
                      <Text style={styles.stCabinMuted}>No cabin breakdown</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.stFooterRow}>
                <Ionicons name="person-circle-outline" size={12} color="#e2e8f0" />
                <Text style={styles.stFooterTx}>
                  Updated {formatRelativeTimeAgo(latest.as_of || latest.created_at)} by {latest.responder?.display_name || 'Crew'}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.emptyLoads}>
              <Text style={styles.emptyLoadsTitle}>Awaiting first answer</Text>
              <Text style={styles.muted}>No community loads on this request yet.</Text>
            </View>
          )}
        </StaffLoadsCardShell>

        <StaffLoadsFlightStatusSection
          airlineCode={request.airline_code}
          flightNumber={request.flight_number}
          fromAirport={request.from_airport}
          toAirport={request.to_airport}
          travelDate={request.travel_date}
          departAt={depIso}
          arriveAt={arrIso}
          aircraftType={(flight as { aircraft_type?: string } | null)?.aircraft_type ?? request.aircraft_type ?? null}
          lastUpdatedIso={flightStatusLastUpdated}
          enableFlightStatusPush={!!request.enable_auto_updates}
          onToggleFlightStatusPush={onToggleFlightStatusPush}
          canEditPush={!!mine}
          onOpenFlightTracker={openFlightTracker}
        />

        <View style={styles.card}>
          <Text style={styles.toggleMeta}>
            Community status notes on this request: {request.enable_status_updates ? 'On' : 'Off'}
          </Text>
          {!mine && !request.enable_status_updates ? (
            <Text style={styles.mutedSmall}>The requester has not enabled community status notes on this request.</Text>
          ) : null}
          {canAddStructuredStatus ? (
            <Pressable style={styles.outlineBtn} onPress={() => openTextModal('status')}>
              <Text style={styles.outlineBtnTx}>Add gate / status note</Text>
            </Pressable>
          ) : null}
          {reportSummary && reportSummary.count > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.cabinHead}>Recent community load reports ({reportSummary.count})</Text>
              {reportSummary.recent.slice(0, 6).map((r, i) => (
                <Text key={`${r.created_at}-${i}`} style={styles.reportLine}>
                  {r.status} · {new Date(r.created_at).toLocaleString()}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.mutedSmall}>No separate flight-level load reports yet. Loads above are from this Staff Loads request.</Text>
          )}
        </View>

        <View style={styles.sectionLabelRow}>
          <View style={styles.sectionAccentRule} />
          <Text style={styles.sectionTitle}>Activity</Text>
        </View>
        <Text style={styles.countLineMuted}>
          {commentsCount} comments · {loadsUpdatesCount} load updates · {statusEventsCount} status
        </Text>
        <View style={styles.chipsRow}>
          {(['all', 'loads', 'comments', 'status'] as StaffActivityFilter[]).map((f) => (
            <Pressable
              key={f}
              style={[styles.filterChip, activityFilter === f && styles.filterChipOn]}
              onPress={() => setActivityFilter(f)}
            >
              <Text style={[styles.filterChipTx, activityFilter === f && styles.filterChipTxOn]}>
                {f === 'all' ? 'All' : f === 'loads' ? 'Loads' : f === 'comments' ? 'Comments' : 'Status'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Add a comment on this request…"
            value={comment}
            onChangeText={setComment}
            multiline
          />
          <Pressable style={styles.sendC} onPress={() => void sendComment()}>
            <Text style={styles.sendCtx}>Post comment</Text>
          </Pressable>
          {filteredActivity.length === 0 ? (
            <View style={styles.activityEmpty}>
              <Ionicons name="chatbubbles-outline" size={28} color="#cbd5e1" />
              <Text style={styles.activityEmptyTx}>Nothing in this filter yet.</Text>
              <Text style={styles.activityEmptySub}>Try All, or post a comment above.</Text>
            </View>
          ) : (
            filteredActivity.map((it) => {
              const { title, subtitle, body, meta } = renderActivityBody(it);
              const key =
                it.source === 'timeline' ? `tl-${it.row.id}` : it.source === 'comment' ? `c-${it.id}` : `s-${it.id}`;
              return (
                <View key={key} style={styles.tlRow}>
                  {subtitle ? <Text style={styles.tlType}>{subtitle}</Text> : null}
                  <Text style={styles.tlTitle}>{title}</Text>
                  {body ? <Text style={styles.tlBody}>{body}</Text> : null}
                  <Text style={styles.tlTime}>{meta}</Text>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.sectionLabelRow}>
          <View style={styles.sectionAccentRule} />
          <Text style={styles.sectionTitle}>Flight & status</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.muted}>
            Scheduled: {depIso ? new Date(depIso).toLocaleString() : '—'} → {arrIso ? new Date(arrIso).toLocaleString() : '—'}
          </Text>
          <Text style={styles.muted}>Aircraft: {(flight as { aircraft_type?: string } | null)?.aircraft_type || request.aircraft_type || '—'}</Text>
          <Text style={styles.toggleMeta}>
            Status updates (request): {request.enable_status_updates ? 'On' : 'Off'} · Auto updates:{' '}
            {request.enable_auto_updates ? 'On' : 'Off'}
          </Text>
          {!mine && !request.enable_status_updates ? (
            <Text style={styles.mutedSmall}>The requester has not enabled community status notes on this request.</Text>
          ) : null}
          {canAddStructuredStatus ? (
            <Pressable style={styles.outlineBtn} onPress={() => openTextModal('status')}>
              <Text style={styles.outlineBtnTx}>Add gate / status note</Text>
            </Pressable>
          ) : null}
          {reportSummary && reportSummary.count > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.cabinHead}>Recent community load reports ({reportSummary.count})</Text>
              {reportSummary.recent.slice(0, 6).map((r, i) => (
                <Text key={`${r.created_at}-${i}`} style={styles.reportLine}>
                  {r.status} · {new Date(r.created_at).toLocaleString()}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.mutedSmall}>No separate flight-level load reports yet. Loads above are from this Staff Loads request.</Text>
          )}
        </View>

        <View style={styles.sectionLabelRow}>
          <View style={styles.sectionAccentRule} />
          <Text style={styles.sectionTitle}>Airline notes · {staffLoadsAirlineDisplayName(request.airline_code)}</Text>
        </View>
        <View style={styles.card}>
          {airlineNoteEntries.length === 0 ? (
            <Text style={styles.muted}>No structured airline notes in the library for this carrier yet.</Text>
          ) : (
            <>
              <Text style={styles.knowledgeMeta}>
                {airlineNoteEntries.length} active note{airlineNoteEntries.length === 1 ? '' : 's'} · tap header to{' '}
                {airlineNotesExpanded ? 'collapse' : 'expand'}
              </Text>
              <Pressable
                style={styles.expandHeader}
                onPress={() => setAirlineNotesExpanded((e) => !e)}
                accessibilityRole="button"
              >
                <Text style={styles.expandHeaderTx}>Standby, check-in & policy reminders</Text>
                <Ionicons name={airlineNotesExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.headerRed} />
              </Pressable>
              {(airlineNotesExpanded ? airlineNoteEntries : airlineNoteEntries.slice(0, 2)).map((e) => (
                <View key={e.id} style={styles.noteEntry}>
                  <Text style={styles.noteCat}>{staffLoadsAirlineNoteCategoryLabel(e.note_category)}</Text>
                  <Text style={styles.noteTitle}>{e.title}</Text>
                  <Text style={styles.noteBody}>{e.body}</Text>
                </View>
              ))}
              {!airlineNotesExpanded && airlineNoteEntries.length > 2 ? (
                <Text style={styles.moreHint}>+{airlineNoteEntries.length - 2} more in this airline library</Text>
              ) : null}
              <Pressable style={styles.textLink} onPress={() => setAirlineNotesModalOpen(true)}>
                <Text style={styles.textLinkTx}>See all notes (by category)</Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.sectionLabelRow}>
          <View style={styles.sectionAccentRule} />
          <Text style={styles.sectionTitle}>Good to know</Text>
        </View>
        <Text style={styles.knowledgeSub}>Route & destination context</Text>
        <View style={styles.card}>
          <Pressable style={styles.expandHeader} onPress={() => setGoodToKnowExpanded((e) => !e)} accessibilityRole="button">
            <Text style={styles.expandHeaderTx}>Timezones, weather slots & route tips</Text>
            <Ionicons name={goodToKnowExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.headerRed} />
          </Pressable>
          {goodToKnowExpanded ? (
            <>
              {timezoneContextLine ? (
                <View style={styles.gtkBlock}>
                  <Text style={styles.gtkKind}>Local clocks</Text>
                  <Text style={styles.gtkBody}>{timezoneContextLine}</Text>
                </View>
              ) : (
                <Text style={styles.mutedSmall}>
                  Clock compare needs both {request.from_airport} and {request.to_airport} in staff_loads_airport_timezones.
                  Missing airports can be added in Supabase without an app release.
                </Text>
              )}
              {routeKnowledgeBlocks.map((b) => (
                <View key={b.id} style={styles.gtkBlock}>
                  <Text style={styles.gtkKind}>{routeKnowledgeKindLabel(b.block_kind)}</Text>
                  <Text style={styles.gtkTitle}>{b.title}</Text>
                  <Text style={styles.gtkBody}>{b.body.trim() || '—'}</Text>
                </View>
              ))}
              {!timezoneContextLine && routeKnowledgeBlocks.length === 0 ? (
                <Text style={styles.muted}>
                  No matching rows in staff_loads_route_knowledge for this origin, destination, and travel date yet.
                </Text>
              ) : null}
            </>
          ) : null}
        </View>

        {travelOfferCards.length > 0 ? (
          <>
            <View style={styles.sectionLabelRow}>
              <View style={styles.sectionAccentRule} />
              <Text style={styles.sectionTitle}>Travel add-ons</Text>
            </View>
            <Text style={styles.knowledgeSub}>Optional extras</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.travelRow}>
              {travelOfferCards.map((o) => (
                <Pressable
                  key={o.id}
                  style={styles.travelCard}
                  onPress={() => {
                    if (o.detail_url) void Linking.openURL(o.detail_url);
                  }}
                >
                  <Ionicons
                    name={o.offer_kind === 'hotel' ? 'bed' : o.offer_kind === 'car' ? 'car' : o.offer_kind === 'esim' ? 'phone-portrait' : 'pricetag'}
                    size={22}
                    color={colors.headerRed}
                  />
                  <Text style={styles.travelTitle}>{o.title}</Text>
                  {o.subtitle ? <Text style={styles.travelSub}>{o.subtitle}</Text> : null}
                  {o.detail_url ? <Text style={styles.travelLink}>Open</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {mine && request.status === 'answered' ? (
          <Pressable
            style={styles.secondary}
            onPress={() => {
              Alert.alert('Mark stale?', 'Hides this from “open” style flows until you reopen it for fresh loads.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Mark stale',
                  style: 'destructive',
                  onPress: async () => {
                    const r = await markStaffLoadRequestStale(request.id);
                    if (!r.ok) Alert.alert('Could not update', r.error || 'Try again.');
                    void load();
                  },
                },
              ]);
            }}
          >
            <Text style={styles.secondaryTx}>Mark needs refresh (stale)</Text>
          </Pressable>
        ) : null}
        {mine && request.status === 'stale' ? (
          <Pressable
            style={styles.primary}
            onPress={async () => {
              const r = await reopenStaleStaffLoadRequest(request.id);
              if (!r.ok) Alert.alert('Could not reopen', r.error || 'Try again.');
              else void load();
            }}
          >
            <Text style={styles.primaryTx}>Reopen for new load answers</Text>
          </Pressable>
        ) : null}

        {canRespondLoads ? (
          <Pressable style={styles.primary} onPress={() => router.push(`/loads/answer/${request.id}`)}>
            <Text style={styles.primaryTx}>Answer this request</Text>
          </Pressable>
        ) : null}
        {userId && request.user_id !== userId && lockedByOther && (request.status === 'open' || request.status === 'answered') ? (
          <View style={styles.lockedHint}>
            <Text style={styles.lockedHintTx}>Another responder is answering right now. Try again in a few minutes.</Text>
          </View>
        ) : null}

        <Pressable style={styles.moreBtn} onPress={() => setMoreOpen(true)} accessibilityHint="Pin, share, report, and request settings">
          <Text style={styles.moreBtnTx}>More actions</Text>
          <Text style={styles.moreBtnSub}>Pin · share · report · toggles</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={styles.moOverlay} onPress={() => setMoreOpen(false)}>
          <View style={styles.moSheet}>
            <Text style={styles.moTitle}>More actions</Text>
            {mine ? (
              <>
                <Pressable style={styles.moRow} onPress={() => void onMore('update')}>
                  <Text style={styles.moTx}>Request update</Text>
                </Pressable>
                {request.request_kind === 'standard' ? (
                  <Pressable style={styles.moRow} onPress={() => void onMore('upgrade')}>
                    <Text style={styles.moTx}>Upgrade to priority (+1 credit)</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.moRow} onPress={() => void onMore('status')}>
                  <Text style={styles.moTx}>Status updates: {request.enable_status_updates ? 'On' : 'Off'}</Text>
                </Pressable>
                <Pressable style={styles.moRow} onPress={() => void onMore('auto')}>
                  <Text style={styles.moTx}>Auto updates: {request.enable_auto_updates ? 'On' : 'Off'}</Text>
                </Pressable>
                <Pressable style={styles.moRow} onPress={() => void onMore('delete')}>
                  <Text style={[styles.moTx, { color: '#b91c1c' }]}>Delete request</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable style={styles.moRow} onPress={() => void onMore('history')}>
              <Text style={styles.moTx}>View loads history</Text>
            </Pressable>
            <Pressable style={styles.moRow} onPress={() => void onMore('pin')}>
              <Text style={styles.moTx}>{pinned ? 'Unpin' : 'Pin'} flight</Text>
            </Pressable>
            <Pressable style={styles.moRow} onPress={() => void onMore('report')}>
              <Text style={styles.moTx}>Report inaccurate loads</Text>
            </Pressable>
            <Pressable style={styles.moRow} onPress={() => void onMore('share')}>
              <Text style={styles.moTx}>Share request</Text>
            </Pressable>
            <Pressable style={styles.moClose} onPress={() => setMoreOpen(false)}>
              <Text style={styles.moCloseTx}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={!!textModal} transparent animationType="fade" onRequestClose={() => setTextModal(null)}>
        <Pressable style={styles.textMoOverlay} onPress={() => setTextModal(null)}>
          <Pressable style={styles.textMoBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.textMoTitle}>
              {textModal === 'report'
                ? 'Report inaccurate loads'
                : textModal === 'refresh'
                  ? 'Request an update'
                  : 'Add status note'}
            </Text>
            {textModal === 'status' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kindScroll}>
                {(['gate_change', 'terminal', 'flight_status', 'dep_arr', 'ops_note'] as const).map((k) => (
                  <Pressable key={k} style={[styles.kindChip, statusKind === k && styles.kindChipOn]} onPress={() => setStatusKind(k)}>
                    <Text style={[styles.kindChipTx, statusKind === k && styles.kindChipTxOn]}>{statusKindLabel(k)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <TextInput
              style={styles.textMoInput}
              placeholder={
                textModal === 'report'
                  ? 'What looks wrong? (optional)'
                  : textModal === 'refresh'
                    ? 'Optional note to the community'
                    : 'Gate change, delay, terminal, etc.'
              }
              placeholderTextColor="#94a3b8"
              value={modalText}
              onChangeText={setModalText}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.textMoActions}>
              <Pressable style={styles.textMoCancel} onPress={() => setTextModal(null)}>
                <Text style={styles.textMoCancelTx}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.textMoOk} onPress={() => void submitTextModal()}>
                <Text style={styles.textMoOkTx}>{textModal === 'refresh' && !modalText.trim() ? 'Send' : 'Submit'}</Text>
              </Pressable>
            </View>
            {textModal === 'refresh' ? (
              <Text style={styles.textMoHint}>Sends a refresh signal even if you leave the note blank.</Text>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={airlineNotesModalOpen} transparent animationType="slide" onRequestClose={() => setAirlineNotesModalOpen(false)}>
        <Pressable style={styles.moOverlay} onPress={() => setAirlineNotesModalOpen(false)}>
          <View style={styles.notesModalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.moTitle}>All notes · {staffLoadsAirlineDisplayName(request.airline_code)}</Text>
            <ScrollView style={styles.notesModalScroll} showsVerticalScrollIndicator={false}>
              {airlineNoteCategories.map((cat) => (
                <View key={cat} style={styles.notesModalSection}>
                  <Text style={styles.notesModalSectionTitle}>
                    {staffLoadsAirlineNoteCategoryLabel(cat as StaffLoadsAirlineNoteCategory)}
                  </Text>
                  {airlineNoteEntries
                    .filter((e) => e.note_category === cat)
                    .map((e) => (
                      <View key={e.id} style={styles.notesModalEntry}>
                        <Text style={styles.noteTitle}>{e.title}</Text>
                        <Text style={styles.noteBody}>{e.body}</Text>
                      </View>
                    ))}
                </View>
              ))}
            </ScrollView>
            <Pressable style={styles.moClose} onPress={() => setAirlineNotesModalOpen(false)}>
              <Text style={styles.moCloseTx}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  pad: { padding: 16, paddingBottom: 16 },
  /** Fills space under header so stack default white never shows through below short content. */
  scroll: { flex: 1, backgroundColor: '#f8fafc' },
  headerShell: { marginBottom: 14 },
  upgradeMeta: { marginTop: 10, fontSize: 11, fontWeight: '600', color: '#b45309' },
  calloutRefresh: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: STAFF_LOADS_VISUAL.strip.caution,
  },
  calloutRefreshTx: { flex: 1, color: '#92400e', fontWeight: '700', fontSize: 12, lineHeight: 17 },
  calloutLock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: STAFF_LOADS_VISUAL.strip.waiting,
  },
  calloutLockTx: { flex: 1, color: '#1e40af', fontWeight: '700', fontSize: 12, lineHeight: 17 },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    marginBottom: 6,
  },
  sectionAccentRule: { width: 3, height: 14, borderRadius: 2, backgroundColor: colors.headerRed, opacity: 0.85 },
  sectionTitle: { fontWeight: '800', fontSize: 12, color: '#64748b', letterSpacing: 0.6, textTransform: 'uppercase' },
  countLineMuted: { fontSize: 11, fontWeight: '700', color: '#94a3b8', marginBottom: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  filterChipOn: { backgroundColor: 'rgba(181,22,30,0.08)', borderColor: colors.headerRed },
  filterChipTx: { fontWeight: '800', fontSize: 11, color: '#64748b' },
  filterChipTxOn: { color: colors.headerRed },
  summaryShell: { marginBottom: 14 },
  stEdgeKebab: { paddingVertical: 8, paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center' },
  stSummaryDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e2e8f0', marginVertical: 14 },
  stUpdateBannerCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(181,22,30,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(181,22,30,0.2)',
  },
  stUpdateBannerTxCompact: { textAlign: 'center', fontWeight: '700', fontSize: 12, color: colors.headerRed },
  stLockBannerCompact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.headerRed,
  },
  stLockBannerTxCompact: { flex: 1, color: '#7f1d1d', fontWeight: '700', fontSize: 11, lineHeight: 15 },
  stAnsweredTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  stAnsweredTopFlex: { flex: 1, minWidth: 8 },
  stMoreHit: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingLeft: 8 },
  stMoreTx: { fontSize: 15, fontWeight: '700', color: '#64748b' },
  stUpdateBanner: {
    backgroundColor: 'rgba(181,22,30,0.08)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(181,22,30,0.22)',
  },
  stUpdateBannerTx: { textAlign: 'center', fontWeight: '700', fontSize: 14, color: colors.headerRed },
  stLockBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.headerRed,
  },
  stLockBannerTx: { flex: 1, color: '#7f1d1d', fontWeight: '700', fontSize: 12, lineHeight: 17 },
  stSectionTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', letterSpacing: -0.2, marginBottom: 8 },
  stSectionTitleSpaced: { marginTop: 18 },
  stMetricRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'nowrap',
    gap: 10,
    marginTop: 0,
    minHeight: 52,
  },
  /** Open-seat total — fill + border from `staffLoadsOpenSeatsHighlightBox` (green / amber / red rule). */
  stTotalBoxOpen: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 11,
    minWidth: 68,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Same size for total + cabin columns — compact summary. */
  stTotalNum: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  stTotalLabel: { fontSize: 9, fontWeight: '700', marginTop: 2, letterSpacing: 0.15 },
  stTotalBoxNonrev: {
    borderRadius: 10,
    backgroundColor: '#e8e8ed',
    paddingVertical: 7,
    paddingHorizontal: 11,
    minWidth: 68,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stTotalNumDark: { fontSize: 14, fontWeight: '800', color: '#334155', letterSpacing: -0.2 },
  stTotalLabelDark: { fontSize: 9, fontWeight: '700', color: '#64748b', marginTop: 2, letterSpacing: 0.15 },
  stCabinStations: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
    paddingBottom: 2,
    paddingLeft: 4,
  },
  stCabinStation: { flex: 1, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 4 },
  stCabinStationNum: { fontSize: 14, fontWeight: '800', color: '#475569', letterSpacing: -0.2 },
  stCabinStationLbl: { fontSize: 9, fontWeight: '700', color: '#94a3b8', marginTop: 5, textAlign: 'center' },
  stCabinMutedWrap: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  stCabinMuted: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  stFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  stFooterTx: { flex: 1, fontSize: 13, fontWeight: '600', color: '#94a3b8', lineHeight: 18 },
  stHelpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14 },
  stHelpTx: { flex: 1, fontSize: 13, fontWeight: '600', color: '#64748b', lineHeight: 20 },
  stHelpLink: { fontWeight: '800', color: colors.headerRed },
  stLoadLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  stLoadLevelLeft: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, flexShrink: 1 },
  stLoadLevelLabel: { fontSize: 13, fontWeight: '800', color: '#64748b' },
  stSourceMeta: { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  summaryHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  summaryHeadline: { fontSize: 26, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 },
  statGrid: { flexDirection: 'row', gap: 10 },
  statCell: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  statLabel: { fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 20, fontWeight: '900', color: '#0f172a', marginTop: 4 },
  cabinSection: { marginTop: 14 },
  cabinSectionTitle: { fontSize: 11, fontWeight: '800', color: '#64748b', marginBottom: 8, letterSpacing: 0.3 },
  cabinChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cabinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  cabinChipKey: { fontSize: 12, fontWeight: '800', color: '#475569', textTransform: 'capitalize' },
  cabinChipVal: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  emptyLoads: { paddingVertical: 8 },
  emptyLoadsTitle: { fontSize: 16, fontWeight: '900', color: '#334155', marginBottom: 4 },
  activityEmpty: { alignItems: 'center', paddingVertical: 20 },
  activityEmptyTx: { marginTop: 8, fontSize: 14, fontWeight: '800', color: '#94a3b8' },
  activityEmptySub: { marginTop: 4, fontSize: 12, fontWeight: '600', color: '#cbd5e1', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sumMeta: { fontSize: 11, color: '#94a3b8', marginTop: 12, fontWeight: '600', lineHeight: 16 },
  cabinHead: { fontSize: 12, fontWeight: '800', color: '#64748b', marginBottom: 4 },
  notes: { marginTop: 12, color: '#334155', lineHeight: 20, fontSize: 14, fontWeight: '600' },
  flagBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    borderLeftWidth: 3,
    borderLeftColor: STAFF_LOADS_VISUAL.strip.caution,
    gap: 8,
  },
  flagBannerTx: { color: '#92400e', fontWeight: '700', fontSize: 12, lineHeight: 17, flex: 1, minWidth: 120 },
  historyLink: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  historyLinkTx: { fontWeight: '800', color: colors.headerRed, fontSize: 15 },
  lockedHint: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  lockedHintTx: { color: '#475569', fontWeight: '600', fontSize: 14, lineHeight: 20 },
  muted: { color: '#64748b', fontWeight: '600' },
  mutedSmall: { color: '#94a3b8', fontSize: 12, marginTop: 6, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  sendC: { alignSelf: 'flex-end', backgroundColor: colors.headerRed, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  sendCtx: { color: '#fff', fontWeight: '800' },
  tlRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0', paddingVertical: 10 },
  tlType: { fontSize: 10, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase' },
  tlTitle: { fontWeight: '800', color: '#0f172a', marginTop: 4, fontSize: 15 },
  tlBody: { color: '#334155', marginTop: 4, lineHeight: 20 },
  tlTime: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  toggleMeta: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 10 },
  outlineBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.headerRed,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  outlineBtnTx: { color: colors.headerRed, fontWeight: '800', fontSize: 14 },
  noteTitle: { fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  noteBody: { color: '#475569', lineHeight: 20 },
  primary: { backgroundColor: colors.headerRed, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryTx: { color: '#fff', fontWeight: '900', fontSize: 16 },
  secondary: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.headerRed,
    backgroundColor: '#fff',
  },
  secondaryTx: { color: colors.headerRed, fontWeight: '800', fontSize: 15 },
  reportLine: { fontSize: 13, color: '#334155', marginTop: 4, fontWeight: '600' },
  moreBtn: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  moreBtnTx: { fontWeight: '800', color: colors.headerRed, fontSize: 16 },
  moreBtnSub: { fontSize: 12, color: '#94a3b8', fontWeight: '600', marginTop: 4 },
  moOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  moSheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 28 },
  moTitle: { fontWeight: '900', fontSize: 17, marginBottom: 8 },
  moRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  moTx: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  moClose: { marginTop: 12, alignItems: 'center', paddingVertical: 12 },
  moCloseTx: { color: colors.headerRed, fontWeight: '800', fontSize: 16 },
  textMoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  textMoBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  textMoTitle: { fontWeight: '900', fontSize: 17, color: '#0f172a', marginBottom: 12 },
  kindScroll: { marginBottom: 10, maxHeight: 44 },
  kindChip: {
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  kindChipOn: { backgroundColor: 'rgba(181,22,30,0.12)' },
  kindChipTx: { fontWeight: '700', fontSize: 12, color: '#64748b' },
  kindChipTxOn: { color: colors.headerRed },
  textMoInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    minHeight: 100,
    padding: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  textMoActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 14 },
  textMoCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  textMoCancelTx: { fontWeight: '800', color: '#64748b' },
  textMoOk: { backgroundColor: colors.headerRed, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  textMoOkTx: { color: '#fff', fontWeight: '900' },
  textMoHint: { marginTop: 10, fontSize: 12, color: '#64748b', fontWeight: '600' },
  knowledgeMeta: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 8 },
  knowledgeSub: { fontSize: 12, fontWeight: '600', color: '#94a3b8', marginTop: -4, marginBottom: 8 },
  expandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginBottom: 8,
  },
  expandHeaderTx: { fontWeight: '800', fontSize: 15, color: '#0f172a', flex: 1, paddingRight: 8 },
  noteEntry: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  noteCat: { fontSize: 11, fontWeight: '900', color: colors.headerRed, textTransform: 'uppercase', marginBottom: 4 },
  moreHint: { fontSize: 12, fontWeight: '700', color: '#94a3b8', marginTop: 8 },
  textLink: { marginTop: 12, alignSelf: 'flex-start' },
  textLinkTx: { fontWeight: '800', color: colors.headerRed, fontSize: 14 },
  gtkBlock: { marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0' },
  gtkKind: { fontSize: 11, fontWeight: '900', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 },
  gtkTitle: { fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  gtkBody: { color: '#475569', lineHeight: 20, fontWeight: '600' },
  travelRow: { paddingBottom: 8 },
  travelCard: {
    width: 168,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 10,
  },
  travelTitle: { fontWeight: '800', color: '#0f172a', marginTop: 8, fontSize: 14 },
  travelSub: { fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: '600' },
  travelLink: { marginTop: 8, fontWeight: '900', color: colors.headerRed, fontSize: 13 },
  notesModalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  notesModalScroll: { maxHeight: 480 },
  notesModalSection: { marginBottom: 16 },
  notesModalSectionTitle: { fontWeight: '900', fontSize: 14, color: colors.headerRed, marginBottom: 8 },
  notesModalEntry: { marginBottom: 12 },
});
