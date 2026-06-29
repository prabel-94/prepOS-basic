# SectionDefinition Schema & Parser Changes — Phase 2 Design Sketch

**Status:** Design (pre–Phase 1 implementation)  
**Purpose:** Define how custom (non-MSMDF) note sections will work, so Phase 1 (“+ Add section” modal) is built on the right abstractions.  
**Audience:** Implementation of `note-section-markdown.js`, `note-section-modal.js`, and later parser/registry extensions.

---

## 1. Goals

| Goal | Detail |
|------|--------|
| **Custom sections** | Teachers define section types not in MSMDF (e.g. Case Studies, Diagrams, Exam Tips). |
| **MSMDF stability** | Imported MSMDF files and canonical tags remain first-class; no breaking changes to v1.2 imports. |
| **Single source blob** | Custom sections still live in `note_sources.raw_markdown` as bracket boundaries — no parallel body storage. |
| **Phase 1 alignment** | Phase 1 uses the same `SectionDefinition` type and catalog functions; builtins only until Phase 2 DB/UI ships. |

### Non-goals (Phase 2)

- Per-section WYSIWYG or block-level JSON editors
- Org-wide section template library (possible Phase 3)
- Changing MSMDF spec or external import format

---

## 2. Core type: `SectionDefinition`

Phase 1 and Phase 2 share this shape. All section picker, append, parse, tab, and render logic consults **definitions**, not raw `REPRESENTATION_REGISTRY` rows.

```javascript
/**
 * Unified description of a note section type (builtin MSMDF or custom extension).
 *
 * @typedef {"builtin" | "custom"} SectionSource
 *
 * @typedef {"infrastructure" | "cognition" | "cognition-merged"} SectionRole
 *
 * @typedef {
 *   | "generic"      // default prose blocks (same as narrative)
 *   | "narrative"
 *   | "structural"   // tree collapse
 *   | "timeline"     // chronology line parser
 *   | "quotes"       // quote-highlight rules
 *   | "revision"     // compact revision styling
 *   | "interpretations"
 * } RendererProfile
 *
 * @typedef {object} SectionDefinition
 * @property {string} id
 *   Stable internal key used as representation_type in note_blocks
 *   (e.g. "narrative", "case_studies"). Lowercase snake_case.
 * @property {string} boundaryTag
 *   Tag inside brackets in raw markdown, WITHOUT brackets
 *   (e.g. "NARRATIVE", "CASE_STUDIES"). Uppercase convention.
 * @property {string} label
 *   Human tab / picker label (e.g. "Case Studies").
 * @property {SectionSource} source
 * @property {SectionRole} role
 * @property {number} [tabOrder]
 *   Sort order in reader tabs and insert-order in source. Default 500+ for custom.
 * @property {boolean} [showTab]
 *   If true, eligible for reader tab when blocks exist. Default true for cognition.
 * @property {boolean} [persist]
 *   If true, blocks are written to note_blocks. Default true.
 * @property {RendererProfile} [rendererProfile]
 *   Which render pipeline to use. Default "generic".
 * @property {string} [mapsTo]
 *   Optional bucket merge (builtin only today: recall → revision).
 * @property {string} [readingClass]
 *   Optional CSS class override on representation wrapper.
 * @property {boolean} [recallTransform]
 *   Builtin-only: apply recall block_type metadata.
 * @property {string} [storageField]
 *   Builtin-only: "entity_index" for non-block storage.
 * @property {object} [metadata]
 *   Custom-only: created_at, created_by, description, etc.
 */
```

### Builtin vs custom mapping

| Field | Builtin (MSMDF) | Custom (extension) |
|-------|-----------------|---------------------|
| `source` | `"builtin"` | `"custom"` |
| `id` | From registry (`narrative`, …) | Teacher-chosen slug (`case_studies`) |
| `boundaryTag` | Registry `msmdfTag` | `EXT:` prefix recommended — see §4 |
| `rendererProfile` | Implicit per id | Explicit; default `"generic"` |
| Persistence of definition | `note-representations.js` | `note_variants.section_extensions` (§3) |

---

## 3. Persistence: where custom definitions live

### Recommended: `note_variants.section_extensions` (JSONB)

