# PrepOS Student Experience Audit Report

**Audit date:** 30 May 2026  
**Environment:** Production deploy at `https://prabel-94.github.io/prepOS-basic/` (GitHub Pages) + local codebase review  
**Scope:** Student-facing UX only (not a code review)  
**Method:** Live interaction on public exam flows; authenticated flows verified via auth gates + source inspection; screenshots embedded from `audit-screenshots/`

---

## SECTION 1 — Executive Summary

### Current student experience overview

PrepOS today delivers a **multi-page vanilla JS app** centered on a **single long-form student dashboard** (`student-dashboard.html`) that stacks exams, practice, topic notes, and “Learning Intelligence” widgets vertically. Students authenticate via Supabase email/password, land on the dashboard, and reach other experiences through card CTAs or a minimal top nav (Practice link only). Exams can also be taken via **public share links** without login (`exam.html?id=…`). Notes are read in a canonical multi-representation reader (`note.html`). There is **no dedicated student analytics app**, **no profile/settings**, and **no post-exam results hub** outside the inline exam review screen.

### Major strengths

- **Clear functional separation** between exam taking, practice, notes, and intelligence cards on one home surface.
- **Canonical note reader** supports MAP representations (Narrative, Structural, Revision, Timeline, Interpretations) with semantic anchor interactivity for students.
- **Exam autosave + timer + answer review** with correct/incorrect highlighting and optional explanations exist and work on live data (verified on 49-question “Glorious Revolution in England” exam).
- **Student intelligence layer** (`js/student/student-intelligence.js`) aggregates topic mastery, weak topics, and revision recommendations with pedagogical copy in selectors.
- **Shared app nav** (`prepos-app-nav`) gives consistent logout/home affordances on authenticated pages.

### Major weaknesses

- **Navigation is shallow and fragmented**: one nav link (Practice), no notes/analytics/exams in global nav; dashboard is an extremely long scroll.
- **Exam UX is prototype-grade**: all questions on one page, no question palette, no submit confirmation, Eruda debug console shipped in production, `alert()`-based errors.
- **Intelligence is invisible as a “layer”**: analytics run in background; student sees static stat cards with no drill-down, charts, timelines, or “why this recommendation.”
- **Duplicate exam entry paths** (manual exam ID + assigned list) create confusion; recent attempts show raw UUIDs without titles or re-open links.
- **Mobile layouts under-use horizontal space** (exam content column ~390px on wide screens; dashboard cards stack without mobile-specific IA).
- **Visual inconsistency**: login password field width bug; teacher-styled inspector chrome reused for student cognition; inline styles in `note.html` and exam results.

### Top UX risks

| Risk | Impact |
|------|--------|
| Eruda + console logging on `exam.html` | Students see debug UI; performance + trust hit |
| No submit confirmation on high-stakes exams | Accidental submission |
| 49+ questions on one scroll with no navigator | Cognitive overload, lost progress anxiety |
| Auth-gated dashboard with no progressive empty states for logged-out users | Immediate redirect; no onboarding |
| Intelligence cards empty until “verified practice” with no guided path | Students never perceive PrepOS as an OS |
| Public exam + canonical exam dual modes | Inconsistent results persistence and analytics eligibility |

### Quick wins discovered

1. Remove Eruda from `exam.html` (2 lines).
2. Fix login password input width (CSS one-liner on `input` in login card).
3. Hide manual “Enter exam ID” when assigned exams exist.
4. Add submit confirmation modal using existing `js/ui/modal-system.js`.
5. Link recent attempts to `exam.html?id=…` review state or a results view.
6. Add “Notes” to `NAV_PRESETS.studentHome`.
7. Replace `alert()` on exam/practice critical paths with inline error regions.

---

## SECTION 2 — Student Navigation Architecture

### Navigation map

```
Login (login.html)
└── [auth success, role=student] → Student Dashboard (student-dashboard.html)  ← HOME
    ├── Start Exam [manual ID input] → Exam (exam.html?id={uuid})
    ├── Available Exams [list] → Exam (exam.html?id={uuid})
    ├── Practice card → Practice (practice.html)
    │   └── ?topic={key} deep-link (bank mode)
    ├── Topic Notes [embedded list] → Note Reader (note.html?topic={id}&lang={lang})
    │   └── Semantic anchor click → Anchor Inspector overlay (modal)
    ├── Learning Intelligence / Weak / Strong / Recommendations
    │   └── Practice topic buttons → Practice (practice.html?topic={key})
    └── Recent Attempts [display only — no links]

Global Nav (authenticated pages)
├── Dashboard (student-dashboard.html) — hidden on dashboard itself
├── Practice (practice.html) — only preset link
└── Logout → Login

Exam (exam.html?id=…) — PUBLIC ENTRY (no login required)
├── Enter name → Start Exam
├── Answer all questions (single page)
├── Submit → Inline score + View Answers
├── View Answers → Review mode (same page)
└── Download Review PDF (after review)

Note Reader (note.html) — AUTH REQUIRED
├── Back → Dashboard
├── Language tabs (multi-variant)
├── Representation tabs (Narrative / Structural / Revision / Timeline / Interpretations)
└── Anchor inspector overlay

Unauthorized (unauthorized.html) — wrong role
Practice (practice.html) — AUTH REQUIRED (teacher/admin/student)

ORPHAN / NOT STUDENT
├── topic-note.html — legacy teacher WYSIWYG editor
├── topics.html — redirects to qb-manager.html (teacher)
└── index.html “Student Mode” — teacher/admin preview entry
```

