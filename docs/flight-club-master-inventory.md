# Flight Club — Master Inventory

This document is the **canonical master inventory** for Flight Club. It describes top-level product areas, core systems, tool families, and future expansion targets. Unless Marcus explicitly changes it, treat this file as the single source of truth for what the app is meant to contain and how it is structured for planning and rebuilds.

---

## Current pillars (top-level app sections)

**Bottom navigation (locked — five tabs):** Home → Crew Rooms → **Crew Tools** (center standout) → Social Feed → Profile. **Crew Tools** is a primary pillar, not a secondary shortcut. **Crew Rooms** and **Social Feed** remain distinct top-level destinations. **Messages** is not in the bottom nav (see shell rules below).

These are the main top-level areas of the app (including tab roots and other primary entry points):

- Home
- Crew Rooms
- Social Feed
- Profile
- Messages
- Search
- Notifications
- Tradeboard / Swap Signals
- Crashpads / Housing
- Non-Rev / Loads
- Crew Tools
- Career Hub
- Wellness / Support
- Aviation Now / News
- Airline Hubs / Directory

---

## Core shell rules (locked)

Navigation and chrome behavior:

- Bottom nav is **Home**, **Crew Rooms**, **Crew Tools**, **Social Feed**, **Profile** (five tabs; **Crew Tools** is the **center standout** tab)
- **Messages** is not in bottom nav; it is accessed from header, profiles, and notifications
- **Home** opens by default after login
- No back arrows on bottom-nav root screens (five primary tab destinations)
- Deep screens use simpler task headers
- Red branded header shell is the master blueprint
- Only **Home** shows the Flight Club logo in the header
- Other top-level screens use the same red shell with a screen title
- Full-screen scrolling; no trapped mini-scroll areas
- Pull-to-refresh on live / current content screens
- Keyboard must never cover fields or buttons
- Profile data is the single source of truth for avatar and display name everywhere
- System / Light / Dark appearance support
- Smart Default home layout affects **emphasis**, not access

---

## Core system — Universal onboarding, identity, and access

These capabilities are core and affect the whole app:

- Sign up / sign in
- Required onboarding before entering the app
- **User type**
  - employee
  - aspiring
  - exploring
- Airline
- Department
- Role
- Reserve vs lineholder
- Airline interest (for aspiring users)
- Suggested groups based on onboarding
- Tool recommendations based on onboarding
- Public badge system
- Private access logic
- Privacy controls for what is public vs hidden
- Anonymous-mode support in selected spaces
- Utility-only / quiet mode option for users who do not want social
- Ability to update airline / department / role later
- Approval / reverification flow for protected-access changes
- Contact syncing
- Notification permission prompt
- Settings deep-links for permissions

---

## Home screen — Master inventory

### Fixed / core home areas

- Welcome / greeting
- **Row 1 — four permanent quick tiles (locked for now):** Crew Schedule · Non-Rev Loads · Crashpads / Housing · **Utility Hub** (this tile is **not** the same thing as the **Crew Tools** tab; final purpose of Utility Hub is **undecided** and may be repurposed later)
- **Row 2 — personalized shortcuts / user favorites** (separate from the four permanent tiles)
- Home should **not** carry the full burden of tool discovery; the **Crew Tools** tab is the **true bottom-nav** tools pillar, primary hub, and searchable ecosystem surface (**fully detached** from the old “Utility Hub” as a *synonym* for that ecosystem)
- Activity
- Live Action Alerts
- Flight Club Top 10

### Flexible / lower home modules

- Crew Honors / Awards
- Recommended For You
- Hot Drops / Trade Watch
- Career Hub snapshot
- Commute Assist snapshot
- Airline Hub shortcut
- Aviation Now
- Wellness snapshot
- Layover Intel
- Favorite Rooms
- Calendar / Today summary
- Saved tools

### Home preset modes

- Community + Utility
- Utility + Ops
- Career + Growth
- Quiet + Utility
- Custom

---

## Tool family — Community / social systems

- Social Feed
- Posts
- Comments
- Replies
- Likes / reactions
- Mentions / tags
- Follow / connect
- Suggested people
- Chemistry matching / Find Your People
- Activity feed
- Viral / meme / culture content
- Crew Honors / Awards
- **Flight Club Top 10**
  - Posts
  - Rooms
  - Tools
  - Drops
  - Buzz
- People you fly with most / overlap suggestions (later)
- Anonymous participation in selected spaces
- Quiet / tools-only mode without general social

---

## Tool family — Crew Rooms

### Standard crew rooms

