# FLIGHT CLUB — LOCKED FLICA IMPORT BLUEPRINT

**CONFIRMED WORKING FLOW**

Do not change casually. This is the source-of-truth flow for FLICA schedule import in Flight Club.

---

## PURPOSE

This blueprint defines the exact confirmed working FLICA schedule import flow for Flight Club.

It must be treated as the hard-rule reference for:

- restoring the flow if it breaks
- integrating future airlines on FLICA
- preventing accidental architecture drift
- debugging future regressions quickly

If code is touched later, **this blueprint is the first thing to compare against**.

**Related project references:**

- Cursor rule (when editing `**/*flica*`): `.cursor/rules/flica-integration.mdc`
- Implementation entry: `app/crew-schedule/import-flica-direct.tsx` (and linked services as described below)

---

## CONFIRMED WORKING IMPORT FLOW

### STEP 1 — OPEN FLICA LOGIN IN WEBVIEW

- Load the airline FLICA login URL in a WebView
- Example JetBlue: `https://jetblue.flica.net/ui/login/index.html`
- Auto-fill stored credentials from secure local device storage
- User completes CAPTCHA if required
- Do not alter the existing working auto-login and CAPTCHA handling unless absolutely necessary

### STEP 2 — WAIT FOR POST-CAPTCHA FINALIZATION

**Do NOT** begin schedule import on the first `mainmenu?nocache` page.

The handoff must wait until post-CAPTCHA finalization is confirmed.

**Confirmed acceptable signals:**

- URL contains `GOHM=1`
- and/or post-captcha finalized state is true
- and/or `leftmenu` / reCAPTCHA-cleared signal confirms the session is fully finalized

**Important:**

- plain `mainmenu.cgi?nocache=...` alone is too early
- starting too early causes LoadSchedule to return only shell HTML instead of token-bearing content

### STEP 3 — DETECT FINALIZED MAIN MENU

Once post-CAPTCHA is finalized:

- detect `mainmenu.cgi` in the URL
- begin the import handoff **exactly once** per sync run
- use a ref/guard so this handoff cannot fire repeatedly

**Expected log:** `[FLICA] mainmenu detected <url>`

### STEP 4 — CAPTURE COOKIES NATIVELY

Use native `CookieManager` to read cookies for the airline FLICA origin.

**Required cookies:**

- `FLiCASession`
- `FLiCAService`
- `AWSALB`
- `AWSALBCORS`

Build the cookie header string from these values. Persist them in secure local storage.

**Important rules:**

- native cookie capture is required
- HTTP fetch cannot read the needed cookie headers the same way
- cookie capture must happen after the authenticated post-captcha session is finalized

**Expected logs:** `[FLICA] cookies captured ...` · `[FLICA] loadFlicaCookies result ...`

### STEP 5 — NAVIGATE WEBVIEW TO LOADSCHEDULE

After cookies are captured:

- navigate the WebView to the exact LoadSchedule URL
- do **not** use native HTTP fetch for this step
- this step must happen in the WebView

**JetBlue working example:**  
`https://jetblue.flica.net/online/mainmenu.cgi?LoadSchedule=true&IsMobile=false`

**Hard rule:** **NEVER** replace this WebView LoadSchedule step with a native fetch step.

**Expected log:** `[FLICA] injecting loadschedule url ...`

### STEP 6 — CAPTURE LOADSCHEDULE HTML FROM THE CORRECT DOCUMENT LAYER

Once the WebView reaches LoadSchedule:

- capture the token-bearing LoadSchedule HTML via `postMessage`
- the token may not always be in the simplest top-level shell capture
- use the confirmed working capture method that identifies the correct source layer

In the confirmed successful run:

- a **deep capture** was performed
- the chosen source for token1 extraction was: **`topOuterHtml`**
- that source did contain the token-bearing content

**Expected successful logs:**  
`[FLICA] loadschedule deep capture received ...` · `[FLICA] loadschedule source used for token1: topOuterHtml` · `[FLICA] candidate preview ...` · `[FLICA] token1 00000000...`

**Hard rule:** token1 must come from **WebView-delivered LoadSchedule HTML**. Do not invent alternate token1 sources unless clearly proven.

### STEP 7 — EXTRACT TOKEN1

Run the existing token1 extractor against the captured LoadSchedule HTML.

**Confirmed extractor pattern:** token1 comes from content matching `scheduledetail...token=...`

**Confirmed successful result example:**  
`[FLICA] token1 000000006BF24E6901DCD2C5E1599246`