### Entry points

| Entry | Route | Auth |
|-------|-------|------|
| Teacher-provided credentials | `login.html` | No |
| Role home redirect | `student-dashboard.html` | Yes |
| Assigned exam deep link | `exam.html?id=` | Optional |
| Public exam share link | `exam.html?id=` | No |
| Practice deep link | `practice.html?topic=` | Yes |
| Note deep link | `note.html?topic=&lang=` | Yes |

### Exit points

- Logout → `login.html`
- Exam home link (when logged in) → dashboard
- Note reader back link → dashboard
- Unauthorized → role home or login

### Modal / overlay flows

| Flow | Trigger | Component |
|------|---------|-----------|
| Anchor cognition inspector | Click `.semantic-anchor.existing-anchor` in published notes | `openAnchorInspector()` in `js/ui/teacher-inspector.js` via `anchor-student-reader.js` |
| (Teacher-only elsewhere) governance / anchor note editor | Not available to students | — |

### Dead ends

- **Recent Attempts** on dashboard: score + timestamp only; no navigation to review or exam title.
- **Exam after submit**: no “Return to Dashboard” CTA in results header (home link only if logged in).
- **Practice session summary**: no link to notes or weak-topic recommendations.
- **Unauthorized** for wrong role with no explanation of which role is required.

### Navigation loops

- Dashboard → Practice → Dashboard (via nav) — acceptable but minimal.
- Dashboard → Note → Dashboard — OK.
- **Loop risk**: Manual exam ID + assigned exam list both route to same exam page with different discovery mental models.

### Orphan pages (student-relevant)

| Page | Status |
|------|--------|
| `topic-note.html` | Deprecated for students; teacher legacy editor |
| `topics.html` | Redirects to teacher QB — not student |
| `admin/analytics-debug.html` | Admin/debug — not student |

---

## SECTION 3 — Student Page Inventory

---

## Login

### Purpose
Email/password authentication; route users to role home.

### Route
`/login.html`

### Source File
`login.html`, inline script; `js/core/access.js`, `js/core/get-client.js`

### Current Status
**Active**

### Screenshot
![Login desktop](audit-screenshots/01-login-desktop.png)

![Login mobile 390px](audit-screenshots/01-login-mobile-390.png)

### Notes
- Password input renders **narrower than email field** (CSS/layout bug).
- Errors shown in `#errorBox`; role missing uses blocking `alert()`.
- No forgot-password, SSO, or student onboarding copy beyond “Use credentials provided by your teacher.”

---

## Student Dashboard

### Purpose
Primary home: exams, practice entry, topic notes list, learning intelligence widgets, recent attempts.

### Route
`/student-dashboard.html`

### Source File
`student-dashboard.html`, `js/student-dashboard.js`, `js/student/student-dashboard-renderer.js`, `js/student/student-intelligence.js`, `js/student/student-selectors.js`, `js/notes/note-home.js`

### Current Status
**Active**

### Screenshot
Authenticated state requires student credentials. Unauthenticated users are redirected to login immediately after HTML paint. Static shell (loading placeholders):

```
Start Exam | Available Exams (Loading…) | Practice | Topic Notes (Loading…) |
Learning Intelligence (Loading…) | Weak Topics | Strong Topics | Recommended Revision | Recent Attempts
```

*(Observed via live navigation flash + `student-dashboard.html` source.)*

### Notes
- **11 vertical cards** — very long scroll, no section nav or tabs.
- Duplicated exam entry: manual ID field **and** assigned exam list.
- Intelligence sections depend on canonical attempts + topic-linked questions; empty states are text-only.
- Global nav preset `studentHome` exposes only **Practice** link.

---

## Practice

### Purpose
Generator practice (Malayalam/English patterns) or question bank practice with session limits and adaptive lexicon stats.

### Route
`/practice.html`, optional `?topic={normalizedTopicKey}`

### Source File
`practice.html`, `js/practice.js`, `js/generator-core.js`

### Current Status
**Active**

### Screenshot
Auth required — redirects to login without student session.

### Notes
- Mode toggle: Generator vs Bank (`practice-mode-card`).
- Feedback is inline text (“Correct” / “Wrong. Correct answer: …”) — no link to topic notes.
- Session summary shows accuracy only — no mastery update surfaced in UI.
- `Start Practice` disabled until init completes.

---

## Exam Take

### Purpose
Load exam by UUID, collect student name, timed MCQ attempt, submit, review answers, optional PDF export.

### Route
`/exam.html?id={exam_session_uuid}`

### Source File
`exam.html`, `js/exam.js`, `js/timer.js`

### Current Status
**Active** (also used as public anonymous take)

### Screenshot
![Exam instructions](audit-screenshots/02-exam-instructions-desktop.png)

![Exam active desktop](audit-screenshots/03-exam-active-desktop.png)

![Exam active mobile 390px](audit-screenshots/03-exam-active-mobile-390.png)