Custom section **types** are metadata about how to parse/render tabs; section **content** stays in markdown.

```sql
-- Phase 2 migration (sketch)
alter table public.note_variants
  add column if not exists section_extensions jsonb not null default '[]'::jsonb;

comment on column public.note_variants.section_extensions is
  'Array of SectionDefinition objects (source=custom) for this variant. Builtin MSMDF sections are not duplicated here.';
```

**Example row:**

```json
[
  {
    "id": "case_studies",
    "boundaryTag": "EXT:CASE_STUDIES",
    "label": "Case Studies",
    "source": "custom",
    "role": "cognition",
    "tabOrder": 520,
    "showTab": true,
    "persist": true,
    "rendererProfile": "generic",
    "metadata": {
      "created_by": "uuid",
      "created_at": "2026-06-11T12:00:00Z",
      "description": "Historical case studies for this topic"
    }
  }
]
```

### Why per-variant (not per-note or global)

| Scope | Pros | Cons |
|-------|------|------|
| **Per variant** ✓ | Matches language stream; draft can experiment; no cross-topic pollution | Repeat definition across topics |
| Per note | Shared EN/ML definitions | Variants may diverge in language |
| Global table | Reusable templates | Heavier product/RLS; Phase 3 |

Phase 3 can add `section_definition_templates` and copy into `section_extensions` on create.

### RLS

Same as `note_variants`: readable/writable via `can_read_variant` / `can_write_variant`. No separate policy needed if column stays on `note_variants`.

---

## 4. Tag namespace

Avoid collisions with future MSMDF tags and wiki-link syntax.

### Builtin tags (unchanged)

```
[NARRATIVE]  # [STRUCTURAL]  [RECALL]  …
```

### Custom tags (Phase 2)

**Recommended format:**

```
[EXT:<SLUG>]
```

- `EXT:` prefix marks extension namespace.
- `<SLUG>`: `[A-Z][A-Z0-9_]{1,48}` (uppercase, underscores).
- Internal `id` = lowercase slug (`CASE_STUDIES` → `case_studies`).

**Examples:**

```markdown
[EXT:CASE_STUDIES]

## 1857 Revolt
…

[EXT:EXAM_TIPS]

- Focus on cause-effect chains
```

### Parser matching order

1. Match line against **builtin** boundary pattern (existing MSMDF list).
2. Else match **extension** pattern: `^\s*#?\s*\[(EXT:[A-Z][A-Z0-9_]+)\]\s*$`
3. Else not a section boundary.

Builtin wins on collision (should not occur if `EXT:` reserved).

---

## 5. Section catalog API (new module)

**File:** `js/notes/note-section-catalog.js`

Single entry point for Phase 1 modal and Phase 2 parser/renderer.

```javascript
/**
 * @param {object} [context]
 * @param {import('./note-section-catalog.js').SectionDefinition[]} [context.customDefinitions]
 *   From note_variants.section_extensions (Phase 2).
 * @returns {readonly SectionDefinition[]}
 */
export function getBuiltinSectionDefinitions() {
  // Map REPRESENTATION_REGISTRY → SectionDefinition (source: builtin)
}

/**
 * Merged, de-duplicated catalog: builtins + custom.
 * Custom ids must not collide with builtin ids.
 */
export function resolveSectionCatalog(context = {}) {
  const builtins = getBuiltinSectionDefinitions();
  const custom = (context.customDefinitions ?? []).filter(d => d.source === 'custom');
  return mergeSectionCatalog(builtins, custom);
}

/** Sections eligible for "+ Add section" picker */
export function getAddableSectionDefinitions(context = {}) {
  return resolveSectionCatalog(context).filter(def =>
    def.persist &&
    !def.storageField &&
    def.role !== 'infrastructure' // optional: hide METADATA from picker
  );
}

/** Sections eligible for reader tabs */
export function getTabSectionDefinitions(context = {}) {
  return resolveSectionCatalog(context)
    .filter(def => def.showTab !== false && def.role === 'cognition')
    .sort((a, b) => (a.tabOrder ?? 999) - (b.tabOrder ?? 999));
}

export function getDefinitionById(id, context = {}) {
  return resolveSectionCatalog(context).find(d => d.id === id) ?? null;
}

export function getDefinitionByBoundaryTag(tag, context = {}) {
  const upper = String(tag ?? '').toUpperCase();
  return resolveSectionCatalog(context).find(d => d.boundaryTag === upper) ?? null;
}

export function mapDefinitionToRepresentationBucket(def) {
  if (!def?.persist || def.storageField) return null;
  return def.mapsTo ?? def.id;
}
```

