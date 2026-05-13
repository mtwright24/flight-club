import { supabase } from "../../lib/supabaseClient";
import {
  FLICA_NATIVE_OT_BCID,
  FLICA_NATIVE_TRADE_BCID,
} from "../flica-actions/flicaActionsNativeService";
import type { OpenTimeTrip, TradeboardPost } from "./flicaCrewHubTypes";

export type TradeboardHubCachePayloadV1 = {
  v: 1;
  myPosts: TradeboardPost[];
  allPosts: TradeboardPost[];
  refreshedAt: string;
};

export type OpenTimeHubCachePayloadV1 = {
  v: 1;
  trips: OpenTimeTrip[];
  refreshedAt: string;
};

export async function upsertTradeboardHubCache(
  userId: string,
  payload: TradeboardHubCachePayloadV1,
): Promise<void> {
  const { error } = await supabase.from("crew_tradeboard_cache").upsert(
    {
      user_id: userId,
      source: "fl",
      bcid: FLICA_NATIVE_TRADE_BCID,
      payload: payload as unknown as Record<string, unknown>,
      refreshed_at: payload.refreshedAt,
    },
    { onConflict: "user_id,source,bcid" },
  );
  if (error) {
    console.warn("[crew_tradeboard_cache]", error.message);
  }
}

export async function loadTradeboardHubCache(
  userId: string,
): Promise<TradeboardHubCachePayloadV1 | null> {
  const { data, error } = await supabase
    .from("crew_tradeboard_cache")
    .select("payload")
    .eq("user_id", userId)
    .eq("source", "fl")
    .eq("bcid", FLICA_NATIVE_TRADE_BCID)
    .maybeSingle();
  if (error || data?.payload == null) return null;
  const p = data.payload as TradeboardHubCachePayloadV1;
  if (p?.v !== 1 || !Array.isArray(p.allPosts) || !Array.isArray(p.myPosts)) return null;
  return p;
}

export async function upsertOpenTimeHubCache(
  userId: string,
  payload: OpenTimeHubCachePayloadV1,
): Promise<void> {
  const { error } = await supabase.from("crew_opentime_cache").upsert(
    {
      user_id: userId,
      source: "fl",
      bcid: FLICA_NATIVE_OT_BCID,
      payload: payload as unknown as Record<string, unknown>,
      refreshed_at: payload.refreshedAt,
    },
    { onConflict: "user_id,source,bcid" },
  );
  if (error) {
    console.warn("[crew_opentime_cache]", error.message);
  }
}

export async function loadOpenTimeHubCache(
  userId: string,
): Promise<OpenTimeHubCachePayloadV1 | null> {
  const { data, error } = await supabase
    .from("crew_opentime_cache")
    .select("payload")
    .eq("user_id", userId)
    .eq("source", "fl")
    .eq("bcid", FLICA_NATIVE_OT_BCID)
    .maybeSingle();
  if (error || data?.payload == null) return null;
  const p = data.payload as OpenTimeHubCachePayloadV1;
  if (p?.v !== 1 || !Array.isArray(p.trips)) return null;
  return p;
}
