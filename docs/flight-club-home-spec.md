# Flight Club — Home Screen Product Spec

This file defines the **official Home screen structure, priorities, and behavior rules** for Flight Club unless Marcus explicitly changes them. It describes **intended product behavior**; where the current app is not yet aligned, this spec is the target—not a claim that every element is already implemented.

---

## Purpose and role of Home

- **Home** is the central app anchor.
- Home opens **by default** after login / onboarding.
- Home should balance **identity**, **discovery**, **utility**, **retention**, and **monetization**.
- Home is **not** just a feed; it is the **central dashboard for crew life**.
- Home should **not** be expected to carry the **full** tools ecosystem or every tool-discovery path—the **Crew Tools** tab is the **primary tools pillar** and (with Search) the intended **main searchable tool hub**.
- **Smart Default** affects **emphasis / layout**, not **feature access**.
- Users keep **app-wide access** unless a feature is truly **role- or permission-restricted**.

Home is the **emotional anchor** and a **high-level dashboard**; deep **tool discovery** and catalog breadth live primarily under **Crew Tools**.

---

## Fixed Home structure

The Home screen includes these **major areas** (canonical order is governed by the order rules below):

- Welcome / greeting
- **Row 1 — four permanent quick tiles:** Crew Schedule · Non-Rev Loads · Crashpads / Housing · **Utility Hub** (for now). This row is **not** a stand-in for the full **Crew Tools** tab ecosystem; the **Utility Hub** tile is **separate** from **Crew Tools** and its **final purpose is undecided** (may be repurposed later).
- **Row 2 — personalized shortcuts / user favorites** (distinct from Row 1)
- **Recommended Tools**
- **Recommended For You**
- Activity
- Top 10
- **Live Action Alerts**
- **Crew Honors** at the very bottom

---

## Order and placement rules

- **Welcome** sits near the top and reinforces **identity / personalization**.
- **Row 1 permanent tiles** and **Row 2 shortcuts** come early as **quick access**—not as a substitute for the full **Crew Tools** tab (the **true** bottom-nav tools pillar).
- **Recommended** rows come **before** lower social / community wrap-up sections.
- **Activity** is a **summary layer** and must **not** replace the notification center.
- **Top 10** replaces **fake trending** post / room placeholder sections.
- **Live Action Alerts** is for **current / live / important** information.
- **Crew Honors** stays at the **bottom** of Home as a celebratory / community **closeout** section.
- **Crew Honors** does **not** get a separate page in this version.

---

## Welcome

- Welcome should feel **personal** and **alive**.
- It may use **profile-derived** information such as display name, role, base, years of service, or other **approved** quick identity details.
- **Pilots** need role distinction such as **Captain vs First Officer**.
- **Pilots and mechanics** may display **fleet**.
- **Fleet** should **not** be forced on roles where it is not part of identity.
- Welcome should support **personalization** without feeling **cluttered**.

---

## Quick tiles and shortcuts (Row 1 + Row 2)

### Row 1 — four permanent tiles (locked for now)

- **Crew Schedule**, **Non-Rev Loads**, **Crashpads / Housing**, and **Utility Hub** occupy fixed slots (replacing the older **8 + 4** tile-grid intent for Home).
- They are **high-visibility quick access**, not the full tools catalog; **Crew Tools** (tab) owns breadth, structure, and primary **search-aligned** tool discovery for the **tools ecosystem**.
- **Utility Hub** on Row 1 is **not** the same thing as the **Crew Tools** tab; treat its **long-term role as open** until Marcus defines it. **Do not** plan or document Utility Hub as if it *is* the Crew Tools ecosystem.
- **Crew Rooms** should **not** be redundantly placed on Row 1 if already represented by **bottom navigation**.
- Row 1 remains **premium real estate** and should **not** duplicate tab-bar pillars without clear product intent.

### Row 2 — personalized shortcuts / user favorites

