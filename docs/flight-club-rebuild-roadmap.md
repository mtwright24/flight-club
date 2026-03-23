# Flight Club — Rebuild / Execution Roadmap

This roadmap defines the **recommended execution order** for stabilizing, fixing, and expanding Flight Club unless Marcus explicitly changes it. It is a **planning document**: phases describe **intent and sequencing**, not a guarantee that all work in a phase is complete in the repo today.

---

## Guiding principles

- **Stabilization before expansion** — Fix shell, communication integrity, and misleading placeholders before layering large new ecosystems.
- **Completion of foundations before net-new hubs** — Finish wiring and real data where direction is already right before opening new destination surfaces.
- **Refine on top of good bases** — Many areas are **partially built** and have the **right direction**; they should be **rebuilt or refined in place**, not casually replaced.
- **Placeholders are not product** — Visual stubs and fake trending must not be mistaken for completed systems; replace or wire them explicitly.
- **Docs drive execution** — Master inventory, master rules, Home spec, Crew Tools spec, and this roadmap should align day-to-day work with locked product intent.

---

## Rebuild philosophy

- **Preserve** current backend / data direction unless Marcus **explicitly approves** a change.
- If a screen or feature already has a **good foundation**, **rebuild / refine on top of it** rather than replacing it.
- **Placeholder visuals** should not be confused with finished systems.
- **Fake trending** placeholders should be replaced by the **real Top 10** system.
- Nothing in the app is **fully finished** yet, but many areas already have the **right direction** and should **not be reinvented randomly**.
- **Fix directionally correct systems** before building too many new layers on top.
- **Build docs and product laws** should guide execution.

---

## Current classification (what to do with existing work)

### Preserve and refine

- Profile (overall)
- Crew Rooms (overall)
- Social Feed (overall)
- Tradeboard
- Search
- Notifications

### Partial rebuild using the current base

- Home (overall)
- Crashpads
- Non-Rev Loads
- Messages
- Onboarding / profile setup

### Full rethink

- **Crew Tools** — **bottom-nav placement** (center standout tab), **interior hub experience**, and alignment with Search/registry as the canonical **tools ecosystem** (tab **destination** is **locked**; **interior depth** may still require major build-out). **Utility Hub** (Home Row 1 tile) is **separate**: final purpose **TBD**; **not** the same planning bucket as Crew Tools.

---

## Placeholder, fake, and not-built areas

### Visually started but fake / placeholder

- Activity (on Home)
- Current **fake trending** posts
- Current **fake trending** rooms
- Crew Honors

### Not built at all / net-new build areas

- Recommended Tools
- Recommended For You
- Career hub
- Wellness hub
- Crew Tools **interior** / full tool ecosystem

### Entry exists but destination not built

- **Crew Tools** tab/surface may exist with **placeholder** depth; the **full interior ecosystem** (and full alignment with the **tab + Search** model) is **not** yet built. **Utility Hub** (Home tile or legacy routes) is a **separate** concept from **Crew Tools** and may be **repurposed later**—do not assume one replaces the other in planning.

---

## Core broken-function buckets (already identified)

- Messages button on **other user profiles** does not **reliably** open / start a DM
- **Share flow** is broken or not actually sharing properly
- **Private user** / **private room** systems are **not truly built**
- **Reels / video upload / playback** are major **unfinished** core functions
- **Notifications** are not **fully wired** correctly
- **Home Activity** is not yet truly powered by the **real notification engine**
- **Crashpads / Housing** schema / table issues exist
- **Saved housing / search** issues exist
- **Airline / role / account-based gating** is not fully wired
- Many taps in the app still **suggest action but do nothing**

---

## Core design inconsistency buckets (already identified)

- Notifications **design**
- Crashpads **design / function** mismatch
- Search results / **filter** behavior / polish
- Settings / help / about areas **messy or incomplete**
- **Deep screen / header** inconsistency
- **Clipping / duplicate / broken** header states
- **Wrong red** usage on some screens
- Compose / search / message-related screens using **too much red** in the wrong places

---

## Already-correct direction (stay locked)

- Bottom nav: **Home**, **Crew Rooms**, **Crew Tools** (center standout), **Social Feed**, **Profile** — **Messages** stays out of the tab bar
- **Home** is the default landing screen
- **Home red header** is the master header blueprint
- **Auth** visual direction stays while **functionality** gets finished
- **Profile-style full-screen scrolling** is the universal scroll reference
- **Recommended Tools** and **Recommended For You** remain **separate rows**
- **Top 10** replaces fake trending sections
- **Live Action Alerts** stays a core concept
- **Crew Honors** stays on Home at the bottom

---

## Universal cross-app laws (priority drivers)

These laws **raise the priority** of early phases (shell, communication, notifications):

- Anything that **looks tappable** must **work**
- **“Write something…”** should open the **universal post composer**
- **Universal share sheet** must work across posts / reels / content
- **Universal DM** behavior must work from user profiles and messaging flows
- **Notifications** and **Home Activity** must come from the **same real engine**
- **Video / reels** are **foundational** capabilities
- **Privacy** for private users and private rooms are **real platform rules**, not optional details
- **Airline / role** logic matters across the app
- **Header consistency** is a universal quality requirement
- **Keyboard / input / scroll** behavior must be fixed **universally**, not one screen at a time
- **Structured form input** should use **assisted inputs** where appropriate

