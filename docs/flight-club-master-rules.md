# Flight Club — Master Rules (Universal App Laws)

This document contains **universal app laws** for Flight Club. They should govern future design, rebuild, and implementation decisions unless Marcus explicitly changes them. Principles and directional rules are stated as such; not every item implies a fully shipped feature today.

---

## Shell and navigation

- Post-login flow is **Sign in / Sign up → required onboarding / profile setup → Home**, with no extra gates.
- Bottom nav is fixed as **Home**, **Crew Rooms**, **Crew Tools**, **Social Feed**, **Profile** (five tabs). **Crew Tools** is the **center standout** tab and a **true top-level destination**—not treated as only a Home shortcut or hidden secondary ecosystem.
- **Home** opens by default.
- **Messages** is not in bottom nav.
- No back arrows on the **five** bottom-nav root screens.
- Deep pushed screens should use back arrows and simpler, task-focused headers rather than the full top-right icon set.
- Full top-right header icons belong on **top-level screens only**.
- **Bottom sheets / modals** are preferred for: menu, share, quick filters, reaction tray, quick creation choices, and notification-preview lists.
- **Full pushed pages** are preferred for: detailed settings, edit profile, threads, post detail, room detail, and detailed tool flows.

---

## Header

- The **Home red header** is the universal master blueprint.
- Only **Home** shows the Flight Club **logo** in the header.
- Other top-level screens (including **Crew Rooms**, **Crew Tools**, **Social Feed**, **Profile**) use the **same red shell** but replace the logo with the **screen title**.
- The **red branded header color** is the universal app red for buttons, pills, highlights, and active states unless Marcus explicitly changes it.
- **No duplicate headers** should ever appear.
- **No clipped titles** should ever appear.
- If a title is too long, text should shrink enough to fit cleanly.
- Deep screens must still feel visually connected to the same app shell.

---

## Appearance and theme

- App supports **System / Light / Dark**.
- By default, the app should follow the **phone system** setting.
- Users can also choose **System / Light / Dark** inside the app.
- The **Home header red** is the master reference red.
- Section title colors and body text should maintain **clean contrast** while keeping the red shell as the branded anchor.
- Screen content areas should **avoid wrong overuse of red** where the red shell already carries the brand.

---

## Scroll, layout, and safe behavior

- **Full-screen scrolling** is the rule.
- **No trapped mini-scroll** boxes.
- **Pull-to-refresh** should exist anywhere current / live content benefits from refresh.
- **Sticky CTAs / buttons** are allowed only if they do **not** block content or scrolling.
- **Safe-area** behavior must be respected across screens.
- The **keyboard must never cover** a text field, selector, or required button.
- **Swipe-down-to-dismiss keyboard** should be available everywhere appropriate.
- **Profile-style full-screen scrolling** is the reference model for the rest of the app.

---

## Forms and inputs

- Structured input should use **assisted input** where possible instead of raw free typing.
- **State** should use dropdown / select.
- **Date and year** should use calendar / date picker.
- **Time** should use time picker / dropdown.
- **ZIP** can auto-populate city / state when appropriate.
- **City** should still be editable if auto-filled.
- **Address** should use autocomplete / dropdown selection.
- Existing **Google-powered address autocomplete** behavior seen in Crashpads should become a **universal rule** across the app for all relevant fields.

---

## Identity and profile (source of truth)

- **Display name** should come from the onboarding / edit-profile source of truth.
- **Avatar** should come from the onboarding / edit-profile source of truth.
- Identity display should be **consistent everywhere**.
- If a user’s avatar / name appears as a **tappable identity element**, it should route to that user’s profile unless intentionally restricted.
- **Pilots** need role differentiation including **Captain vs First Officer**.
- **Pilots and mechanics** can display **fleet**; other roles generally should **not** be forced into fleet display.
- **Airline / department / role** logic should influence access, personalization, and certain experiences.

---

## Home

- **Home** is the central app anchor.
- Home has fixed **top identity** value and selective **discovery** value; it should **not** carry the **full burden** of representing the entire tools ecosystem—that role belongs to the **Crew Tools** tab (primary hub and, with Search, the main **searchable tool ecosystem** surface).
- Home includes:
  - Welcome
  - **Row 1 — four permanent quick tiles:** Crew Schedule · Non-Rev Loads · Crashpads / Housing · **Utility Hub** (for now; **not** the same as **Crew Tools**; final Utility Hub purpose is **TBD**—do not plan as if it defines the Crew Tools ecosystem)
  - **Row 2 — personalized shortcuts / user favorites** (separate from Row 1)
  - **Recommended Tools**
  - **Recommended For You**
  - Activity
  - Top 10
  - **Live Action Alerts**
  - **Crew Honors** at the very bottom
- **Recommended Tools** and **Recommended For You** stay on Home; they **complement** the **Crew Tools** tab but do **not** replace it as the main tools pillar.

### Recommended Tools

- Layout: **1 featured wide card + 3 smaller cards**
- Priority is a blend of **usefulness + monetization**

### Recommended For You

- Layout: **1 featured wide card + 3 smaller cards**
- Includes **people, rooms, posts**, and non-tool destination hubs such as **Career** and **Wellness**
- Should **not** become a mixed general tools row

### Recommendations and Crew Honors