- A **separate** row for user- or template-driven **favorites** and shortcuts (not the same as the four permanent tiles).
- Should favor **high-frequency** or **personally prioritized** destinations; **premium / retention-heavy** discovery can also surface via **Recommended Tools** and the **Crew Tools** tab.
- Shortcuts may deep-link into **Crew Tools**, specific tools, or other hubs as appropriate.
- Row 2 composition **may evolve** with personalization and templates.

---

## Recommendation rows

**Recommended Tools** and **Recommended For You** are **separate rows**. Do not merge their intent.

### Recommended Tools

- **Separate row** from Recommended For You.
- Layout: **1 featured wide card + 3 smaller cards**.
- Priority is a blend of **usefulness + monetization**.
- This row surfaces **signature tools**, **paid utility**, or especially **sticky** features.

### Recommended For You

- **Separate row** from tools.
- Layout: **1 featured wide card + 3 smaller cards**.
- Includes **people**, **rooms**, **posts**, and destination hubs such as **Career** and **Wellness**.
- It must **not** become a mixed **tools** row.
- It is primarily for **discovery**, **relevance**, and **community / lifestyle** pathways.

### Recommendation behavior

- Recommendations are **system-driven** by default.
- Users can influence them through **Home templates / preferences**.
- Users do **not** manually edit cards **one by one**.
- Recommendation rows should remain **mostly stable**.
- They should shift meaningfully only when **behavior** or **context** changes.
- Home should feel **smart**, not **random**.

---

## Activity

- Activity exists on Home as a **summary layer**.
- It is powered by the **same real** notification / activity engine as the **notification center**.
- It is **not** a fake separate system.
- It should surface the most **useful / high-signal** recent activity, **not** every single event.
- It should feel **actionable** and **alive**.

---

## Top 10

- Top 10 **replaces** fake trending sections.
- It should feel like a **real ranked / high-attention** area.
- It may include a mix of posts, rooms, tools, drops, buzz, and other high-interest items **as approved by Marcus**.
- Ranking and content mix **may evolve** over time.
- It should **visually** feel important and **competitive / interesting**.

---

## Live Action Alerts

- **Live Action Alerts** is a **core** Home section.
- It is for **current**, **live**, **important**, **time-sensitive**, or **operationally relevant** information.
- It should bring **liveness** and **urgency** to Home.
- Over time it may include operational alerts, commute-relevant issues, safety / current-event items, and similar **high-signal** updates (product direction; not all sources may exist yet).
- It is **distinct** from Top 10 and **distinct** from the notification center.

---

## Crew Honors

- Crew Honors **stays on Home**.
- It is **scrollable**.
- It lives at the **bottom** of the page.
- It acts as a **community recognition / celebration** layer.
- It does **not** get its own separate page in this version.
- It should feel like the **“wrap-up”** section of Home, **not** the main action center.

---

## Home presets / templates

- Presets can influence **what gets emphasized** on Home.
- Presets do **not** remove **broad access** to the app.
- Presets can support directions such as:
  - Community + Utility
  - Utility + Ops
  - Career + Growth
  - Quiet + Utility
  - Custom
- Templates / preferences should influence **emphasis**, **ordering**, and **recommendation flavor** more than **hard-locking access**.

---

## Design and behavior principles

- Home should feel **premium**, **useful**, **alive**, and **personalized**.
- It should sell the **value of the app** without feeling like a **cluttered billboard**.
- It should nod to **signature tools** (Row 1/2 quick access, recommendations) without trying to replace the **Crew Tools** tab or losing **community warmth**.
- It should help users **immediately understand** where to go next.
- It should **reward repeat opens** with relevance.
- It must **not** feel like a **generic feed clone**.
- It should feel **distinctly** like Flight Club.

---

## Closing note

Use this spec together with **`docs/flight-club-master-rules.md`** (universal app laws) and **`docs/flight-club-master-inventory.md`** (scope and inventory). If Home behavior conflicts with those documents, **resolve with Marcus** before treating any single file as overriding the others without discussion.