### Phase 1 contract

Phase 1 implements:

- `getBuiltinSectionDefinitions()`
- `resolveSectionCatalog({ customDefinitions: [] })` — custom always empty
- `getAddableSectionDefinitions()`
- `formatSectionBoundary(def)` → `\n\n[${def.boundaryTag}]\n`
- `appendSection(markdown, definition, body, context)` — insert in `tabOrder`

Phase 1 **must not** import `REPRESENTATION_REGISTRY` directly in the modal.

---

## 6. Parser changes (`map-parser.js`)

### 6.1 New parse options

```javascript
/**
 * @param {string} rawMarkdown
 * @param {{
 *   language?: string,
 *   title?: string,
 *   sectionExtensions?: SectionDefinition[],  // Phase 2
 * }} [options]
 */
export function parseMapMarkdown(rawMarkdown, options = {}) {}
```

Build catalog once per parse:

```javascript
const catalog = resolveSectionCatalog({
  customDefinitions: options.sectionExtensions ?? [],
});
```

### 6.2 Boundary detection refactor

Replace single frozen regex with two-step matcher:

```javascript
function matchSectionLine(line, catalog) {
  // 1. Builtin pattern (unchanged behavior for MSMDF)
  const builtinTag = matchBuiltinSectionLine(line);
  if (builtinTag) {
    return getDefinitionByBoundaryTag(builtinTag, { customDefinitions: [] });
  }

  // 2. Extension pattern
  const extTag = matchExtensionSectionLine(line); // [EXT:FOO]
  if (extTag) {
    return getDefinitionByBoundaryTag(extTag, { customDefinitions: catalog.customOnly });
  }

  return null;
}
```

`splitSections(markdown, catalog)` returns:

```javascript
{
  sections: Array<{
    key: string,       // definition.id
    tag: string,       // definition.boundaryTag
    body: string,
    source: 'builtin' | 'custom',
  }>,
  prelude: string | null,
}
```

### 6.3 Representation buckets (dynamic)

Replace `createEmptyRepresentations()` fixed keys with:

```javascript
function createRepresentationBuckets(catalog) {
  const buckets = {};
  for (const def of catalog) {
    if (!def.persist || def.storageField) continue;
    const bucket = mapDefinitionToRepresentationBucket(def);
    if (!buckets[bucket]) buckets[bucket] = [];
  }
  return buckets;
}
```

Builtin buckets remain identical. Custom defs add new keys (e.g. `case_studies`).

### 6.4 Section loop (pseudocode)

```javascript
for (const section of sections) {
  const def = getDefinitionById(section.key, { customDefinitions });
  if (!def) {
    diagnostics.warnings.push(`Unknown section [${section.tag}] ignored.`);
    continue;
  }

  if (def.storageField === 'entity_index') { /* unchanged */ }
  if (def.role === 'infrastructure' && def.id === 'metadata') { /* unchanged */ }

  const bucket = mapDefinitionToRepresentationBucket(def);
  const blocks = extractBlocks(bucket, section.body, {
    msmdf_boundary: section.tag,
    section_source: def.source,
    renderer_profile: def.rendererProfile ?? 'generic',
  });

  if (def.recallTransform) applyRecallBlockTransform(blocks);
  representations[bucket].push(...blocks);
}
```

### 6.5 Unknown extension tags in markdown

If markdown contains `[EXT:FOO]` but `FOO` is not in `section_extensions`:

| Policy | Behavior |
|--------|----------|
| **Strict (recommended)** | Warning in diagnostics; section body treated as prelude or skipped |
| **Lenient** | Auto-register ephemeral definition with `rendererProfile: generic` on save |

Recommend **strict** until teacher saves definition via “Create custom section” UI.

### 6.6 Validation update

`validateParsed()` today requires at least one canonical block. Phase 2:

```javascript
const blockCount =
  Object.values(reps).reduce(...) +
  (parsed?.entity_index?.length ?? 0);

// Allow custom-only notes if any section has blocks
if (blockCount === 0) {
  throw new Error('No note sections detected. Add a section or paste MSMDF content.');
}
```

---

## 7. Storage & read path changes

### 7.1 `flattenBlocks()` (`note-storage.js`)

**Today:** iterates only `getPersistedRepresentationIds()` — **custom blocks would not persist**.

**Phase 2:**

```javascript
function flattenBlocks(parsed, catalog) {
  const rows = [];
  const buckets = new Set(
    catalog
      .filter(d => d.persist && !d.storageField)
      .map(d => mapDefinitionToRepresentationBucket(d))
  );

  for (const representationType of buckets) {
    const blocks = parsed?.representations?.[representationType] ?? [];
    // ... same row mapping ...
  }
  return rows;
}
```

Pass `section_extensions` from variant row into parse + flatten on save/regenerate.

### 7.2 `groupBlocksByRepresentation()` (`note-selectors.js`)

**Today:** drops blocks whose `representation_type` is not in `createEmptyRepresentations()`.

**Phase 2:**

```javascript
export function groupBlocksByRepresentation(blocks = [], catalog = null) {
  const resolvedCatalog = catalog ?? getBuiltinSectionDefinitions();
  const grouped = createRepresentationBuckets(resolveSectionCatalog({
    customDefinitions: resolvedCatalog.filter(d => d.source === 'custom'),
  }));

  for (const block of blocks) {
    const key = block.representation_type;
    if (!grouped[key]) grouped[key] = []; // dynamic bucket for orphan/custom
    grouped[key].push(block);
  }
  // sort each bucket...
  return grouped;
}
```

`loadVariantBundle()` must pass `variant.section_extensions` into grouping.

### 7.3 Persisting `section_extensions`

When teacher creates a custom section type in UI:

1. Append definition to `section_extensions` JSON.
2. Append `[EXT:TAG]\n{body}` to markdown.
3. On `regenerateVariantFromMarkdown`, UPDATE variant row with extensions + blocks.

---

## 8. Renderer changes (`note-renderer.js`)

### 8.1 Profile-based dispatch

```javascript
const PROFILE_RENDERERS = {
  generic: renderGeneric,       // NEW: clone of renderNarrative styling
  narrative: renderNarrative,
  structural: renderStructural,
  timeline: renderTimeline,
  revision: renderRevision,
  interpretations: renderInterpretations,
  quotes: renderQuotes,
};

function resolveRendererForDefinition(def) {
  const profile = def.rendererProfile ?? 'generic';
  return PROFILE_RENDERERS[profile] ?? renderGeneric;
}
```

### 8.2 Dynamic tabs

Replace `getAvailableTabs(representations)` builtin-only filter:

```javascript
export function getAvailableTabs(representations = {}, context = {}) {
  return getTabSectionDefinitions(context)
    .filter(def => {
      const bucket = mapDefinitionToRepresentationBucket(def);
      return (representations[bucket]?.length ?? 0) > 0;
    })
    .map(def => ({ key: mapDefinitionToRepresentationBucket(def), label: def.label }));
}
```

Tab `key` remains representation bucket id (so `case_studies` tab maps to `representations.case_studies`).

### 8.3 `renderRepresentationTab`

```javascript
export function renderRepresentationTab(key, representations, topicMap, renderOptions = {}, context = {}) {
  const def = getDefinitionById(key, context)
    ?? getDefinitionByRepresentationBucket(key, context);
  const renderer = def
    ? resolveRendererForDefinition(def)
    : RENDERERS[key]; // fallback for legacy bundles
  if (!renderer) return '';
  return renderer(representations[key] ?? [], topicMap, renderOptions);
}
```

---

## 9. Phase 2 UI: “Create custom section”

Extends Phase 1 modal with a second mode:

```
┌─────────────────────────────────────────┐
│  Add section                        ✕   │
├─────────────────────────────────────────┤
│  ( ) Standard section    ( ) Custom     │
│                                         │
│  [ Standard mode: dropdown of builtins ]│
│  [ Custom mode:                         ]│
│    Section name: [ Case Studies      ]  │
│    → Tag preview: [EXT:CASE_STUDIES]    │
│    Render as:    [ Generic prose   ▼ ]  │
│                                         │
│  Content:                               │
│  ┌─────────────────────────────────┐   │
│  │ …                               │   │
│  └─────────────────────────────────┘   │
│                                         │
│         [ Cancel ]  [ Add section ]     │
└─────────────────────────────────────────┘
```

**On save (custom):**

1. Slugify name → `id` + `boundaryTag`
2. Reject if collides with builtin or existing custom
3. Push to `section_extensions`
4. Append boundary + body to markdown
5. Regenerate variant (parse with new catalog)

---

## 10. Phase 1 → Phase 2 wiring checklist

| Component | Phase 1 | Phase 2 addition |
|-----------|---------|------------------|
| `note-section-catalog.js` | Builtins only | Load `section_extensions` from variant |
| `note-section-markdown.js` | `appendSection()` | `registerCustomSection()` |
| `note-section-modal.js` | Builtin picker | Custom mode + profile select |
| `map-parser.js` | No change | Extension regex + dynamic buckets |
| `note-storage.js` | Call catalog in append | Pass extensions to parse/flatten; persist JSON |
| `note-selectors.js` | No change | Pass extensions to `groupBlocksByRepresentation` |
| `note-renderer.js` | No change | Profile dispatch + dynamic tabs |
| `note-draft-editor.js` | `+` button, modal | Load/save extensions; pass context to preview |
| Supabase migration | — | `section_extensions jsonb` on `note_variants` |

---

## 11. Compatibility & import

| Scenario | Behavior |
|----------|----------|
| MSMDF file import | `section_extensions = []`; parser identical to today |
| Note with only builtins | No JSON column entries; zero overhead |
| Old client, new data with custom sections | Old client drops unknown blocks on read — deploy parser+reader together |
| Copy variant / draft revision | Copy `section_extensions` with variant row |
| Publish | Published variant carries extensions; students see custom tabs |

---

## 12. Example end-to-end

**Teacher creates custom “Exam Tips” section:**

1. `section_extensions` gains:
   ```json
   { "id": "exam_tips", "boundaryTag": "EXT:EXAM_TIPS", "label": "Exam Tips",
     "source": "custom", "role": "cognition", "tabOrder": 510,
     "rendererProfile": "generic" }
   ```
2. `raw_markdown` gains:
   ```markdown
   [EXT:EXAM_TIPS]

   - Link causes to consequences
   - [[Related Topic]] for cross-reference
   ```
3. Parse → `representations.exam_tips = [{ block_type: 'paragraph', … }]`
4. `flattenBlocks` → `note_blocks.representation_type = 'exam_tips'`
5. Reader → tab “Exam Tips” via `getTabSectionDefinitions`
6. Render → `renderGeneric()` with `data-representation="exam_tips"`

---

## 13. Open decisions (resolve before Phase 2 code)

1. **Strict vs lenient** unknown `[EXT:…]` in markdown without definition  
   → Recommend **strict** + clear error in draft editor.

2. **Custom section delete**  
   → Removing from `section_extensions` without removing markdown leaves orphan boundaries; need paired “remove section” that edits both.

3. **Max custom sections per variant**  
   → Suggest cap of 10 to limit tab sprawl.

4. **Student visibility**  
   → Custom sections publish with variant; no extra RLS.

5. **Anchor system**  
   → Custom sections participate in anchor scan same as builtins; no change required if blocks use standard extract path.

---

## 14. Summary

- **`SectionDefinition`** is the shared contract across modal, parser, storage, tabs, and renderer.
- **Phase 1** implements the catalog and append helpers with **builtins only**; no parser changes yet.
- **Phase 2** adds `section_extensions` on `note_variants`, extension boundary syntax `[EXT:…]`, dynamic parse buckets, persist/read fixes, and generic renderer fallback.
- The database already stores arbitrary `representation_type` text; the real work is **parser recognition**, **catalog merge**, and **read/render paths** that today silently ignore unknown keys.

This sketch is the reference for Phase 1 implementation: build against `note-section-catalog.js`, not against `REPRESENTATION_REGISTRY` directly.
