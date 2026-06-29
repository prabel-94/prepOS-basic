# PrepOS — Published Semantic Click Authority Audit

**Type:** Architecture + interaction authority audit (diagnostic only)  
**Constraint:** No fixes implemented in this phase.

---

## Summary (what’s happening today)

Published `[[...]]` click behavior is currently **split by runtime role**:

- **Student published reader**: `[[...]]` becomes **semantic anchor buttons** → click opens **Anchor Inspector** (cognition layer).  
- **Teacher/Admin published reader**: `[[...]]` becomes **legacy `<a href="note.html?topic=...">` links** → click navigates directly to canonical note page.

This means PrepOS currently has **two coexisting semantic interaction systems** in published mode:

1. **Legacy topic hyperlink ontology** (`resolveTopicLinks()` → `<a href=...>`)  
2. **Semantic cognition anchor ontology** (`semanticMap` + `renderSemanticAnchors()` + click binder → inspector)

The observed symptom (“published semantic anchors still behave like legacy topic hyperlinks”) is explained by the fact that **teachers are still on the legacy published rendering path**.

---

## A. Full published semantic click flow diagram

```mermaid
flowchart TD
  R[note.html published mode] --> NR[bootPublishedReader() in note-reader.js]
  NR --> RO{isStudent?}

  RO -->|Yes| S1[preparePublishedStudentSemanticMap()]
  S1 --> S2[renderOptions = buildStudentSemanticRenderOptions()]
  S2 --> RT1[renderRepresentationTab() → note-renderer.js]
  RT1 --> RI1[resolveInlineSemantics()]
  RI1 --> SA1[renderSemanticAnchors(studentMode=true)]
  SA1 --> DOM1[.semantic-anchor buttons]
  DOM1 --> BIND1[bindStudentSemanticReading()]
  BIND1 --> CLICK1[event delegation → preventDefault]
  CLICK1 --> INS1[openAnchorInspector(studentMode=true)]
  INS1 --> NOTE1[render anchor note]
  NOTE1 --> OPT1[optional: Open canonical note button]

  RO -->|No (teacher/admin)| T1[renderOptions = { preferLanguage }]
  T1 --> RT2[renderRepresentationTab() → note-renderer.js]
  RT2 --> RI2[resolveInlineSemantics()]
  RI2 --> TL[resolveTopicLinks()]
  TL --> DOM2[<a href=\"note.html?topic=...\">]
  DOM2 --> NAV2[browser navigation to canonical note page]
```

---

## B. Active rendering pathways (published + draft)

### 1) Published — Student semantic cognition path (new)

- **Render decision point**: `note-renderer.js` `resolveInlineSemantics()` selects semantic rendering when:
  - `renderOptions.studentSemanticMode === true` AND
  - `renderOptions.semanticMap` exists
- **Inline node type**: `renderSemanticAnchors()` emits `.semantic-anchor` **buttons/spans** (not `<a href>`).
- **Click authority**: `bindStudentSemanticReading()` owns the click and opens the inspector.

### 2) Published — Teacher/Admin legacy topic-link path (old)

- **Render decision point**: `note-renderer.js` `resolveInlineSemantics()` falls back to:
  - `resolveTopicLinks(text, topicMap, ...)`
- **Inline node type**: `resolveTopicLinks()` emits `<a href="note.html?topic=...">`.
- **Click authority**: browser default navigation (no inspector mediation).

### 3) Draft preview — teacher semantic governance path (separate)

- Draft preview uses `renderOptions.semanticPreview + semanticMap` and binds clicks via `bindSemanticPreviewInteractions()` (inspector governance mode).

---

## C. Exact files/functions still enforcing legacy hyperlink ontology

### Legacy hyperlink generator (authoritative for teacher published)

- `js/notes/note-topic-links.js`
  - `resolveTopicLinks()` returns `<a href="note.html?topic=...">`

### Published render fallback that triggers legacy hyperlinks

- `js/notes/note-renderer.js`
  - `resolveInlineSemantics()`:
    - Uses semantic anchors only in studentSemanticMode or semanticPreview mode.
    - Otherwise returns `resolveTopicLinks(...)`.

### Published teacher/admin reader path that does NOT enable studentSemanticMode

- `js/notes/note-reader.js`
  - `bootPublishedReader()` sets:
    - `renderOptions = { preferLanguage }` for non-students
    - which triggers `resolveTopicLinks` fallback in renderer.

---

## D. Is semantic rendering authoritative or additive?

**Current state: additive.**

Semantic cognition rendering is **authoritative only inside certain modes**:

- Draft semantic preview (teacher governance)
- Published student reader (studentSemanticMode)

But the legacy hyperlink system remains the **default** for published teacher/admin reading.

So the system is not yet a “single semantic interaction authority.” It is a **role-gated overlay** on top of an older hyperlink ontology.

---

## E. Canonical-anchor behavior in published student mode

In published student mode, the semantic map is built from `note_anchor_links` (active only) and normalized to:

- `state: "existing"` for both canonical and existing anchors (no visual distinction)
- click → inspector (semantic gateway)
- canonical note open only via inspector button

In published teacher/admin mode, canonical/existing is irrelevant because links are `<a href>` generated from `note_topic_links` traversal map.

---

## F. Minimal architectural correction proposal (NO implementation)

### Desired authority model (final philosophy)

**All published `[[...]]` tokens should resolve as semantic cognition anchors first:**

`[[Term]]` → Anchor Inspector → (optional) Open Canonical Note

### Minimal authority transition (conceptual)

1. **Published mode should select semantic rendering when a semantic map exists**, regardless of role.
2. **Legacy `resolveTopicLinks()` should become a fallback**, only when:
   - no semantic map is available, OR
   - the token resolves to a topic but not an anchor (explicit compatibility behavior).
3. Click ownership should be unified to one binder per published surface:
   - `.semantic-anchor` click → inspector always
   - `.topic-link` should not be generated for `[[...]]` in published cognition surfaces

### What should become authoritative vs fallback

- **Authoritative**: `semanticMap` + `renderSemanticAnchors()` + inspector click binder  
- **Fallback only**: `resolveTopicLinks()` for non-semantic contexts (or explicit legacy mode)

---

## Appendix: Key decision points (by file)

### `js/notes/note-reader.js`

- Authority fork is determined by `isStudent`.
- Student path builds semantic map from `note_anchor_links` and enables studentSemanticMode.
- Non-student published path uses preferLanguage only (no semantic mode).

### `js/notes/note-renderer.js`

`resolveInlineSemantics()` order:

1. studentSemanticMode + semanticMap → semantic anchors  
2. semanticPreview + semanticMap → semantic anchors  
3. else → `resolveTopicLinks()` (legacy hyperlinks)

### `js/notes/note-topic-links.js`

`resolveTopicLinks()` renders `<a href="note.html?topic=...">` and hands click authority to browser navigation.

