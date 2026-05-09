/**
 * Stale J4195 legs on 2026-05-29 from earlier duty-date repair — safe to purge from DB/session caches.
 */
import { supabase } from "../../lib/supabaseClient";
import type { CrewScheduleTrip } from "./types";

export const J4195_STALE_FAKE_ISO = "2026-05-29" as const;

export function tripHasJ4195StaleMay292026(trip: CrewScheduleTrip): boolean {
  const code = String(trip.pairingCode ?? "").trim().toUpperCase();
  if (code !== "J4195") return false;
  const withDuties = trip as CrewScheduleTrip & {
    duties?: { duty_date?: string | null }[];
  };
  for (const l of trip.legs ?? []) {
    if (String(l.dutyDate ?? "").slice(0, 10) === J4195_STALE_FAKE_ISO) {
      return true;
    }
  }
  for (const d of withDuties.duties ?? []) {
    if (String(d.duty_date ?? "").slice(0, 10) === J4195_STALE_FAKE_ISO) {
      return true;
    }
  }
  return false;
}

export function tripListHasJ4195StaleMay292026(
  trips: CrewScheduleTrip[] | undefined,
): boolean {
  if (!trips?.length) return false;
  return trips.some((t) => tripHasJ4195StaleMay292026(t));
}

type FakeSourceMeta = {
  source: string;
  persistedOrLocal: "persisted_db" | "local_cache_only";
  pairingCode?: string | null;
  schedulePairingId?: string | null;
  tripGroupId?: string | null;
  rowId?: string | null;
  dutyDate?: string | null;
  flightNumber?: string | null;
  route?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export function logJ4195FakeMay29Hit(meta: FakeSourceMeta): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.warn("[J4195_FAKE_MAY29_SOURCE]", meta);
}

export function logTripsForJ4195FakeMay29(
  trips: CrewScheduleTrip[],
  source: string,
  persistedOrLocal: FakeSourceMeta["persistedOrLocal"],
): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  for (const trip of trips) {
    if (!tripHasJ4195StaleMay292026(trip)) continue;
    for (const l of trip.legs ?? []) {
      if (String(l.dutyDate ?? "").slice(0, 10) !== J4195_STALE_FAKE_ISO) {
        continue;
      }
      logJ4195FakeMay29Hit({
        source,
        persistedOrLocal,
        pairingCode: "J4195",
        schedulePairingId: trip.schedulePairingId ?? null,
        tripGroupId: trip.id ?? null,
        rowId: l.id != null ? String(l.id) : null,
        dutyDate: l.dutyDate ?? null,
        flightNumber: l.flightNumber ?? null,
        route: `${l.departureAirport ?? ""}-${l.arrivalAirport ?? ""}`,
      });
    }
    const withDuties = trip as CrewScheduleTrip & {
      duties?: { duty_date?: string | null; id?: string }[];
    };
    for (const d of withDuties.duties ?? []) {
      if (String(d.duty_date ?? "").slice(0, 10) !== J4195_STALE_FAKE_ISO) {
        continue;
      }
      logJ4195FakeMay29Hit({
        source,
        persistedOrLocal,
        pairingCode: "J4195",
        schedulePairingId: trip.schedulePairingId ?? null,
        tripGroupId: trip.id ?? null,
        rowId: d.id != null ? String(d.id) : null,
        dutyDate: d.duty_date ?? null,
      });
    }
  }
}

export async function deleteStaleJ4195May292026ScheduleRowsForUser(
  uid: string,
): Promise<void> {
  const iso = J4195_STALE_FAKE_ISO;
  const { error: dErr } = await supabase
    .from("schedule_duties")
    .delete()
    .eq("user_id", uid)
    .eq("pairing_id", "J4195")
    .eq("duty_date", iso);
  if (dErr && typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn("[J4195_FAKE_MAY29_SOURCE]", {
      source: "supabase.schedule_duties.delete",
      error: dErr.message,
    });
  }

  const { data: pRows, error: pErr } = await supabase
    .from("schedule_pairings")
    .select("id")
    .eq("user_id", uid)
    .eq("pairing_id", "J4195");
  if (pErr && typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn("[J4195_FAKE_MAY29_SOURCE]", {
      source: "supabase.schedule_pairings.select",
      error: pErr.message,
    });
    return;
  }
  for (const row of pRows ?? []) {
    const pid = row.id as string;
    const { error: lErr } = await supabase
      .from("schedule_pairing_legs")
      .delete()
      .eq("pairing_id", pid)
      .eq("duty_date", iso);
    if (lErr && typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn("[J4195_FAKE_MAY29_SOURCE]", {
        source: "supabase.schedule_pairing_legs.delete",
        pairingUuid: pid,
        error: lErr.message,
      });
    }
  }

  const { error: eErr } = await supabase
    .from("schedule_entries")
    .delete()
    .eq("user_id", uid)
    .eq("pairing_code", "J4195")
    .eq("date", iso);
  if (eErr && typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn("[J4195_FAKE_MAY29_SOURCE]", {
      source: "supabase.schedule_entries.delete",
      error: eErr.message,
    });
  }
}