- General crew rooms
- Airline-specific rooms
- Role-specific rooms
- Department-specific rooms
- Base-specific rooms (later)
- Invite-only rooms
- Verified-only rooms (later)
- Founder-created starter rooms
- User-created rooms
- Room discovery
- Suggested rooms
- Boost / promote room
- Featured room system
- Ambassador / moderator / mentor-led rooms
- Official org pages separate from messy community rooms

### Structured work rooms

These are **not** normal chat rooms:

- Pickup-only rooms
- Drop-only rooms
- Trade-only rooms
- Schedule-drop chaos rooms
- **Category rooms**
  - transatlantic
  - Caribbean
  - core
  - mint
  - reserve-specific
  - domestic
- No-side-chat rooms
- Auto-filtering of wrong post types
- Structured post templates
- Public claim / queue / first-in-line system
- Hot / expiring indicators
- Watched type alerts
- Saved alert presets for trip types

---

## Tool family — Messages / communication

- Direct messages
- New message live search
- Start DM from profile
- Share to DM
- Message inbox with read/unread and newest first
- Same-flight temporary crew room / flight room
- QR code connect for same flight
- Optional auto-connect to same-flight crew (later)
- Cross-workgroup flight room (later)
  - FA
  - pilot
  - gate
  - ramp
  - catering
  - tech/ops

---

## Tool family — Notifications

### Categories

- Social
- Messages
- Crew Rooms
- Trades
- Housing
- Alerts
- System

### Notification types

- Replies
- Mentions
- Follows
- DMs
- Crew room activity
- Watched room activity
- Trade claim updates
- Hot drop alerts
- Housing inquiries
- Saved housing search match
- Schedule drop reminders
- Bid reminders
- Duty Guard alerts
- Commute alerts
- Crew Watch alerts
- Aviation Now alerts
- Calendar reminders
- System reminders

### Notification controls

- Push permission prompt
- Category toggles
- Quiet hours
- Off Day / DND mode
- Mark all read
- In-app notification center
- Push deep-links to exact destination

---

## Tool family — Tradeboard / Swap Signals

- Legally safe non-FLiCA trade intent system
- Swap signals
- Drop signals
- Pickup signals
- Structured cards
- Filters
- Notifications
- Public claim queue
- Time-sensitive urgency indicators
- Airline / role / category filters
- Watched trip type alerts
- Money-attached indicator (if allowed)
- “Execute in official systems” handoff language

---

## Tool family — Crashpads / Housing

- Crashpad listings
- Housing listings
- Hot bed / cold bed
- Standby bed allowed
- Beds available tonight
- Price per trip
- Posted by line
- Tags / amenities / crew rules
- Saved searches
- Housing detail pages
- Housing messages
- Cover photo / photo galleries
- Verification tag
- Transit nearby notes
- Hotel / transport notes (later)
- Rent reminders / tracking (later)
- Future payment layer (later)

---

## Tool family — Non-Rev / Loads

- Non-Rev loads section
- Flight load sharing / lookup concept
- Commute planning integration
- Best flight options before report time
- Backup options
- Risk / probability logic
- Airport-to-airport commuter logic
- Saved backup routes
- Token / pay differentiation concept for load requests

---

## Tool family — Crew Tools hub

This is the **bottom-navigation** tools ecosystem (**official product / screen name: Crew Tools**). It is **not** interchangeable with the **Utility Hub** Home tile; Utility Hub remains a **separate** Row 1 surface until its purpose is redefined.

### Schedule / calendar / reminders

- Crew schedule
- Schedule sync / import — **FLICA direct import (locked 13-step blueprint):** [flica-import-blueprint.md](flica-import-blueprint.md) (source of truth: WebView login → post-captcha finalization → cookies → WebView LoadSchedule → token1 from capture → HTTP scheduledetail → token2 → months → upsert)
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

- Commute planner tied to report time
- Home / crashpad / hotel to airport planner
- Terminal-aware leave-by calculator
- Traffic alerts
- Airport irregular ops alerts
- Airport-to-airport commute planning
- Best flight before report
- Backup flight options
- Historical risk / probability logic (later)
- AirTrain / rail / subway / transit assist
- Saved commute profiles
- Commute Guard / commute intelligence
- Smart wake-to-report calculator

### Airport / checkpoint / security

- KCM quick help
- Crew security guide
- TSA quick reference
- Official screenshot cards
- Ask-for-supervisor proof mode
- Airport-specific crew screening notes
- KCM availability by airport
- Regular screening-only airport notes
- International screening notes (later)
- REAL ID / crew-entry / digital ID support info
- Crew rights / federal rules hub

### Language assist

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
- Audio (later)
- Offline packs (later)

### Weather / route / ops

- Weather tool
- Departure / arrival / layover weather
- Severe weather watch
- Route weather
- Commute weather
- Schedule-linked weather alerts

### Layover / arrival intelligence

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
- Anonymous support spaces (later)

