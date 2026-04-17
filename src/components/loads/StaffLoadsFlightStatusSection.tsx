import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import {
  Image,
  ImageSourcePropType,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { formatBlockDuration } from './staffLoadsDisplay';
import { staffLoadsAirportCity } from './staffLoadsAirportCities';

function brandedAircraftHeroSource(airlineCode: string): ImageSourcePropType {
  const c = airlineCode.trim().toUpperCase();
  if (c === 'B6') return require('../../../assets/images/staff-loads/flight-status-jetblue-hero.png');
  if (c === 'DL') return require('../../../assets/images/staff-loads/flight-status-delta-hero.png');
  return require('../../../assets/images/staff-loads/flight-status-jetblue-hero.png');
}

function formatHm(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatCalendarDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function daysUntilTravelDate(travelDate: string): number | null {
  const d = new Date(`${travelDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

function formatLastUpdated(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export type StaffLoadsFlightStatusSectionProps = {
  airlineCode: string;
  flightNumber: string | null;
  fromAirport: string;
  toAirport: string;
  travelDate: string;
  departAt: string | null;
  arriveAt: string | null;
  aircraftType: string | null;
  /** Best-effort “freshness” for community loads / schedule row. */
  lastUpdatedIso?: string | null;
  enableFlightStatusPush: boolean;
  onToggleFlightStatusPush?: (next: boolean) => void | Promise<void>;
  canEditPush: boolean;
  onOpenFlightTracker: () => void;
};

export function StaffLoadsFlightStatusSection({
  airlineCode,
  flightNumber,
  fromAirport,
  toAirport,
  travelDate,
  departAt,
  arriveAt,
  aircraftType,
  lastUpdatedIso,
  enableFlightStatusPush,
  onToggleFlightStatusPush,
  canEditPush,
  onOpenFlightTracker,
}: StaffLoadsFlightStatusSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [leg, setLeg] = useState<'departure' | 'arrival'>('departure');

  const from = (fromAirport || '—').trim().toUpperCase();
  const to = (toAirport || '—').trim().toUpperCase();
  const fromCity = staffLoadsAirportCity(from);
  const toCity = staffLoadsAirportCity(to);
  const dur = formatBlockDuration(departAt, arriveAt);
  const ac = (aircraftType || '').trim() || 'Aircraft TBD';

  const primaryIso = leg === 'departure' ? departAt : arriveAt;
  const bigTime = formatHm(primaryIso);
  const dayLine = formatCalendarDay(primaryIso);
  const daysAway = daysUntilTravelDate(travelDate);
  const relativeDay =
    daysAway == null
      ? ''
      : daysAway === 0
        ? 'Today'
        : daysAway === 1
          ? 'Tomorrow'
          : daysAway > 1
            ? `in ${daysAway} days`
            : `${Math.abs(daysAway)} day${Math.abs(daysAway) === 1 ? '' : 's'} ago`;

  const flightLabel = useMemo(() => {
    const fn = (flightNumber || '').trim();
    const al = airlineCode.trim().toUpperCase();
    return fn ? `${al}${fn.replace(/^0+/, '')}` : al;
  }, [airlineCode, flightNumber]);

  const heroSource = brandedAircraftHeroSource(airlineCode);

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.sectionHeader}
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse flight status' : 'Expand flight status'}
      >
        <View style={styles.sectionHeaderLeft}>
          <Text style={styles.sectionTitle}>Flight status</Text>
          <Text style={styles.acSub} numberOfLines={1}>
            {ac}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color="#64748b" />
      </Pressable>

      {expanded ? (
        <>
          <Pressable onPress={onOpenFlightTracker} style={styles.heroOuter} accessibilityRole="button" accessibilityHint="Opens Flight Tracker">
            <LinearGradient colors={['#0ea5e9', '#0284c7', '#0369a1']} style={styles.heroGradient}>
              <Image source={heroSource} style={styles.heroImage} resizeMode="cover" />
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.45)']} style={styles.heroFade} />
              <View style={styles.routeOverlay}>
                <View style={styles.routeRow}>
                  <Text style={styles.routeCode}>{from}</Text>
                  <Ionicons name="airplane" size={14} color="#fff" style={{ marginHorizontal: 6 }} />
                  <View style={styles.routeDash} />
                  <Text style={styles.routeCode}>{to}</Text>
                </View>
                <View style={styles.cityRow}>
                  <Text style={styles.cityUnder}>{fromCity}</Text>
                  <Text style={styles.durCenter}>{dur}</Text>
                  <Text style={[styles.cityUnder, { textAlign: 'right' }]}>{toCity}</Text>
                </View>
              </View>
            </LinearGradient>
          </Pressable>

          <View style={styles.segRow}>
            <Pressable
              style={[styles.segBtn, leg === 'departure' && styles.segBtnOn]}
              onPress={() => setLeg('departure')}
            >
              <Text style={[styles.segTx, leg === 'departure' && styles.segTxOn]}>Departure</Text>
            </Pressable>
            <Pressable style={[styles.segBtn, leg === 'arrival' && styles.segBtnOn]} onPress={() => setLeg('arrival')}>
              <Text style={[styles.segTx, leg === 'arrival' && styles.segTxOn]}>Arrival</Text>
            </Pressable>
          </View>

          <View style={styles.timeCard}>
            <Text style={styles.bigTime}>{bigTime}</Text>
            <View style={styles.timeRight}>
              <Text style={styles.calDay}>{dayLine}</Text>
              {relativeDay ? <Text style={styles.inDays}>{relativeDay}</Text> : null}
            </View>
          </View>

          <Text style={styles.lastUp}>
            Last updated {formatLastUpdated(lastUpdatedIso ?? departAt ?? null)}
          </Text>

          <View style={styles.notifCard}>
            <View style={styles.notifTextCol}>
              <Text style={styles.notifTitle}>Receive flight status updates</Text>
              <Text style={styles.notifBody} numberOfLines={3}>
                Push notifications for important changes about flight {flightLabel}.
              </Text>
            </View>
            <Switch
              value={enableFlightStatusPush}
              disabled={!canEditPush}
              onValueChange={(v) => void onToggleFlightStatusPush?.(v)}
              trackColor={{ false: '#e2e8f0', true: 'rgba(34,197,94,0.45)' }}
              thumbColor={enableFlightStatusPush ? '#22c55e' : '#f4f4f5'}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 6 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 8,
  },
  sectionHeaderLeft: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  acSub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  heroOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
  },
  heroGradient: { minHeight: 168, justifyContent: 'flex-end' },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroFade: { ...StyleSheet.absoluteFillObject },
  routeOverlay: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8 },
  routeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  routeCode: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  routeDash: {
    flex: 1,
    minWidth: 24,
    marginHorizontal: 4,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
    alignSelf: 'center',
  },
  cityRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 },
  cityUnder: { flex: 1, color: 'rgba(255,255,255,0.92)', fontSize: 11, fontWeight: '600' },
  durCenter: { color: '#fff', fontSize: 12, fontWeight: '800', marginHorizontal: 6 },
  segRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.06)',
    borderRadius: 999,
    padding: 3,
    marginBottom: 12,
    gap: 4,
  },
  segBtn: { paddingVertical: 7, paddingHorizontal: 18, borderRadius: 999 },
  segBtnOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segTx: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  segTxOn: { color: '#0f172a' },
  timeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  bigTime: { fontSize: 34, fontWeight: '900', color: '#0f172a', letterSpacing: -1 },
  timeRight: { alignItems: 'flex-end' },
  calDay: { fontSize: 15, fontWeight: '700', color: '#334155' },
  inDays: { marginTop: 2, fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  lastUp: { textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#cbd5e1', marginBottom: 12 },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  notifTextCol: { flex: 1, minWidth: 0 },
  notifTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  notifBody: { marginTop: 4, fontSize: 12, fontWeight: '600', color: '#64748b', lineHeight: 17 },
});