### Notes
- **Eruda debug console** loaded in production (`exam.html` lines 115–118).
- “Loading exam…” persists in DOM alongside rendered questions.
- Timer visible in header after start (verified: counting down from ~50:00).
- No instructions screen beyond name entry — no duration/question count/rules.
- No question index / flag-for-review / section grouping.

---

## Exam Results & Review

### Purpose
Show score, toggle full answer review with correct/wrong styling and per-question explanations.

### Route
Same page anchor `#result` / review replaces `#quiz` content

### Source File
`js/exam.js` (`submitExam`, `renderReview`)

### Current Status
**Active**

### Screenshot
![Exam results](audit-screenshots/04-exam-results-desktop.png)

![Exam answer review](audit-screenshots/04c-exam-review-answers-desktop.png)

### Notes
- Score format: `{name}, your score: X/Y` — no percentage, topic breakdown, or time taken shown to student.
- Submit has **no confirmation** dialog.
- Review scrolls to top; long exams require extensive scrolling again.
- PDF download reveals all explanations expanded — good for export, heavy for browser.

---

## Topic Note Reader

### Purpose
Read published canonical notes with MAP representation tabs, semantic anchors, backlinks, language variants.

### Route
`/note.html?topic={topic_uuid}&lang={english|malayalam}` or `?variant={variant_uuid}`

### Source File
`note.html`, `js/notes/note-reader.js`, `js/notes/note-renderer.js`, `js/anchors/anchor-student-reader.js`

### Current Status
**Active**

### Screenshot
Auth required — redirects to login. Published content confirmed in DB for topic **English Revolution** (English + Malayalam variants).

### Notes
- Student nav: back to dashboard, `studentHome` preset.
- Draft workspace, source editor, publish toolbar — **teacher only** (hidden for students).
- Representation tabs filtered by available blocks (`getAvailableTabs`).
- Semantic anchors open read-only inspector (`studentMode: true`, `canEditAnchorNote: false`).
- Substantial inline CSS in `note.html` (~190 lines) duplicates/overrides `style.css`.

---

## Unauthorized

### Purpose
Access denied when authenticated user lacks page role.

### Route
`/unauthorized.html`

### Source File
`unauthorized.html`, `js/core/page-boot.js`

### Current Status
**Active**

### Screenshot
Not captured (requires authenticated wrong-role session).

### Notes
Provides role home link + logout.

---

## Legacy Topic Note Editor (not student)

### Purpose
Old contenteditable topic notes — superseded by canonical `note.html`.

### Route
`/topic-note.html`

### Source File
`topic-note.html`, `js/topic-note.js`

### Current Status
**Deprecated** for student use (teacher workflow)

### Screenshot
N/A

### Notes
Still in repo; not linked from student dashboard.

---

## SECTION 4 — End-to-End Student Journey Audit

Simulated path on production deploy. Steps 1–2 and 8–10 require student login (blocked without credentials); steps 3–7 verified live on public/canonical exam.

| Step | Screenshot | Friction | Observations | UX concerns |
|------|------------|----------|--------------|-------------|
| **1. Login** | ![](audit-screenshots/01-login-desktop.png) | Password field width mismatch | Functional form, minimal branding | No onboarding; layout bug erodes trust |
| **2. Dashboard** | *(auth gate)* | Immediate redirect if logged out | 11 stacked cards with parallel loading states | Overwhelming scroll; no IA hierarchy |
| **3. Find assigned exam** | *(auth gate)* | Manual exam ID duplicates assigned list | Code loads `exam_assignments` → list | Students may not know UUID vs title |
| **4. Start exam** | ![](audit-screenshots/02-exam-instructions-desktop.png) | Must type name every time | Public link works without account | No exam metadata preview |
| **5. Complete exam** | ![](audit-screenshots/03-exam-active-desktop.png) | All 49 Q on one page | Timer visible; autosave on radio change | Severe cognitive load; no progress map |
| **6. Submit exam** | — | Single click, no confirm | Instant lock + disable radios | Accidental submit risk |
| **7. View results** | ![](audit-screenshots/04-exam-results-desktop.png) | Must find score at bottom after scroll | Shows raw fraction only | No celebration/encouragement; no topic insights |
| **8. View analytics** | *(auth gate)* | No dedicated analytics route | Intelligence cards on dashboard only | Student cannot explore mastery engine |
| **9. Open notes** | *(auth gate)* | Notes embedded in dashboard list | Canonical reader is rich | Discovery buried below fold |
| **10. Return to dashboard** | — | Exam home link if logged in only | Public takers have no home CTA | Dead end for anonymous users |

---

## SECTION 5 — Dashboard Audit

### Layout & hierarchy
Single-column card stack inside `.container`. Primary actions (Start Exam, Start Practice) use full-width `.primary-btn`. Intelligence sections appear **below** notes and practice — intelligence is not prioritized visually despite product vision.

### Information density
**High vertical density, low structural density.** Many sections show simultaneous “Loading…” states on first paint, then populate asynchronously — causes layout shift.

### Discoverability
- Topic notes and intelligence require scrolling.
- No search, no “continue where you left off,” no pinned current exam.
- Practice nav link exists globally; notes do not.

### CTA placement
Exam CTAs appear **twice** (manual ID + list) at top — good for exams, but crowds out learning/work notes.