### Wellness (within Crew Tools scope)

- Water intake tracking
- Skin care reminders
- Meal timing
- Weight-loss routine support
- Crew-specific wellness routines
- Stretch / mobility
- Sleep / recovery tools
- Smoker-friendly break / rest timing
- Quit-smoking tools
- Airport / hotel gym info (later)
- Trainer / discounts (later)

### Family / passenger tools

- Family-on-my-flight notices
- First-flight jitters / nervous flyer note system
- Accept / decline preference controls
- Family share schedule
- Loved-one status understanding tools

---

## Tool family — Career Hub

### Core paths

- Aspiring path
- Current employee path

### Tools

- Flight attendant checklist
- Resume builder
- Resume review
- Airline-specific tailoring
- Interview prep
- Pay transparency
- Airline comparison
- Training prep
- Flashcards / quizzes
- Airport code tests
- Role-switch support
- “What the job is really like” prep
- New-hire buddy / mentor support
- Conditional-offer prep
- Real pay / protection education

---

## Tool family — Airline Hub / Directory

- Airline profile pages
- Resource directories
- Scheduling contacts
- Crew services contacts
- Inflight contacts
- Benefits / help contacts
- Union links
- Emergency contacts
- Training links
- Base resources (later)
- Airline-specific tool links
- Public resource pages separate from social rooms

---

## Tool family — Aviation Now / News

- Aviation Now / Flight Club Now
- Breaking updates
- Verified summary cards
- What we know / don’t know
- Source labels
- Discussion under stories
- Airline / labor / weather / incident categories
- Home alert integration
- Future host / editor segment
- Contributor / influencer news partnership (later)

---

## Tool family — Marketplace / commerce

### Crew Market

- Crew-made products
- Bag tags
- Luggage accessories
- Uniform accessories
- Clips
- Handmade crew items
- Seller profiles
- Product listings
- Featured creators
- Future transaction or listing monetization

### Uniform Exchange

- Sell / trade / free
- Size filters
- Airline filters
- Condition
- Pickup / ship options

### Flight Club goods (later)

- Branded merch
- Scarves / scarf clips / magnets
- Hoodies
- Shirts
- Companion / loved-one merch

---

## Core system — Verification / status

- Flight Club Official
- Verified Organization
- Verified Creator / Influencer
- Ambassador
- Founder
- Mentor
- Moderator
- Protected employee verification
- Different badges / icons by role type

---

## Core system — Founder / ambassador / community roles

- Founding Crew
- Ambassadors
- Mentors
- Moderators
- Community helpers
- Base leads (later)
- Airline / role-specific seeders
- Suggestion board contributors
- Feedback / test group
- Perks and recognition

---

## Core system — Rewards / tokens / credits

- Points / credits / tokens
- Earn for useful engagement
- Redeem for perks
- Premium discount support
- Temporary unlocks
- Room boosts
- Streaks
- Founder / ambassador rewards
- Feature feedback rewards
- Tier / status progression (later)

---

## Future expansion — Enterprise / business

- Business-safe version without messy social
- Airline / union / training onboarding
- Structured official communication
- Official resource hubs
- New-hire support
- Policy / contract search
- Role-based reminders
- Work-safe communication rooms

---

## Future expansion — Other

There will also be a **Flight Club podcast** in the future, along with **transportation**, **airport food lockers**, **discount programs**, **food vending**, and more.

---

## Product intent — What Flight Club is trying to do

Flight Club is trying to become the **centralized crew platform** for the airline industry by combining:

- safe community
- structured work communication
- real operational tools
- commute and schedule intelligence
- legality and contract support
- housing and layover help
- career growth
- privacy and anonymous controls
- industry news and safety alerts
- crew-specific marketplace and resources

…instead of forcing crew to juggle:

- WhatsApp
- Facebook groups
- random websites
- screenshots
- scattered apps
- rumors
- disconnected tools

---

## Product intent — What you’re trying to change

**Replace:**

- chaos
- fragmentation
- hidden info
- side-chat confusion
- stressful guesswork
- scattered crew culture

**With:**

- structure
- centralization
- role-aware support
- real-time intelligence
- safer communication
- better tools
- stronger community
- more control

---

## Closing note

Some areas in this inventory are **already partially built** in the current codebase; others are **future build targets** or labeled **later** in the source inventory. This document does not claim completion status per line item—it exists to **guide rebuild planning**, keep naming and scope aligned (including **Crew Tools** as a **bottom-nav pillar** and main tools ecosystem, **distinct from** the **Utility Hub** Home tile until that tile is explicitly re-scoped), and preserve the distinction between **top-level sections**, **tool families**, and **future expansion** until Marcus updates the canonical list.
