# FLICA integration specification (JetBlue)

This document describes how the Flight Club app integrates with JetBlue FLICA: authentication in a WebView, session cookies in SecureStore, and schedule retrieval over HTTPS using a two-token flow.

## Architecture overview

1. **UI login** — The user opens a `WebView` pointed at `FLICA_URLS.LOGIN`. Credentials may be injected or entered manually. FLICA may show CAPTCHA; after success, the app lands on `mainmenu.cgi` (sometimes with `GOHM=1`, sometimes not if CAPTCHA was skipped).
2. **Cookie capture** — After the post-login main menu is detected, the app reads native cookies via `@react-native-community/cookies` (`CookieManager.get` for `https://jetblue.flica.net`) and persists FLICA session fields with `saveFlicaCookies`.
3. **Load Schedule page** — The WebView is navigated to `FLICA_URLS.MAINMENU_LOADSCHEDULE`. The HTML is posted back to native code (`loadschedule_html`).
4. **Token 1** — `extractToken1FromHtml` finds the first `scheduledetail.cgi…token=…` value in that HTML.
5. **Token 2 & months** — Native `fetch` calls `scheduledetail.cgi?BlockDate=0426&token=[TOKEN1]`, parses `GO=1&token=[TOKEN2]` from the response, then fetches March / April / May with `GO=1`, `TOKEN2`, `BlockDate=0326|0426|0526`, and `JUNK=Date.now()` per request. The canonical implementation is `fetchFlicaScheduleAllMonths(cookieHeader, token1)` in `src/services/flicaScheduleService.ts`. The app may still use legacy helpers in `src/dev/flicaPoCScheduleHttp.ts` that perform the same sequence with optional `Referer` headers.

## Module: `src/services/flicaScheduleService.ts`

### Credentials (SecureStore)

| Function | Description |
|----------|-------------|
| `saveFlicaCredentials(username, password)` | Writes `flica_username` and `flica_password`. |
| `loadFlicaCredentials()` | Returns `{ username, password }` or `null` if either is missing. |
| `clearFlicaSession()` | Deletes username, password, and all four cookie keys below. |

### Session cookies (SecureStore)

| Key | FLICA name |
|-----|------------|
| `flica_session` | `FLiCASession` |
| `flica_service` | `FLiCAService` |
| `flica_awsalb` | `AWSALB` |
| `flica_awsalbcors` | `AWSALBCORS` |

| Function | Description |
|----------|-------------|
| `saveFlicaCookies(cookies)` | Persists any of the four fields; clears a key if the value is empty. |
| `loadFlicaCookies()` | Returns a single `Cookie` header string with all four parts, or `null` if **any** value is missing. Format: `FLiCASession=…; FLiCAService=…; AWSALB=…; AWSALBCORS=…`. |

### HTTP client

`fetchFlicaScheduleAllMonths(cookieHeader, token1)`:

- Does **not** GET `mainmenu?LoadSchedule` — **token1** must come from WebView HTML after that page has loaded.
- GET `full/scheduledetail.cgi?BlockDate=0426&token=[token1]`.
- Parse **token2** with `extractToken2FromHtml` (`/GO=1&token=([0-9A-Fa-f]+)/`).
- GET each month: `BlockDate` `0326`, `0426`, `0526` with `GO=1&token=[token2]&JUNK=[timestamp]`.

Default request headers (see `FLICA_CONSTANTS.USER_AGENT` and `buildFetchHeaders` in the service):

- `Cookie`, `User-Agent`, `Accept`, `Accept-Language`, `sec-fetch-site`, `sec-fetch-dest`, `sec-fetch-mode`.

Returns `{ march, april, may }` raw HTML strings. Throws `Error` on network or parsing failure.

### Token helpers

- `extractToken1FromHtml(html)` — `/scheduledetail\.cgi[^'"]*token=([0-9A-Fa-f]+)/i`
- `extractToken2FromHtml(html)` — `/GO=1&token=([0-9A-Fa-f]+)/`

### `FLICA_URLS`