**Hard rule:** If token1 is null, the problem is in the **LoadSchedule capture** step, not in the later schedule fetch flow.

### STEP 8 — FETCH THE INTERMEDIATE SCHEDULEDETAIL PAGE

Use native HTTP request with the captured cookies and token1.

**Pattern:**  
`GET /full/scheduledetail.cgi?BlockDate=[MMYY]&token=[TOKEN1]`

This returns the intermediate “Updating schedule” HTML page. That HTML contains JavaScript with the real `GO=1` token.

**Hard rule:** This step is **native HTTP** after token1 is obtained. This is not a WebView parsing step.

### STEP 9 — EXTRACT TOKEN2 (GO=1 TOKEN)

From the intermediate “Updating schedule” HTML:

- extract the dynamic `GO=1` token
- this token is session-specific and single-use

**Hard rule:** token2 must come from the **intermediate scheduledetail HTML**, not from the LoadSchedule page.

### STEP 10 — FETCH REAL SCHEDULE HTML FOR EACH MONTH

Use token2 and the captured cookies to fetch the final schedule HTML.

**Pattern:**  
`GET /full/scheduledetail.cgi?GO=1&token=[TOKEN2]&BlockDate=[MMYY]&JUNK=[timestamp]`

**Confirmed working months:** `0326` · `0426` · `0526`

**Confirmed successful logs:**  
`[FLICA] march html length 67485` · `[FLICA] april html length 66196` · `[FLICA] may html length 58864`

This confirms the final schedule HTML was returned successfully.

### STEP 11 — PARSE FINAL SCHEDULE HTML

Use the existing FLICA HTML parser to convert each month into structured schedule data.

Do not parse from screenshots or debug views for this flow. Use the final `scheduledetail` HTML only.

### STEP 12 — UPSERT TO SUPABASE

Persist the parsed schedule using **upsert**, not insert.

This is the normalized source for the real native Flight Club Schedule screen.

**Hard rule:** Do not bypass persistence for the real product flow.

### STEP 13 — HIDE WEBVIEW / FINISH IMPORT

On success:

- hide the WebView
- stop sync/import loading state
- show success toast
- navigate back to the real native Schedule screen/tab

**Confirmed desired finish:** no review screen, no debug-only detour, return directly to Flight Club Schedule.

---

## CONFIRMED SUCCESS SIGNALS

The FLICA import is considered successful only when these are true:

1. post-captcha finalized signal happened
2. main menu handoff began after finalization
3. cookies were captured
4. LoadSchedule was reached in WebView
5. token1 was non-null
6. token2 was extracted
7. March/April/May HTML lengths were non-zero and realistic
8. parsed data persisted
9. native Schedule screen updated from imported data

---

## HARD RULES

| Rule | Statement |
|------|-----------|
| **1** | Never start import on plain `mainmenu.cgi?nocache` before post-CAPTCHA finalization. |
| **2** | Never use native HTTP fetch for `MAINMENU_LOADSCHEDULE`. That step must remain a WebView navigation/capture step. |
| **3** | token1 must come from WebView-delivered LoadSchedule HTML. |
| **4** | token2 must come from the intermediate scheduledetail “Updating schedule” HTML. |
| **5** | Cookies must be captured natively using CookieManager. |
| **6** | Do not casually rewrite the auto-login flow. |
| **7** | Do not casually rewrite the CAPTCHA flow. |
| **8** | Never use a review screen in the production FLICA import flow. |
| **9** | Persist imported schedule data with upsert. |
| **10** | The native Flight Club Schedule screen should render from normalized persisted data, not directly from raw FLICA HTML. |

---

## DEBUGGING ORDER IF IT BREAKS AGAIN

If FLICA breaks later, debug in this **exact** order:

1. Did post-captcha finalization happen?
2. Did main menu handoff start only after GOHM / leftmenu / finalized state?
3. Were all 4 cookies captured?
4. Did WebView reach LoadSchedule?
5. Did the captured LoadSchedule source contain token1?
6. Was token2 extracted from the intermediate scheduledetail page?
7. Did final March/April/May HTML return?
8. Did parsed data save correctly?
9. Is the bug actually rendering/mapping instead of import?

---

## CURRENT STATUS

Import flow is **confirmed working** at the time this document was locked.

The remaining issues, if any, are downstream **rendering/mapping** issues in the native Schedule UI, not the core FLICA auth/token/cookie/month-download flow.
