# Flight Club — Crew Tools Ecosystem Product Spec

This file defines the **official Crew Tools ecosystem direction, structure, and product purpose** for Flight Club unless Marcus explicitly changes it. Items listed here are **intended product direction**; not every capability exists or is complete in the app today.

---

## Naming and ecosystem stance

- **Crew Tools** is the **official product / screen / header** name for the bottom-nav tools ecosystem—not a generic label. It is **fully detached** from the old **Utility Hub** *meaning*: **Utility Hub** (Home Row 1 tile) is **not** the same thing as **Crew Tools**, and **must not** be documented or planned as the definition of this ecosystem.
- Crew Tools is a **signature ecosystem** and **main app pillar**, not a random bag of utilities.
- **Product structure (locked):** Crew Tools is a **true top-level destination** in the **bottom navigation** (five tabs), in the **center standout** position—**not** only a Home shortcut.
- **Bottom-tab label:** prefer **“Crew Tools”** when it fits cleanly; **“Tools”** is acceptable only as a **compact visual fallback** for spacing. **Do not** treat **“Tools”** as the official product name in docs or UX copy.
- **Search:** Crew Tools is intended to be the **main searchable tool ecosystem hub**; global Search behavior should **align** with that model over time (exact implementation may lag the product lock).
- It should represent **one of the strongest value pillars** of Flight Club.
- It should support **usefulness**, **retention**, and **premium conversion** where appropriate.
- It should contain **real crew-specific** tools across:
  - **Operational** (schedule, duty, commute execution, airport/security, weather tied to trips)
  - **Intelligence / reference** (contract and policy AI, language packs, layover intel, rules engines)
  - **Support / safety** (Crew Watch, reporting, emergency pathways, verification context)
  - **Lifestyle / practical life** (wellness, family/passenger-facing helpers)
- It should help make Flight Club the **centralized crew platform**, not **just a social app**.

---

## Purpose (summary)

Crew Tools exists to anchor **real utility** in the product: operational need, personal crew-life usefulness, and defensible depth that competitors cannot copy with a generic feature list.

---

## Tool families

The sections below are the **canonical Crew Tools families**. Do not treat this list as implementation-complete unless separately verified in build tracking.

### Schedule / calendar / reminders

*Operational — time, reporting, and household alignment.*

- Crew schedule
- Schedule sync / import
- Monthly calendar
- Weekly agenda
- Export calendar
- Add to Apple / Google calendar
- Add events from shared / pasted emails
- Town hall / meeting reminders
- Report-time alarms
- Crew-rest nap alarms
- Wake Me for Report / smart sleep-to-report tool
- Leave-by reminders
- Schedule-linked reminders
- Family share plain-language schedule tool
- Loved-one share links / screenshots

### Duty / contract / legality

*Operational + compliance intelligence.*

- Duty Guard / Contract Clock / Legalities
- Time-out tracker
- Delay legality warnings
- “Doors must close by” timing
- E16 trigger alerts
- Rule / contract trigger alerts
- Irregular ops alerts
- Airline / workgroup rules engine
- Contract intelligence overlay
- Manual dependability / attendance watch
- Progressive guidance / final-warning tracking (manual)

### Contract / union / policy AI

*Intelligence / reference — searchable, source-backed guidance.*

- Contract AI search
- Union question assistant
- Company policy assistant
- Work-rule search
- Uniform compliance search
- FMLA explainer / search
- KCM / TSA rule search
- Source-backed answers
- Saved proof packs

### Commute / transit

*Operational + intelligence — getting to the airport and between airports.*

- Commute planner tied to report time
- Home / crashpad / hotel to airport planner
- Terminal-aware leave-by calculator
- Traffic alerts
- Airport irregular ops alerts
- Airport-to-airport commute planning
- Best flight before report
- Backup flight options
- AirTrain / rail / subway / transit assist
- Saved commute profiles
- Commute Guard / commute intelligence
- Smart wake-to-report calculator

**Later / expansion (within this family)**

- Historical risk / probability logic (later)

### Airport / checkpoint / security

*Operational + reference at the checkpoint.*

