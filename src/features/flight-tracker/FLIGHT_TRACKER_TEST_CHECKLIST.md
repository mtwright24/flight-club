# Flight Tracker — manual QA checklist

Use before release testing. All flows use real edge functions (no mock flight data in UI).

1. **flight-status** — Open a saved flight or search; confirm status/gates/times match provider (or honest “not found”).
2. **airport-board** — Load **departures** and **arrivals** for a real airport (e.g. JFK); confirm empty state when the board is legitimately empty vs error/retry.
3. **Search / no results** — Query a nonsense flight number; expect empty results, no crash, search history only after real hits.
4. **Schedule sync** — Trigger sync for a real leg; expect **Synced** when matched, **Not found** + explanatory copy when not, error state on failure (not a silent spinner).
5. **Inbound aircraft** — With Aviationstack, expect informational “provider does not support inbound” style rows (blue Info badge), not a red error screen.
6. **Hub** — With no saved flights, confirm empty sections; with API failure on board preview, confirm error + retry (not fake delay cards).
7. **Dev logs** — In dev, `[FlightTracker:…]` client logs and Supabase function logs show cache hit/miss and outcomes (no secrets).