- Recommendations are **system-driven** by default.
- Users can influence recommendations through **Home templates / preferences**.
- Recommendations should remain **mostly stable** and only change meaningfully when **behavior** changes.
- **Crew Honors** stays on Home, **scrollable**, with **no separate page**, at the **bottom**.
- **Top 10** replaces fake trending sections.
- **Live Action Alerts** is a core Home concept for live / current important information.
- **Smart Default** affects **layout emphasis only**, not access.
- Home templates / presets can influence emphasis but should **not** strip away baseline app access.

---

## Interaction

- Anything that **visually looks tappable** must **actually work**.

### Universal create-post

- Anywhere **“Write something…”** appears, it should open the **same core create-post composer** unless intentionally specialized.

### Universal share

- Share to **DM**
- Share to **Room**
- Share to **Feed / Repost**
- **Copy Link**
- **Share via**

### Universal DM and search

- Messaging another user should **open or start the DM directly** unless privacy rules require another flow.
- **Search filters** must work.
- **Search result** taps must navigate correctly.
- **User identity** taps must navigate correctly.

---

## Notifications and activity

- Notifications must be a **real unread-count-backed** system.
- **Bell badge** and **message badge** should reflect **real unread counts**.
- Notification categories include: comments, replies, reactions, follows, messages, room activity, tool alerts, tags / mentions, system updates, and app alerts.
- **Push notifications** should **deep-link** to the exact destination.
- **Home Activity** is a **curated summary layer** of the same real notification / activity engine.
- Activity should **not** be a fake separate system.
- **Quiet hours / DND / off-day** style controls should be supported.

---

## Messages and communication

- Messages inbox should show **real conversations** with unread / read state and **newest first**.
- **New Message** search should **live-search users**.
- Tapping a result should **open / start the DM thread** immediately.
- Tapping **Messages** on another user’s profile should **open / start a DM** directly.
- Same-flight room concepts and QR-based connection can exist **later**; current DM behavior should already be **universal and reliable**.

---

## Privacy

- **Private users** need real follow-request / access / visibility rules.
- **Private crew rooms** need real approval / access / visibility rules.
- **Sharing** rules must respect private spaces.
- **Anonymous participation** can exist in **selected spaces only**.
- **Quiet / tools-only mode** should exist for users who want less social exposure.
- **Protected-access changes** may require approval or reverification.

---

## Video and media

- **Video upload** must work where offered.
- **Reel creation** must work where offered.
- **Reel / video playback** must work where offered.
- These are **foundational capabilities**, not optional extras.

---

## Data and rebuild preservation

- If a screen or feature already has a **good foundation**, **rebuild on top of it** instead of replacing it without approval.
- **Preserve** current backend / data direction unless Marcus explicitly changes it.
- **Fix and refine** existing work where the direction is already right.
- Do **not** casually replace existing structures that may already matter underneath.
- **Placeholder visuals** should not be confused with finished systems.
- **Fake trending** placeholders should be replaced by the real **Top 10** system.
- **Avatar initials** are an allowed fallback placeholder **only** when no avatar exists.

---

## Crew Tools and Utility Hub (separate concepts)

- **Crew Tools** is the **official product / screen / header** name for the **bottom-nav** tools ecosystem—a **main app pillar**, **bottom-nav root** with **center standout** placement, and **not** merely a Home shortcut. It is **fully detached** from the old idea that **“Utility Hub”** meant the same thing as this ecosystem.
- **Utility Hub** remains a **separate Row 1 Home tile** for now. It is **not** the same thing as **Crew Tools**; it **may be repurposed later**; **do not** lock a final definition for Utility Hub in docs or planning until Marcus specifies it—and **do not** collapse Utility Hub back into Crew Tools in narrative.
- **Bottom-tab label:** prefer **“Crew Tools”** when it fits cleanly; **“Tools”** is allowed only as a **compact visual fallback** if spacing requires it. **“Tools”** is **not** the official product name.
- **Social Feed** remains a top-level tab but **does not** hold the center standout role; **Crew Rooms** and **Social Feed** stay **clearly distinct** destinations.
- Tool visibility, in-app search, and recommendation logic should support **retention, usefulness, and premium conversion** where appropriate; **Search** for tools should align with the **Crew Tools** hub as the canonical mental model (exact UX can evolve in implementation).

### Major hard-core tool directions (must not be forgotten)

- Universal **scan schedule → Flight Club sync**
- **Scan resume** upload
- **GPS-based Plan My Commute** tool
- **GPS / location-driven** support inside tools like Crashpads / Housing
- At least **one additional future scan-based tool** to be remembered later

---

## Product intent

- Flight Club is **not** just a social app.
- Flight Club is **not** just a tools app.
- Flight Club is a **centralized crew platform** combining:
  - safe community
  - structured work communication
  - operational tools
  - commute / schedule intelligence
  - legality and contract support
  - housing and layover help
  - career growth
  - privacy controls
  - safety / news / alerts
  - crew-specific marketplace / resources

---

## Closing note

These rules should be used together with **`docs/flight-club-master-inventory.md`** and any future build specs. Where a rule and the inventory differ, **resolve explicitly with Marcus** rather than improvising. This file is the canonical reference for **how** the product should behave and be built at a universal level; the master inventory remains the canonical reference for **what** exists in scope.
