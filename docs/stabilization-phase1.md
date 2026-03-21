# Phase 1 stabilization — minimal smoke matrix

Use this after Phase 1 tasks that should **not** change product behavior (tooling, dead-code removal, type config, etc.).

| # | Area | Steps | Pass criteria |
|---|------|--------|----------------|
| 1 | **Cold start / auth** | Force-quit app → launch. If logged out: sign in. If logged in: observe initial screen. | App reaches **main tabs** without crash; no infinite spinner on first paint. |
| 2 | **Home tab navigation** | On **Home** tab, tap **Crashpads / Housing** tile (or path you use today). Return. Tap **Crew schedule exchange** (or **Crew Exchange**) tile. | Each opens the **expected** screen; **Back** or tab switch returns without crash. |
| 3 | **Social Feed** | Open **Social Feed** tab. Pull to refresh if available. | List or empty state renders; **no** redbox / uncaught error. |
| 4 | **Crew Rooms** | Open **Crew Rooms** tab. | List or empty state renders; **no** crash. |
| 5 | **Profile** | Open **Profile** tab. | Own profile UI loads; **no** crash. |
| 6 | **Notifications** | From header bell (or navigate to notifications route you use). | Screen opens; **no** crash (badge/realtime hook OK if zero items). |
| 7 | **Messages inbox** | Open **messages / inbox** (e.g. from header DM or `/messages-inbox`). | Inbox UI loads; **no** crash (empty inbox OK). |
| 8 | **Crashpads hub** | Navigate to **`/(screens)/crashpads`** (e.g. from Home tile or deep link you use). | Hub loads; **no** crash. |

**Notes**

- Run on **one** platform you ship first (e.g. iOS simulator or device); expand if a task touched platform-specific code.
- If any step **fails**, note the task just merged and capture logs / screen recording before continuing Phase 1.