Central list of confirmed FLICA URLs (login, CGI logon, main menu, load-schedule, left menu, schedule detail, opentime, tradeboard, OT request/drop/swap, request status). Use these instead of scattering string literals.

### `FLICA_CONSTANTS`

`BCID_OPENTIME`, `BCID_TRADEBOARD`, `BASE_JFK`, `CC_JA`, and `USER_AGENT` (must match Charles / mobile Safari style for JetBlue).

## Legacy / PoC code

- `src/dev/flicaPoCCookieStore.ts` — Original SecureStore helpers (same key names as the service). Still used for ancillary keys such as `flica_last_mainmenu_url` where needed.
- `src/dev/flicaPoCScheduleHttp.ts` — Extended flows (CAPTCHA detection, `Referer`, left-menu token extraction). Screen code may call these while migrating fully to `flicaScheduleService`.

## Screen: `app/flica-test.tsx`

Airline Schedule Sync dev screen: hidden WebView auto-login, post-CAPTCHA detection, `CookieManager` read, LoadSchedule inject, token extraction, and schedule import into review. Imports credential/cookie/URL/UA helpers from `flicaScheduleService` where possible; may still depend on PoC HTTP and scratch storage.

## HTML schedule parser: `src/services/flicaScheduleHtmlParser.ts`

After `fetchFlicaScheduleAllMonths` (or PoC multi-month fetch) returns **raw HTML** for a month (~66k chars), parse it for native UI and persistence:

| Export | Role |
|--------|------|
| `stripHtmlToFlicaPlainText(html)` | Drops scripts/styles/tags so table text becomes line-oriented input. |
| `parseFlicaScheduledetailHtml(html, monthKey)` | Full parse; `monthKey` is `YYYY-MM` matching the `BlockDate` month (e.g. `2026-04` for `0426`). |

Output shape:

- **`FlicaScheduleMonthStats`** — `block`, `credit`, `tafb`, `ytd`, `daysOff` (decimals where FLICA shows decimals; `tafb` is regex-scanned from plain text).
- **`FlicaSchedulePairing`** — `id`, `startDate`, `endDate`, `reportTime`, `dEndTime`, `days`, `blockHours`, `creditHours`, `layoverCities`, `legs`.
- **`FlicaScheduleLeg`** — `date`, `departCity`, `arriveCity`, `departTime`, `arriveTime`.

Implementation note: the HTML path **reuses** `parseJetBlueFlicaMonthlyScreenshot` from `src/features/schedule-import/parser/jetblueFlicaStructuredParser.ts` (same engine as OCR/screenshot imports). Pairing-level BLKT/Credit are only filled when those tokens appear in the pairing’s raw text block.

### Example (Metro / dev)

Paste HTML from logs into a dev helper or call:

```ts
import { parseFlicaScheduledetailHtml } from '@/src/services/flicaScheduleHtmlParser';

const r = parseFlicaScheduledetailHtml(htmlString, '2026-04');
console.log(JSON.stringify(r.stats, null, 2));
console.log(JSON.stringify(r.pairings[0], null, 2));
```

Example **shape** (values illustrative):

```json
{
  "monthKey": "2026-04",
  "stats": { "block": 118.13, "credit": 126.39, "tafb": 388.58, "ytd": 498.29, "daysOff": 8 },
  "pairings": [
    {
      "id": "J4173",
      "startDate": "2026-04-06",
      "endDate": "2026-04-09",
      "reportTime": "05:00",
      "dEndTime": "08:56",
      "days": 4,
      "blockHours": 19.9,
      "creditHours": 0,
      "layoverCities": ["LAS"],
      "legs": [
        {
          "date": "2026-04-06",
          "departCity": "JFK",
          "arriveCity": "LAS",
          "departTime": "07:00",
          "arriveTime": "10:15"
        }
      ]
    }
  ]
}
```

## Security notes

- Passwords and cookies live in **Expo SecureStore** (not AsyncStorage).
- Do not log cookie headers or tokens in production builds.
- All schedule fetches must use the persisted session cookie header; do not widen RLS or bypass server rules elsewhere in the app.