### Responsiveness

| Viewport | Observation |
|----------|-------------|
| Desktop | Wide margins; cards max-width constrained; lots of whitespace |
| Tablet | Same stack; nav wraps per `@media` in `.prepos-app-nav-inner` |
| Mobile ~390px | Cards remain full-width; usable but long scroll |

### Screenshots
- Desktop authenticated: not captured (auth).
- Mobile: login redirect gate — see login mobile screenshot for auth entry pattern.

---

## SECTION 6 — Exam Experience Audit

### Exam discovery
Assigned exams rendered in `#availableExams` with title, date, Start button (`student-dashboard-renderer.js`). Parallel manual UUID field undermines assigned workflow.

### Instructions page
**Not implemented.** Only name entry + implicit load. No rules, duration, question count, or integrity statement.

### Question navigation
**None.** All questions rendered at once in `#examContent`. No palette, next/prev, or section jumps.

### Timer visibility
`.timer-box` in header — visible and updates every tick. Good. No warning state near expiry (only auto-submit alert).

### Answer selection
Standard radio `.option-row` — clear. Selected state persists via localStorage attempt state.

### Submission flow
One “Submit” button appended after all questions. **No confirmation.** On failure: `alert("Submission failed…")`.

### Confirmation flow
**Missing.**

### Screenshots
Included in Section 3 and 4.

### Issues identified

| Category | Finding |
|----------|---------|
| Unnecessary clicks | Scrolling 49 screens vs paged flow |
| Confusion | “Loading exam…” + rendered content coexist |
| Cognitive overload | Full exam single page; no focus mode |
| Production debug | Eruda mobile/desktop overlay |
| Mobile | Content column narrow left-aligned with empty right margin |

---

## SECTION 7 — Results Experience Audit

### Score presentation
Plain heading: `Audit Student, your score: 5/49` — no percent, grade, class average, or time.

### Feedback quality
Per-question ✔/✘ badges in review. Explanations hidden behind “Show Explanation” per question — good for pacing, easy to miss.

### Answer review
Strong color coding: `.option-correct`, `.option-wrong`, `.option-selected`. Question text repeated in review cards.

### Clarity of mistakes
Student can see correct option highlighted. No topic tag on review cards despite questions having `topics[]` in schema.

### Learning value
**Limited.** No links to practice weak topics or open related notes from wrong answers. Analytics pipeline runs (`PREPOS_ANALYTICS_ENABLED = true`) but results UI does not surface topic mastery impact.

### Screenshot
![](audit-screenshots/04c-exam-review-answers-desktop.png)

---

## SECTION 8 — Student Analytics Audit

### Current experience
There is **no standalone student analytics screen.** Analytics appear as dashboard cards:

| Screen region | Source | Purpose |
|---------------|--------|---------|
| Learning Snapshot | `student-dashboard-renderer.js` + `student-selectors.js` | Topics mastered, weak count, confidence label |
| Confidence State | same | Low/med/high banner |
| Weak Topics | same | Mastery % + practice CTA |
| Strong Topics | same | Positive reinforcement |
| Recommended Revision | same | Suggested topic + practice CTA |
| Recent Attempts | same | Exam UUID + score + date |

Backend: `js/student/student-intelligence.js` → `knowledge-analytics.js`, `exam_attempts`, localStorage cache `prepos_knowledge_analytics`.

### Does the student feel the intelligence layer?
**No.** The UI reads as static stat cards. No charts (contrast teacher dashboard), no inspectable mastery timeline, no “because you missed X” reasoning, no confidence provenance.

### Missing insights
- Topic-level exam breakdown after attempt
- Progress over time / streaks
- Link between note reading and mastery
- Confidence explanation beyond one sentence
- Comparison to class (even anonymized)

### Weak feedback loops
Practice CTAs deep-link to bank mode but don’t close loop back to updated mastery on practice completion.

### Missed learning opportunities
Exam review doesn’t feed into notes/anchors/practice recommendations inline.

### Screenshot
Auth required — not captured. Empty state copy: *“Complete more verified practice to unlock learning intelligence insights.”*

---

## SECTION 9 — Notes & Knowledge Workspace Audit

### Note reader
**Implemented** for students via `note.html` + `note-reader.js`. Published-only variants (`fetchNotesForHome` filters `status=published`).

### MAP rendering
**Implemented.** Tabs: Narrative, Structural, Revision, Timeline, Interpretations — rendered by `note-renderer.js` when blocks exist.

### Semantic rendering
**Implemented.** Headings, chronology nodes, escalation groups, semantic anchors via `anchor-renderer.js` + `semantic-hierarchy.js`.

### Anchor interactions
**Partially implemented for students.** Interactive anchors open read-only inspector; governance/editing disabled (`anchor-student-reader.js`).

### Overlays
Anchor inspector uses shared `teacher-inspector.js` modal chrome with subtitle *“Classroom intelligence drill-down (preview)”* — **wrong mental model for students.**

### Topic navigation
Topic links in prose via `note-topic-links.js`; backlinks panel via `note-backlinks.js`. Language tabs for variants.

### Screenshots
Auth required — not captured live.

### Capability matrix

