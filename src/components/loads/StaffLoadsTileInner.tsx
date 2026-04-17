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
  /** Vertical ⋮ on the right edge (detail screen). List cards usually set this null and render kebab in the parent row. */
  edgeAction?: React.ReactNode;
  /** For search mocks without aircraft in DB — pass flight row id for stable placeholder. */
  flightIdForPlaceholder?: string;
  /** Abbreviated age (e.g. `3h`) or countdown — under logo, full string visible. */
  edgeTimestamp?: string | null;
};

/**
 * Left: logo + stamp | flight meta. Right: StaffTraveler-style 3-line stack (route → times → duration · aircraft), aligned.
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

  const metaLine3 = [dur, ac].filter(Boolean).join(' · ');

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <View style={styles.leftAndMeta}>
          <View style={styles.logoCol}>
            <AirlineLogoMark airlineCode={codeForLogo} size={30} />
            {stamp ? (
              <Text style={styles.edgeStampInner} adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2}>
                {stamp}
              </Text>
            ) : null}
          </View>
          <View style={styles.metaBlock}>
            <View style={styles.flightRow}>
              <Text style={styles.flightNum} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.82}>
                {flightLabel}
              </Text>
              {trailingBadge ? <View style={styles.badgeWrap}>{trailingBadge}</View> : null}
            </View>
            <Text style={styles.dateLine} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
              {dateLine}
            </Text>
            <View style={styles.airlinePill}>
              <Text style={styles.airlinePillTx} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
                {airlineName}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.routeCol}>
          <View style={styles.routeStack}>
            <View style={styles.stRouteRow}>
              <Text style={styles.stCode}>{from}</Text>
              <Ionicons name="airplane" size={9} color="#94a3b8" style={styles.stPlane} />
              <Text style={styles.stCode}>{to}</Text>
            </View>
            <View style={styles.stTimeRow}>
              <Text style={styles.stTime}>{dep}</Text>
              <Text style={styles.stTime}>{arr}</Text>
            </View>
            {metaLine3 ? (
              <Text style={styles.stDurAc} numberOfLines={1}>
                {metaLine3}
              </Text>
            ) : null}
          </View>
        </View>

        {edgeAction ? <View style={styles.edgeActionCol}>{edgeAction}</View> : null}
      </View>
      {previewLine ? (
        <View style={styles.previewRow}>
          <Text style={styles.preview} numberOfLines={2} ellipsizeMode="tail">
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  /** Prefer this column for width: no max-% cap (was clipping DL… / JetBlue). */
  leftAndMeta: {
    flexDirection: 'row',
    alignItems: 'stretch',
    flex: 1.32,
    flexShrink: 0,
    minWidth: 120,
    gap: 5,
  },
  logoCol: {
    width: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
  },
  edgeStampInner: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: -0.12,
    textAlign: 'center',
    maxWidth: 40,
  },
  metaBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
    alignSelf: 'stretch',
  },
  flightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 4,
  },
  badgeWrap: { flexShrink: 0 },
  /** Right column: single stack, right-aligned — matches StaffTraveler reference. */
  routeCol: {
    flex: 1,
    minWidth: 72,
    flexShrink: 1,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingLeft: 2,
  },
  routeStack: {
    width: '100%',
    alignItems: 'flex-end',
    gap: 2,
  },
  stRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    maxWidth: '100%',
  },
  stCode: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.3,
  },
  stPlane: { marginHorizontal: 4 },
  stTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    maxWidth: '100%',
    flexWrap: 'wrap',
  },
  stTime: {
    fontSize: 9,
    fontWeight: '600',
    color: '#334155',
  },
  stDurAc: {
    fontSize: 9,
    fontWeight: '500',
    color: '#64748b',
    opacity: 0.88,
    marginTop: 0,
    textAlign: 'right',
  },
  edgeActionCol: {
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingLeft: 4,
    width: 28,
  },
  flightNum: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
    flexShrink: 0,
    maxWidth: '100%',
  },
  dateLine: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: '500',
    color: '#64748b',
    lineHeight: 12,
  },
  airlinePill: {
    marginTop: 2,
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxWidth: '100%',
  },
  airlinePillTx: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748b',
    lineHeight: 12,
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