- KCM quick help
- Crew security guide
- TSA quick reference
- Official screenshot cards
- Ask-for-supervisor proof mode
- Airport-specific crew screening notes
- KCM availability by airport
- Regular screening-only airport notes
- REAL ID / crew-entry / digital ID support info
- Crew rights / federal rules hub

**Later / expansion (within this family)**

- International screening notes (later)

### Language assist

*Intelligence + practical communication support.*

- Crew Language Assist
- Airport-code-to-language lookup
- Destination packs
- Boarding phrases
- Safety phrases
- Service phrases
- Emergency phrases
- Favorites
- Practice / flashcards
- Show-passenger mode
- Custom translate backup
- Phonetic pronunciation

**Later / expansion (within this family)**

- Audio (later)
- Offline packs (later)

### Weather / route / ops

*Operational context tied to flying and ground movement.*

- Weather tool
- Departure / arrival / layover weather
- Severe weather watch
- Route weather
- Commute weather
- Schedule-linked weather alerts

### Layover / arrival intelligence

*Intelligence + lifestyle — on the ground at destination.*

- Layover Intel
- Arrival alerts by city
- Hotel shuttle info
- Hotel safety notes
- Crew Watch area alerts
- Food nearby
- Things to do
- Current events
- Best rooms / worst rooms notes
- Quiet room intel
- Sleep / recovery tips
- Grocery / pharmacy / errands
- Airport return tips

### Safety / support

*Support / safety — alerts, reporting, escalation.*

- Crew Watch / Aviation Watch
- Location-based alerts
- Unsafe area reports
- Scam / fraud reports
- Hotel concern reports
- Shuttle / ride concern reports
- Security / KCM issue reports
- Community verification levels
- Help Me Now signal
- Emergency resource hub
- Wellness / recovery support

**Later / expansion (within this family)**

- Anonymous support spaces (later)

### Wellness

*Lifestyle / health routines tied to crew patterns.*

- Water intake tracking
- Skin care reminders
- Meal timing
- Weight-loss routine support
- Crew-specific wellness routines
- Stretch / mobility
- Sleep / recovery tools
- Smoker-friendly break / rest timing
- Quit-smoking tools

**Later / expansion (within this family)**

- Airport / hotel gym info (later)
- Trainer / discounts (later)

### Family / passenger tools

*Lifestyle + communication with non-crew stakeholders.*

- Family-on-my-flight notices
- First-flight jitters / nervous flyer note system
- Accept / decline preference controls
- Family share schedule
- Loved-one status understanding tools

---

## Major hard-core tool directions (must not be forgotten)

These are **directional commitments** for the ecosystem, not a guarantee of current build state:

- Universal **scan schedule → Flight Club sync**
- **Scan resume** upload
- **GPS-based Plan My Commute** tool
- **GPS / location-driven** support inside tools like Crashpads / Housing
- At least **one additional future scan-based tool** to be remembered later

---

## Product principles

- Crew Tools should feel **crew-specific**, not generic.
- Crew Tools should **reduce chaos**: scattered apps, screenshots, guesswork, and rumor-based workflows.
- Crew Tools should support both **operational need** and **personal crew-life** usefulness.
- Crew Tools should include both **high-frequency quick-use** tools and **deeper reference / intelligence** tools.
- Crew Tools should be **discoverable from Home** via **Row 2** shortcuts/favorites, **Recommended Tools**, and related surfaces, while the **tab** remains the **primary** entry for the full ecosystem—**without** conflating the **Utility Hub** (Row 1) tile with Crew Tools.
- Crew Tools should contain some of the most **retention-heavy** and **subscription-worthy** value in Flight Club.
- Crew Tools should help **differentiate** Flight Club from ordinary social / community apps.

---

## Closing note

Use this spec together with **`docs/flight-club-master-inventory.md`** (full scope), **`docs/flight-club-master-rules.md`** (universal app laws), and **`docs/flight-club-home-spec.md`** (Home structure and promotion surfaces). If Crew Tools scope or naming conflicts across documents, **resolve with Marcus** before changing canonical intent.