---

## Recommended roadmap shape

### Phase 0 — Foundation docs and product laws

- Master inventory
- Master rules / app laws
- Home spec
- Crew Tools spec
- Rebuild roadmap (this document)

**Why first:** Shared vocabulary and locked intent reduce rework and conflicting implementation choices.

---

### Phase 1 — Shell stabilization and universal UX laws

**Focus**

- **Five-tab** bottom navigation structure (**Crew Tools** center standout) aligned with product lock—layout, icons, safe areas, and **no duplicate** header patterns on tab roots; tab **label** prefers **“Crew Tools”** when space allows, with **“Tools”** only as a **compact fallback** (official name remains **Crew Tools**)
- Header consistency
- Scroll behavior
- Keyboard behavior
- Safe areas
- Wrong red usage cleanup
- Tappable consistency
- Universal **“Write something…”** behavior
- Universal routing consistency for user / profile taps

**Why before later phases:** These issues affect the **entire app**. If they remain unresolved, every later feature feels broken regardless of local quality.

---

### Phase 2 — Core communication and notification integrity

**Focus**

- Messages inbox behavior
- Reliable **start / open DM** from profiles and search
- Share-to-DM and **universal share** behavior
- Notification wiring
- Badge counts
- **Home Activity** powered by the **real** notification engine
- Push deep-linking basics

**Why before deep Home polish:** Home, social, and rooms all depend on **communication** and **activity integrity**. Polishing Home on fake or split systems wastes effort.

---

### Phase 3 — Home completion

**Focus**

- Welcome
- **Row 1** four permanent tiles (including **Utility Hub** for now, separate from **Crew Tools**) and **Row 2** shortcuts/favorites strategy
- Recommended Tools
- Recommended For You
- Real Activity
- Real Top 10
- Live Action Alerts
- Crew Honors
- Home templates / presets influence
- Home recommendation logic

**Why after Phases 1–2:** Home must sit on a **consistent shell** and **real** activity / notification systems to feel **alive and trustworthy**.

---

### Phase 4 — Profile, social, and Crew Rooms refinement

**Focus**

- Profile cleanup / refinement
- Social Feed cleanup / refinement
- Crew Rooms cleanup / refinement
- Identity routing consistency
- Privacy / follow-request flows
- Room entry / privacy logic
- Structured room behavior foundations

**Why here:** These areas are **directionally right** and should be refined **after** shared shell and communication systems stabilize, so refinements are not constantly undone by underlying UX breakage.

---

### Phase 5 — Crashpads, Non-Rev Loads, Tradeboard completion

**Focus**

- Crashpads schema / data fixes
- Housing saves / searches / detail flow integrity
- Non-Rev Loads completion
- Tradeboard refinement / completion
- Airline / role / account-linked logic where needed
- Operational flows that depend on **real structured data**

**Why after social / core integrity:** High-value tools, but many depend on **stable data flows** and **interaction consistency** first.

---

### Phase 6 — Onboarding, access logic, and protected identity systems

**Focus**

- Required onboarding completion
- Role / airline / department logic
- Protected-access changes / reverification
- Privacy / public / private controls
- Quiet / tools-only mode
- Personalization inputs that feed Home and recommendations

**Why not earlier:** The app should first stabilize **core shell**, **communication**, and **Home behavior** before deepening **access logic** that touches every surface.

---

### Phase 7 — Crew Tools ecosystem build-out

**Focus**

- **Crew Tools** interior and **route/tab wiring** consistent with the **locked bottom-nav** destination (**Utility Hub** tile repurposing, if any, is **separate** and **TBD**)
- **Interior** Crew Tools structure (the **primary** searchable tools hub)
- Major tool family prioritization
- Signature premium / value-driving tools
- Hard-core directions (e.g. schedule scan → sync, Plan My Commute)
- **Search** results and registry alignment with **Crew Tools** as canonical tools surface (as feasible)

**Why later:** Crew Tools is **large**; interior depth deserves a structured build once the **app shell** (including **tab bar**) and **core systems** stop shifting underneath it. The **tab slot** itself may be addressed earlier in Phase **1** with a **placeholder** screen if needed for navigation integrity.

---

### Phase 8 — Career, Wellness, Aviation Now, Airline Hubs

**Focus**

- Career hub
- Wellness hub
- Aviation Now / news
- Airline hubs / directory
- New destination hubs that can appear in **Recommended For You**

**Why here:** Important destinations, but they benefit from a **defined, functioning** Home and recommendation surface (Phase 3+) rather than floating without a home for discovery.

---

### Phase 9 — Marketplace, rewards, advanced systems, and future expansion

**Focus**

- Rewards / tokens / credits visibility and use
- Marketplace systems
- Verification / status expansion
- Founder / ambassador systems
- Enterprise / business-safe direction
- Podcast and other **future expansion** concepts

**Why last:** Major value-add and growth systems should build on a **stable core app**, not precede it.

---

## Closing note

Use this roadmap together with **`docs/flight-club-master-inventory.md`**, **`docs/flight-club-master-rules.md`**, **`docs/flight-club-home-spec.md`**, and **`docs/flight-club-crew-tools-spec.md`**. When sequencing work, prefer **stabilization and integrity** first, **completion on existing foundations** second, and **net-new expansion** third—unless Marcus reprioritizes explicitly.