| Capability | Status |
|------------|--------|
| Multi-representation MAP tabs | Implemented |
| Structural collapse toggles | Implemented |
| Revision/recall blocks | Implemented (parity logging in console) |
| Semantic anchors (published) | Implemented |
| Anchor → canonical note navigation | Implemented in inspector |
| Student anchor note editing | Not implemented |
| Knowledge workspace (split pane, graph) | Not implemented |
| In-note practice/quiz | Not implemented |
| Reading progress / resume | Not implemented |
| Student-facing note search | Not implemented |

### Intended vs actual
Vision docs describe a **Knowledge Workspace** with cognition overlays and topic-first navigation. Actual delivery is a **paginated reader** with tabs and modal anchor previews — strong content renderer, weak workspace orchestration.

---

## SECTION 10 — Anchor System Audit

### Anchor rendering
`.semantic-anchor`, `.existing-anchor`, primary/repeat opacity classes in `style.css`. Student map filters to `existing` + `canonical` visual states only.

### Anchor inspector
Opens via `openAnchorInspector()` — student mode hides governance actions, shows anchor note body + link to canonical topic note.

### Canonical navigation
“Open canonical note” button when `canonical_topic_id` resolves.

### Repeated anchor handling
`semantic-anchor--repeat` opacity + occurrence tracker in `reading-ergonomics.js`.

### Overlay behavior
Modal via `modal-system.js`; reading context captured/restored (`reading-ergonomics.js`).

### Screenshot
Not captured (requires authenticated note session).

### Gaps vs PrepOS semantic cognition vision

| Vision | Current student reality |
|--------|-------------------------|
| Living semantic graph | Linear reader + modal |
| Cognition layer felt continuously | Ephemeral modal; no persistent anchor panel |
| Topic-first OS navigation | Topic links exit to another full page load |
| Cross-note anchor journey map | Backlinks panel only |
| Student-safe cognition without teacher chrome | Teacher inspector copy/layout reused |

---

## SECTION 11 — Mobile Experience Audit

Captured at **390×844** viewport (2× DPR).

| Area | Screenshot | Issues |
|------|------------|--------|
| Login | ![](audit-screenshots/01-login-mobile-390.png) | Card top-aligned with huge empty space; password width bug |
| Exam active | ![](audit-screenshots/03-exam-active-mobile-390.png) | ~390px column left-aligned; ~50% empty viewport |
| Dashboard | Auth gate | Expected card stack OK; nav wraps |
| Results | Not captured at mobile | Long scroll penalty worse on mobile |
| Notes | Auth gate | Inline CSS has `@media (max-width: 640px)` rules in `note.html` |
| Analytics | Auth gate | Stat grids use `auto-fit` — acceptable |

### Touch targets
`.primary-btn`, `.option-row`, `.practice-mode-card` — generally adequate height. Exam submit button small text button at bottom of long scroll — easy to miss.

### Scrolling problems
Exam and review modes are **extreme scroll** applications on mobile.

---

## SECTION 12 — UI Component Inventory

### Navigation Components

| Component | CSS class | Source | Usage |
|-----------|-----------|--------|-------|
| App nav shell | `.prepos-app-nav`, `.prepos-app-nav-inner` | `css/style.css`, `js/ui/app-nav.js` | Dashboard, practice, notes |
| Nav links | `.prepos-app-nav-link`, `.is-active` | same | Practice preset |
| Back button | `.prepos-app-nav-back` | same | Note reader |
| Exam home | `.exam-home-btn` | `exam.html`, `exam.js` | Exam (when authed) |

### Cards

| Component | CSS class | Source | Usage |
|-----------|-----------|--------|-------|
| Dashboard card | `.card` | `style.css` | All dashboard sections |
| Question card | `.question-card` | `style.css` | Exam, practice |
| Intel card | `.student-intel-card` | `style.css` | Weak/strong/recommendations |
| Practice mode card | `.practice-mode-card` | `style.css` | Practice mode picker |
| Review card | `.review-card` | `style.css` | Exam review |
| Recent item | `.recent-item` | `style.css` | Exams, attempts, notes list |

### Buttons

| Component | CSS class | Source | Usage |
|-----------|-----------|--------|-------|
| Primary | `.primary-btn` | `style.css` | CTAs globally |
| Secondary | `.secondary-btn` | `style.css` | Nav, explain toggles |
| Danger | `.danger-btn` | `style.css` | Not student-facing |
| Option (practice) | `.option-btn` | `style.css` | Practice answers |
| Explain | `.explain-btn` | `style.css` | Exam review |

### Forms

| Component | CSS class | Source | Usage |
|-----------|-----------|--------|-------|
| Text inputs | `input`, `.w-full` | `style.css` | Login, exam name, exam ID |
| Selects | `select` in `.control-bar` | `style.css` | Practice controls |
| Toggle row | `.toggle-row` | `style.css` | Adaptive mode |
| Radio options | `.option-row` | `style.css` | Exam MCQ |

### Modals

| Component | CSS class | Source | Usage |
|-----------|-----------|--------|-------|
| Modal shell | `.prepos-modal`, `.prepos-modal-content` | `style.css`, `modal-system.js` | Anchor inspector |
| Cognition inspector | `.semantic-cognition-inspector` | `style.css` | Student anchor read |
| Teacher inspector | `.teacher-intel-inspector-content` | `teacher-inspector.js` | Shared overlay |

