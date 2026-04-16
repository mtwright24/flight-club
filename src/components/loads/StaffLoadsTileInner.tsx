import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getAirlineDisplayName } from '../../constants/airlines';
import { formatLocalHm } from './StaffLoadsRequestPresentation';
import {
  formatBlockDuration,
  formatDisplayFlightNumber,
  formatStaffTravelerDateLine,
  normalizeStaffAirlineCode,
  staffLoadsPlaceholderAircraft,
} from './staffLoadsDisplay';
import { AirlineLogoMark } from './AirlineLogoMark';

export type StaffLoadsTileInnerProps = {
  airlineCode: string;
  flightNumber: string | null;
  fromAirport: string;
  toAirport: string;
  travelDate: string;
  departAt: string | null;
  arriveAt: string | null;
  aircraftType: string | null;
  /** Optional second line (e.g. answered load preview). */
  previewLine?: string | null;
  /** e.g. Priority chip */
  trailingBadge?: React.ReactNode;
  /** Vertical ⋮ on the right edge of the tile (e.g. load request actions). */
  edgeAction?: React.ReactNode;
  /** For search mocks without aircraft in DB — pass flight row id for stable placeholder. */
  flightIdForPlaceholder?: string;
  /** Abbreviated age (e.g. `3h`) or countdown — under logo, full string visible. */
  edgeTimestamp?: string | null;
};

/**
 * Three-column row: logo + stamp | flight meta | route (right-aligned).
 */
export function StaffLoadsTileInner({
  airlineCode,
  flightNumber,
  fromAirport,
  toAirport,
  travelDate,
  departAt,
  arriveAt,
  aircraftType,
  previewLine,
  trailingBadge,
  edgeAction,
  flightIdForPlaceholder,
  edgeTimestamp,
}: StaffLoadsTileInnerProps) {
  const codeForLogo = normalizeStaffAirlineCode(airlineCode);
  const flightLabel = formatDisplayFlightNumber(airlineCode, flightNumber);
  const dateLine = formatStaffTravelerDateLine(travelDate);
  const airlineName = codeForLogo === 'XX' ? '—' : getAirlineDisplayName(airlineCode);
  const dep = formatLocalHm(departAt);
  const arr = formatLocalHm(arriveAt);
  const dur = formatBlockDuration(departAt, arriveAt);
  const ac =
    aircraftType?.trim() ||
    (flightIdForPlaceholder ? staffLoadsPlaceholderAircraft(flightIdForPlaceholder) : null);

  const from = (fromAirport || '—').trim().toUpperCase();
  const to = (toAirport || '—').trim().toUpperCase();
  const stamp = (edgeTimestamp || '').trim();

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <View style={styles.leftAndMeta}>
          <View style={styles.logoCol}>
            <AirlineLogoMark airlineCode={codeForLogo} size={34} />
            {stamp ? (
              <Text style={styles.edgeStampInner} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {stamp}
              </Text>
            ) : null}
          </View>
          <View style={styles.metaBlock}>
            <View style={styles.flightRow}>
              <Text style={styles.flightNum} numberOfLines={1}>
                {flightLabel}
              </Text>
              {trailingBadge ? <View style={styles.badgeWrap}>{trailingBadge}</View> : null}
            </View>
            <Text style={styles.dateLine}>{dateLine}</Text>
            <View style={styles.airlinePill}>
              <Text style={styles.airlinePillTx} numberOfLines={1}>
                {airlineName}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.routeCol}>
          <View style={styles.routeCluster}>
            <View style={styles.routePairRow}>
              <View style={styles.routeEndpoint}>
                <Text style={styles.apCode}>{from}</Text>
                <Text style={styles.timeUnder}>{dep}</Text>
              </View>
              <View style={styles.routeMid}>
                <View style={styles.line} />
                <Ionicons name="airplane" size={9} color="#94a3b8" />
                <View style={styles.line} />
              </View>
              <View style={styles.routeEndpoint}>
                <Text style={styles.apCode}>{to}</Text>
                <Text style={styles.timeUnder}>{arr}</Text>
              </View>
            </View>
            <View style={[styles.metaMuted, !ac && styles.metaMutedSingle]}>
              <Text style={styles.metaSm}>{dur}</Text>
              {ac ? <Text style={styles.metaSm}>{ac}</Text> : null}
            </View>
          </View>
        </View>
        {edgeAction ? <View style={styles.edgeActionCol}>{edgeAction}</View> : null}
      </View>
      {previewLine ? (
        <View style={styles.previewRow}>
          <Text style={styles.preview} numberOfLines={1} ellipsizeMode="tail">
            {previewLine}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 6,
  },
  /** Logo + meta share height; stamp sits on bottom of logo column to align with airline pill. */
  leftAndMeta: {
    flexDirection: 'row',
    alignItems: 'stretch',
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 0,
    maxWidth: '34%',
    gap: 8,
  },
  logoCol: {
    minWidth: 44,
    maxWidth: 52,
    flexShrink: 0,
    alignItems: 'center',
    paddingHorizontal: 2,
    justifyContent: 'space-between',
  },
  edgeStampInner: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: -0.12,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 0,
  },
  /** Flight #, date, airline — to the right of logo, not under it. */
  metaBlock: {
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 0,
    maxWidth: '100%',
    paddingRight: 0,
  },
  flightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  badgeWrap: { flexShrink: 0 },
  /** Route + duration: pushed to the right side of the tile. */
  routeCol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    marginLeft: 0,
  },
  /** Route + times + meta share one width so edges line up. */
  routeCluster: {
    width: '100%',
    alignItems: 'stretch',
    alignSelf: 'flex-end',
    maxWidth: '100%',
  },
  edgeActionCol: {
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingLeft: 2,
    marginLeft: 2,
    minWidth: 32,
  },
  flightNum: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.35,
    flexShrink: 1,
  },
  dateLine: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '400',
    color: '#64748b',
  },
  airlinePill: {
    marginTop: 3,
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxWidth: '100%',
  },
  airlinePillTx: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748b',
  },
  routePairRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 2,
    width: '100%',
  },
  routeEndpoint: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  apCode: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    letterSpacing: 0.5,
    textAlign: 'center',
    width: '100%',
  },
  routeMid: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 1,
    marginTop: 0,
    alignSelf: 'flex-start',
    paddingHorizontal: 1,
  },
  line: {
    width: 5,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: '#cbd5e1',
    borderRadius: 1,
  },
  timeUnder: {
    fontSize: 10,
    fontWeight: '500',
    color: '#334155',
    marginTop: 1,
    textAlign: 'center',
    width: '100%',
  },
  /** Duration left, aircraft right — same column edges as airports above. */
  metaMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
    opacity: 0.55,
    width: '100%',
    paddingHorizontal: 0,
  },
  metaMutedSingle: {
    justifyContent: 'flex-start',
  },
  metaSm: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748b',
  },
  metaDot: {
    fontSize: 10,
    color: '#94a3b8',
  },
  previewRow: {
    alignSelf: 'stretch',
    marginTop: 6,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.07)',
    backgroundColor: 'rgba(248, 250, 252, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  preview: {
    width: '100%',
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
