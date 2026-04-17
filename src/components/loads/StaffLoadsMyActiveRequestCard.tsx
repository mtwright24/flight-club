import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  STAFF_LOADS_VISUAL,
  StaffChip,
  StaffLoadsCardShell,
  formatAnswerLoadPreviewLine,
  staffLoadsMyPreviewAccentStrip,
} from './StaffLoadsRequestPresentation';
import { StaffLoadsTileInner } from './StaffLoadsTileInner';
import { formatStaffLoadsEdgeAge } from './staffLoadsDisplay';
export type MyActiveRequestPreview = {
  id: string;
  airline_code: string;
  flight_number: string | null;
  from_airport: string;
  to_airport: string;
  travel_date: string;
  request_kind: string;
  status: string;
  depart_at: string | null;
  arrive_at: string | null;
  created_at?: string;
  latest_answer_at?: string | null;
  refresh_requested_at?: string | null;
  aircraft_type?: string | null;
  locked_by?: string | null;
  lock_expires_at?: string | null;
  latest_answer_load_level?: string | null;
  latest_answer_open_seats_total?: number | null;
  latest_answer_nonrev_listed_total?: number | null;
  options?: unknown;
};

export function StaffLoadsMyActiveRequestCard({ row }: { row: MyActiveRequestPreview }) {
  const router = useRouter();
  const accent = staffLoadsMyPreviewAccentStrip({
    status: row.status as 'open' | 'answered' | 'closed' | 'stale',
    refresh_requested_at: row.refresh_requested_at,
    locked_by: row.locked_by,
    lock_expires_at: row.lock_expires_at,
    latest_answer_load_level: row.latest_answer_load_level,
    latest_answer_open_seats_total: row.latest_answer_open_seats_total,
    latest_answer_nonrev_listed_total: row.latest_answer_nonrev_listed_total,
    airline_code: row.airline_code,
    flight_number: row.flight_number,
    options: row.options,
  });

  const preview =
    row.status === 'answered'
      ? formatAnswerLoadPreviewLine(row.latest_answer_open_seats_total, row.latest_answer_nonrev_listed_total) ??
        '— open · — listed'
      : null;

  const edgeStamp = formatStaffLoadsEdgeAge(
    row.status === 'answered' ? row.latest_answer_at ?? null : row.created_at ?? null
  );

  return (
    <Pressable style={styles.outer} onPress={() => router.push(`/loads/request/${row.id}`)}>
      <StaffLoadsCardShell accentColor={accent} style={styles.shell} compact>
        <StaffLoadsTileInner
          airlineCode={row.airline_code}
          flightNumber={row.flight_number}
          fromAirport={row.from_airport}
          toAirport={row.to_airport}
          travelDate={row.travel_date}
          departAt={row.depart_at}
          arriveAt={row.arrive_at}
          aircraftType={row.aircraft_type ?? null}
          flightIdForPlaceholder={row.id}
          edgeTimestamp={edgeStamp || null}
          previewLine={preview}
          trailingBadge={
            row.request_kind === 'priority' ? (
              <StaffChip
                size="sm"
                label="Priority"
                backgroundColor={STAFF_LOADS_VISUAL.chip.bgPriority}
                color={STAFF_LOADS_VISUAL.chip.fgPriority}
                textStyle={{ fontWeight: '600' }}
              />
            ) : null
          }
        />
      </StaffLoadsCardShell>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { marginBottom: 6 },
  shell: { marginHorizontal: 0 },
});