### Overlays

| Component | CSS class | Source | Usage |
|-----------|-----------|--------|-------|
| Side panels | `.prepos-side-panel-right` | `style.css` | Teacher-heavy |
| Modal backdrop | `.prepos-modal-backdrop` | `style.css` | Inspector |

### Chips / Tags

| Component | CSS class | Source | Usage |
|-----------|-----------|--------|-------|
| Difficulty badge | `.difficulty-badge` | `style.css` | Not student UI |
| Teacher intel flag | `.teacher-intel-flag` | `style.css` | Inspector tags |
| Topic note status | `.topic-note-status` | `style.css` | Hidden for students |

### Tables
No student-facing data tables.

### Analytics Components

| Component | CSS class | Source | Usage |
|-----------|-----------|--------|-------|
| Intel grid | `.student-intel-grid` | `style.css` | Snapshot stats |
| Stat tile | `.student-intel-stat` | `style.css` | Mastered/weak/confidence |
| Confidence banner | `.student-intel-confidence--{level}` | `style.css` | Confidence state |
| Empty state | `.student-intel-empty` | `style.css` | No data messages |

### Notes Components

| Component | CSS class | Source | Usage |
|-----------|-----------|--------|-------|
| Representation tab | `.canonical-tab` | `note.html`, `style.css` | MAP tabs |
| Language tab | `.language-tab` | `note.html` | Variants |
| Semantic heading | `.semantic-heading` | `style.css` | Note body |
| Structural group | `.structural-group`, `.structural-toggle` | `style.css` | Structural MAP |
| Semantic anchor | `.semantic-anchor` | `style.css` | Inline entities |
| Referenced-in | `.referenced-in` | `note.html` | Backlinks |
| Topic link | `.topic-link` | `note.html` | Cross-topic |

---

## SECTION 13 — CSS Architecture Audit

### File structure
**Single monolith:** `css/style.css` (~2,997 lines, ~50 KB). No component-scoped CSS files, no build pipeline.

### Component CSS
Large sections commented by feature (DESIGN SYSTEM, EXAM, STUDENT LEARNING INTELLIGENCE, SEMANTIC ANCHORS, TEACHER INTELLIGENCE, MODALS). Student and teacher styles interleaved.

### Utility CSS
Ad-hoc utilities: `.mt-10`, `.mt-20`, `.mt-30`, `.w-full`, `.hidden`, `.flex`, `.gap-10`, `.text-muted` — not a systematic utility framework.

### Duplicated styles
- `note.html` inline `<style>` duplicates canonical tabs, topic links, draft toolbar rules also partially in `style.css`.
- Student intel vs teacher intel stat cards mirror each other with different class prefixes.

### Inline styles
Present in `exam.js` (PDF button), `note-renderer.js` (structural depth), `note.html` (extensive), `exam.html` (noscript).

### Unused / drift risks
Teacher-only blocks dominate file size; student pages load entire CSS bundle. `.exam-header` reused across exam, practice (hidden), notes — semantic overload.

### Consistency problems
Login password width; exam page uses different header layout than dashboard cards; inspector uses teacher classnames for student cognition.

### Scalability risks
Adding student features increases monolith further; no CSS modules or tokens beyond `:root` variables.

---

## SECTION 14 — Frontend Architecture Audit

### Active file tree (student-relevant, excluding deprecated/archived)

```
/student                          → NOT PRESENT (student code lives in js/student/)
/pages                            → NOT PRESENT

js/student/
├── student-dashboard-renderer.js   # DOM rendering
├── student-intelligence.js         # Data aggregation
└── student-selectors.js            # Pedagogical view models

js/notes/                           # Shared reader + MAP engine (17 files)
├── note-reader.js                  # Student/teacher boot
├── note-renderer.js
├── note-home.js                    # Dashboard notes section
├── map-parser.js
├── semantic-hierarchy.js
├── reading-ergonomics.js
└── …

js/analytics/                       # 25 files — mostly backend-ish; student UI consumes outputs indirectly
├── knowledge-analytics.js
├── analytics-submission.js
├── mastery-inspector.js
└── …

js/anchors/                         # Semantic anchor system
├── anchor-student-reader.js
├── anchor-renderer.js
└── …

css/
└── style.css                       # Global monolith

Student HTML pages:
├── login.html
├── student-dashboard.html
├── practice.html
├── exam.html
├── note.html
└── unauthorized.html
```

Excluded: `topic-note.html`, `topics.html`, teacher/admin HTML, `admin/analytics-debug.html`.

### Architectural patterns

1. **Multi-page app (MPA)** with ES modules — no SPA router.
2. **`bootPage()` orchestration** (`js/core/page-boot.js`) for auth, nav, link routing.
3. **Renderer/selectors/intelligence triad** for dashboard (clean separation on paper).
4. **Supabase client** singleton via `js/config.js` + `get-client.js`.
5. **Feature flags** (`analytics-config.js`) for analytics hooks.
6. **Shared teacher UI** (inspector, modals) reused for student cognition — architectural coupling.

---

## SECTION 15 — Performance Audit

### Method
Production URL fetch + live exam interaction; full JS bundle analysis not run (no build step).

### Observations

| Page | HTML | Heavy deps | Notes |
|------|------|------------|-------|
| Dashboard | Small static HTML | `student-intelligence.js` chain, Supabase, multiple async fetches | 7+ parallel section loads |
| Exam | Small HTML | **html2pdf**, **Eruda**, Supabase, `exam.js` | Heaviest student page |
| Practice | Small HTML | `generator-core.js`, generators | Generator latency dominates |
| Notes | Small HTML + inline CSS | `note-reader.js`, renderer, anchors | Large DOM on long notes |
| Analytics | N/A standalone | Analytics modules load on submission hook | Invisible to student |

### CSS
~50 KB single file — parsed on every page.

### Render bottlenecks
- Exam renders **all question cards synchronously** — 49 cards = large DOM.
- Note MAP renders full representation on tab switch.
- Dashboard layout shift as each section resolves.

### Slow pages (student-perceived)
1. **Exam first paint** with Eruda + html2pdf scripts
2. **Long exam scroll** interaction jank on low-end mobile
3. **Dashboard** waiting for intelligence fetches

### Largest JS bundles (logical, not minified)
`js/draft.js`, `js/qb-manager.js` not student-facing. Student-critical: `exam.js` (~1000 lines), `note-renderer.js` (~870 lines), analytics cluster loaded indirectly.

---

## SECTION 16 — Known UX Issues

Repository search found **zero `TODO` / `FIXME` / `HACK` comments** in JS/HTML/CSS. UX issues below come from **live audit + code evidence**, grouped by severity.

### Critical

| Issue | Evidence |
|-------|----------|
| Eruda debug console on student exam page | `exam.html` loads `eruda.init()` |
| No submit confirmation | `exam.js` `submitExam()` immediate |
| Exam items publicly readable via UUID | Supabase policy `exam_sessions_select_public_take` — design intent but UX/security tradeoff for student data |

### High

| Issue | Evidence |
|-------|----------|
| All exam questions on one page | `renderQuiz()` maps entire array |
| Authenticated dashboard inaccessible without teacher-issued credentials | Observed redirect |
| Intelligence empty states without guided onboarding | `student-selectors.js` messages only |
| Teacher inspector copy on student anchor modal | `teacher-inspector.js` subtitle |
| Recent attempts not clickable | `renderRecentAttempts()` HTML only |
| Login password field layout bug | Live screenshot |
| `alert()` for exam errors | Multiple in `exam.js` |

### Medium

| Issue | Evidence |
|-------|----------|
| “Loading exam…” stale text | `exam.html` + `showExam()` doesn’t hide loading node |
| Duplicate exam entry (ID + list) | `student-dashboard.html` |
| Manual name entry each exam | localStorage name not pre-filled in UI |
| No exam instructions | Missing pre-start screen |
| Practice doesn’t surface mastery updates | `finishSession()` summary only |
| Global nav missing Notes/Exams/Home sections | `NAV_PRESETS.studentHome` |
| Inline styles architecture drift | `note.html`, `exam.js` |

### Low

| Issue | Evidence |
|-------|----------|
| `console.log("SCRIPT STARTED")` in exam | `exam.js` line 10 |
| README: “Prototype version” | Sets expectation mismatch |
| `topics.html` orphan redirect | Confusing if linked |
| PDF button hidden until review | Discoverability |

---

## SECTION 17 — Vision Alignment Audit

### Topic-First Architecture
**Alignment score: 4/10**

Observations: Topics appear in intelligence cards and note URLs, but student IA is **exam/practice-first**. Dashboard is not organized by topic graph.

Recommended actions: Topic-centric home with “Your topics” as primary column; embed exams/practice per topic.

### Knowledge Workspace Vision
**Alignment score: 3/10**

Observations: Reader exists; workspace affordances (panels, persistence, multitasking) do not.

Recommended actions: Split-pane reader + practice; resume reading; topic sidebar.

### MAP-Based Learning
**Alignment score: 7/10**

Observations: Full MAP tab rendering implemented in `note-renderer.js` — strongest vision match.

Recommended actions: Surface MAP tabs from exam results (“Revise this topic in Structural view”).

### Semantic Anchor System
**Alignment score: 6/10**

Observations: Anchors render and open inspector with canonical links; student cognition UI inherits teacher modal.

Recommended actions: Student-native cognition panel; anchor trail across session.

### Student Intelligence Vision
**Alignment score: 4/10**

Observations: Data pipeline exists; UI is stat cards without inspectable intelligence.

Recommended actions: Mastery timeline, confidence provenance, post-exam topic breakdown screen.

### Analytics Vision
**Alignment score: 3/10**

Observations: Rich analytics modules power teacher views; students get text summaries only.

Recommended actions: Port scoped visualizations from teacher intelligence to student-safe views.

---

## SECTION 18 — Student Experience Scorecard

| Area | Grade | Rationale |
|------|-------|-----------|
| Navigation | **D+** | Minimal nav; long dashboard scroll; dead-end attempts |
| Learning Flow | **C-** | Notes/practice/intelligence exist but siloed |
| Exam Flow | **C** | Functional MCQ + timer + review; overload + debug UI |
| Results Experience | **C+** | Clear review colors; weak summary analytics |
| Analytics Experience | **D** | Cards only; intelligence layer not felt |
| Notes Experience | **B-** | Strong MAP reader; weak workspace integration |
| Mobile Experience | **D+** | Narrow exam column; extreme scroll |
| Accessibility | **C-** | Some ARIA on tabs; alert dialogs; contrast OK |
| Visual Consistency | **C** | Shared design tokens; login bug + teacher chrome bleed |
| Performance | **C-** | Exam DOM scale + heavy scripts |

**Overall: C-**

---

## SECTION 19 — Priority Improvement Roadmap

### Immediate Wins (1–3 days)

| Problem | Proposed Solution | Impact | Complexity |
|---------|-------------------|--------|------------|
| Eruda on exam | Remove debug script from `exam.html` | Trust, perf | Low |
| Submit accidents | Confirm modal via `modal-system.js` | High-stakes safety | Low |
| Login layout bug | `.card input { width: 100% }` | Visual polish | Low |
| Stale loading text | Hide `#loadingState` in `showExam()` | Clarity | Low |
| Nav discoverability | Add Notes + Dashboard links to `studentHome` preset | Navigation | Low |

### MVP Improvements (1–3 weeks)

| Problem | Proposed Solution | Impact | Complexity |
|---------|-------------------|--------|------------|
| Exam cognitive overload | Paged exam UI + question palette | Exam UX | Medium |
| Intelligence invisible | Post-exam topic breakdown + “Practice weak topics” panel | Learning loop | Medium |
| Dashboard scroll fatigue | Tabbed IA: Learn / Exams / Progress | Navigation | Medium |
| Recent attempts dead end | Link to review or score detail | Continuity | Medium |
| Student anchor inspector | Student-specific modal copy/layout | Cognition vision | Medium |
| Results summary | Show %, time taken, topic tags | Results value | Low–Med |

### Strategic Redesigns (1–3 months)

| Problem | Proposed Solution | Impact | Complexity |
|---------|-------------------|--------|------------|
| Not a Knowledge OS | Topic-first shell with persistent topic sidebar + workspace | Vision alignment | High |
| Siloed modules | Unified progress graph connecting notes ↔ practice ↔ exams | Learning flow | High |
| CSS monolith | Tokenized component CSS + student bundle split | Maintainability | High |
| Analytics parity | Student mastery timeline UI consuming existing analytics engines | Intelligence vision | High |
| Mobile exam | Responsive exam shell; sticky timer + palette drawer | Mobile grade | High |

---

## SECTION 20 — Final Verdict

### 1. What currently works well?
Exam taking end-to-end on real content (timer, autosave, submission, review with explanations) is **reliable**. The canonical note reader with MAP representations and semantic anchors is **ahead of the rest of the student UI** in sophistication. Dashboard aggregation logic cleanly separates intelligence from rendering.

### 2. What most hurts student learning?
**Cognitive overload in exams** and **disconnected feedback loops** — students finish a 49-question scroll marathon, see a fraction score, and receive no guided path from wrong answers to notes or targeted practice. Intelligence cards don’t teach; they label.

### 3. What should be redesigned first?
**Student home + exam results loop** as one coherent “learning session” story: topic-first progress, paged exams, post-exam topic breakdown, one-click remediation.

### 4. What is preventing PrepOS from feeling like a Knowledge Operating System?
The student UI is a **collection of pages** (dashboard stack, exam silo, note reader modal) rather than an **orchestrated workspace**. Intelligence runs backend-side but is not inspectable, visual, or woven into reading and exam moments. Teacher UI patterns (inspector, alerts, debug tools) leak into student flows.

### 5. If rebuilding the student experience today, what would be the first three priorities?

1. **Topic-first home** — organize everything around mastered/weak topics, not feature cards.  
2. **Exam + results v2** — paged exam UX, submit confirmation, topic-aware results with links to notes/practice.  
3. **Visible intelligence** — student mastery timeline and recommendation drill-down powered by existing analytics modules.

---

## Appendix A — Audit Evidence & Limitations

| Item | Detail |
|------|--------|
| Deploy URL | `https://prabel-94.github.io/prepOS-basic/` |
| Live exam tested | `exam.html?id=c8018c9c-4670-4d34-be98-b42c7756bd46` (49 questions) |
| Published notes in DB | English Revolution — English + Malayalam variants |
| Authenticated screenshots | Not captured — student credentials not available in audit session; auth-gated pages documented via redirect behavior + source |
| Screenshot folder | `audit-screenshots/` (relative paths embedded above) |

---

## Appendix B — Key Source References

| Area | Files |
|------|-------|
| Student boot | `js/student-dashboard.js`, `js/core/page-boot.js`, `js/core/runtime.js` |
| Navigation | `js/ui/app-nav.js`, `js/core/access.js` |
| Exam | `js/exam.js`, `exam.html` |
| Practice | `js/practice.js`, `practice.html` |
| Intelligence | `js/student/student-intelligence.js`, `js/student/student-selectors.js` |
| Notes | `js/notes/note-reader.js`, `js/notes/note-renderer.js` |
| Anchors | `js/anchors/anchor-student-reader.js`, `js/ui/teacher-inspector.js` |
| Styles | `css/style.css` |

---

*End of report.*
