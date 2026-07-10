# PrepOS Question Format Audit — Canonical Reference

This report documents **only what the code actually does today**, based on a full repository search. There is **one active text parser** for MCQ import. No OCR pipeline exists. Notes parsers (`map-parser.js`, etc.) are unrelated to question cards.

**Audit date:** June 2026  
**Primary source file:** `js/core/question-parser.js`

---

## 1. Parser Inventory

### A. Active text parser (canonical)

| Field | Detail |
|---|---|
| **File** | `js/core/question-parser.js` |
| **Status** | **Active** — single source of truth for all QCP paste |
| **Purpose** | Parse pasted plain-text MCQ blocks into draft question objects |

| Function | Role | Called from |
|---|---|---|
| `prepareQcpForParsing` | Preprocess pipeline | Internal; also via wrappers |
| `cleanQcpText` | Deep-clean + preprocess | `js/creator.js` → `cleanQCP()` (Exam Creator UI) |
| `parseQuiz` | Multi-block parse | `creator.js` → `generate()` |
| `parseSingleQuestion` | One block | `parseQuestionPaste`, tests |
| `parseQuestionPaste` | Single paste API (`{ ok, english?, malayalam?, error? }`) | `draft.js`, `qb-manager.js` |
| `parseBulkQuestionPaste` | Multi-block paste API | `draft.js` bulk Malayalam |
| `normalizeMalayalamQcpLabels` | Label aliasing | Internal preprocess |
| `normalizeQuestionBlockMarkers` | `Q1.` / `1.` normalization | Internal preprocess |
| `splitBilingualPaste` | English/Malayalam split | `parseQuestionPaste` (`target: "auto"`) |
| `normalizeQuestionForQcp` | Object → QCP shape (serialize input) | `serializeQuestionToQcp` |
| `serializeQuestionToQcp` | Object → QCP text | `malayalam-copy.js` (AI copy workflow) |

**Internal (not exported):** `parseQuestionBlock`, `applyQcpDeepCleanLines`, `extractAnswerLetter`, `createParsedQuestionFields`

---

### B. Serialization / copy (not a parser)

| File | Function | Purpose | Called from |
|---|---|---|---|
| `js/core/malayalam-copy.js` | `buildMalayalamTranslationCopyText` | Builds ChatGPT prompt + English QCP blocks | `draft.js`, `qb-manager.js` |
| `js/core/malayalam-copy.js` | `MALAYALAM_TRANSLATION_PROMPT` | Documents expected output format for AI | Copy-for-translation buttons |

---

### C. Post-parse JSON normalizers (not text parsers)

| File | Function | Purpose | When |
|---|---|---|---|
| `parser-review.html` | `normalizeQuestion` | Pad options to 4; coerce `correct` | After `parseQuiz`, before UI |
| `supabase/functions/create-exam/index.ts` | inline map | Same legacy option/correct coercion | Draft creation API |
| `js/exam.js` | `normalizeQuestion` | Runtime display shape | Exam take |
| `js/exam.js` | `stripLeadingNumber` | Display-only Q-label strip | Exam display |
| `js/core/question-parser.js` | `normalizeQuestionForQcp` | Bank/draft row → QCP for serialize | Round-trip copy |
| `js/core/question-hash.js` | `normalizeQuestionHashInput` | Dedup hash input | Bank save |

---

### D. Non-text question ingestion (no QCP parse)

| File | Function | Purpose |
|---|---|---|
| `js/draft.js` | `buildDraftQuestionFromBank` | DB row → draft card |
| `js/draft.js` | `createNewQuestion` | Empty manual card |
| `js/draft.js` | `appendGeneratedQuestion` | Generator JSON → card |
| `js/generators/shared/lexicon-engine.js` | `buildQuestion` | Practice generator object |
| `js/draft.js` | `confirmLoadSet` handler | Copy questions from another draft |
| `supabase/functions/_shared/draft-publish.ts` | `validateDraftQuestion` | Publish validation (JSON) |
| `supabase/migrations/20260621000000_question_assistance_malayalam.sql` | `save_question_to_bank` | Bank save validation (JSON) |

---

### E. Not question parsers (do not use for QCP)

| File | Purpose |
|---|---|
| `js/notes/map-parser.js` | MSMDF notes markdown |
| `js/notes/note-import.js` | Canonical note import |
| `js/creator.js` comment "Creator System v2" | Routes to parser; does not parse itself |

---

### F. Legacy / unreachable

| Item | Status |
|---|---|
| Second text parser | **Not found** |
| OCR post-processing | **Not found** |
| File upload for questions | **Not implemented** (`creator-mode.html` says "Upload" but only paste exists) |
| `cleanQcpText` import in `draft.js` | **Imported but unused** — draft uses `clean` checkbox on `parseQuestionPaste` instead |

---

## 2. Accepted Question Formats

Only **one structural format** is parsed. Variants differ by **prefix/label spelling**, not layout.

### Format 1 — Standard QCP block (canonical structure)

```
Q1. <question stem — may be multiple lines>
A) <option text>
B) <option text>
C) <option text>
D) <option text>
Answer: <A|B|C|D>
Explanation: <optional — may be multiple lines>
```

### Format 2 — Bare numeric block starter (normalized to Q1.)

```
1. <question stem>
A) ...
B) ...
C) ...
D) ...
Answer: ...
Explanation: ...
```

Converted to `Q1.` when `looksLikeTopLevelQuestionStem()` is true (see §3).

### Format 3 — Malayalam answer/explanation labels

Same as Format 1/2, but:

```
ഉത്തരം: B
വിശദീകരണം: ...
```

Normalized to `Answer:` / `Explanation:` before parse.

### Format 4 — Answer with option text on same line

```
ഉത്തരം: B) Jamestown
```

Letter extracted via `/Answer\s*:\s*(?:([A-D])[\)\.\:\-]?\s*|([A-D])\b)/i`.

### Format 5 — No question prefix (single-question paste only)

If paste has no `Q\d+.` and first line is not `1.` …, parser **prepends** `Q1.` to entire paste:

```
Which planet is known as the Red Planet?
A) Venus
...
```

### Format 6 — Bilingual single paste (`target: "auto"` only)

```
<English QCP block as above>

--- Malayalam ---
<Malayalam QCP block as above>
```

Also accepted separators (must be followed by newline):

- `--- മലയാളം ---`
- `[Malayalam]`
- `Malayalam:`

### Format 7 — Multi-block bulk paste

```
Q1. ...
A) ...
...
Answer: ...

Q2. ...
A) ...
...
Answer: ...
```

Or (after marker normalization):

```
1. ...
...
2. ...
...
```

**Block split regex:** `/\n(?=Q\d+[\.\)]\s)/gi` — splits only on `Q<number>.` or `Q<number>)` at line start.

### Format 8 — Statement-list stems (inside one block)

```
Q6. ... പ്രസ്താവനകൾ പരിഗണിക്കുക:
1. First statement
2. Second statement
Which of the above is correct?
A) ...
...
```

Internal `1.` / `2.` lines are **kept in stem** when inside a question before options (not promoted to new `Q` blocks).

---

### Formats NOT accepted (no parser support)

These layouts **fail** or are **ignored**:

```
Question:
...
Options:
A. ...
Correct Answer: ...
Reason: ...
```

```
(a) option
(b) option
```

```
Answer B          (no "Answer:" line)
```

```
E) fifth option   (only A–D)
```

```
3 options only    (exactly 4 required)
```

---

## 3. Accepted Prefix Variants

### Question block starters

| Input | Accepted? | Result |
|---|---|---|
| `Q1.` | Yes | Kept |
| `Q1)` | Yes | Kept |
| `Q 1.` | Yes | Normalized to `Q1.` |
| `Q 1)` | Yes | Normalized to `Q1.` |
| `1.` | Conditional | → `Q1.` if top-level stem heuristic matches |
| `1)` | Conditional | Same |
| No prefix | Single paste only | → `Q1. <text>` prepended |
| `Question 1.` | **No** | Not recognized |
| `Q.` | **No** | Not recognized |

### Option prefixes (`OPTION_REGEX = /^[A-D][\)\.\:\-]\s+/i`)

| Accepted | Example |
|---|---|
| `A)` | `A) Mars` |
| `A.` | `A. Mars` |
| `A:` | `A: Mars` |
| `A-` | `A- Mars` |
| `a)` | Yes (case-insensitive) |
| `B )` | **No** (space before paren breaks regex) |
| `(A)` | **No** |
| `E)` | **No** |

**Important:** Option IDs in output are assigned **by line order** (1st option line → A, 2nd → B, …), **not** by the letter printed on the line.

### Answer line labels (after `normalizeMalayalamQcpLabels`)

| Input pattern | Normalized to |
|---|---|
| `Answer:` | `Answer:` |
| `Ans:` | `Answer:` |
| `Correct Answer:` | `Answer:` |
| `Correct option:` | `Answer:` |
| `Correct Option:` | `Answer:` |
| `ഉത്തരം:` | `Answer:` |
| `ഉത്തരം` (no colon) | `Answer:` |
| `Answer` + `:` or `：` or `-` | Works after normalization |

**Not accepted:** `Correct:`, `Reason:`, `Notes:`, bare `B` on its own line.

### Explanation line labels

| Input | Normalized to |
|---|---|
| `Explanation:` | `Explanation:` |
| `Explanation` + optional `:`/`：`/`-` | `Explanation:` |
| `വിശദീകരണം:` | `Explanation:` |

**Not accepted:** `Reason:`, `Notes:`, `Solution:`.

### Bilingual section markers

| Marker | Accepted |
|---|---|
| `--- Malayalam ---` + newline | Yes |
| `--- മലയാളം ---` + newline | Yes |
| `[Malayalam]` + newline | Yes |
| `Malayalam:` + newline | Yes |

---

## 4. Required Fields

### QCP text parser (`parseQuestionBlock`)

| Field | Required | Optional | Ignored | Auto-generated |
|---|---|---|---|---|
| Question stem | **Yes** (≥1 line before first option) | | | |
| Options A–D | **Yes — exactly 4 lines** matching `OPTION_REGEX` | | | IDs A–D by order |
| `Answer:` line | **Yes** | | | Defaults to `A` if letter unparseable |
| `Explanation:` | | **Yes** | | Default `""` |
| Q prefix on stem | | Yes | Stripped from stored `text` | Auto-added in single paste |
| Topics | | | **Ignored** | `[]` |
| Difficulty | | | **Ignored** | All nulls |
| `generator` | | | **Ignored** | `{ source: "parser", enabled: false, ... }` |
| `id` | | | | `crypto.randomUUID()` |
| `question_id` | | | | `null` |

### Bank save (`save_question_to_bank` SQL)

| Field | Required |
|---|---|
| `text` / `question` / `question_text` | **Yes** |
| `options` array | **Yes — ≥2** (not QCP parse; different rule) |
| `topics` array | **Yes — ≥1** |
| `correct` | Optional (defaults `A`) |
| `explanation` | Optional |
| Malayalam assistance | Optional metadata |

### Publish validation (`validateDraftQuestion`)

| Field | Required |
|---|---|
| `text` or `question` | **Yes** |
| `options` | **≥2** |
| `correct` | **Must be present** (not null/undefined) |

---

## 5. Whitespace Rules

| Rule | Behavior |
|---|---|
| Line endings | `\r\n` and `\r` → `\n`; whole input **trimmed** |
| Blank lines in block | **Removed** (`filter(Boolean)` after trim per line) |
| Multiple blank lines | Allowed in input; removed before parse |
| Leading/trailing spaces per line | **Trimmed** per line in `parseQuestionBlock` |
| Tabs | Not specially handled; treated as whitespace |
| Deep clean (`clean: true`) | Collapses `[ \t]+` to single space **within lines** |
| Deep clean | Trims every line |
| Deep clean | Collapses `\n{3,}` → `\n\n` |
| Deep clean | Inserts blank line before `Q\d+.` blocks |

**Stem multiline:** Yes — all non-empty lines from start through line before first option, joined with `\n`.

---

## 6. Option Rules

| Rule | Actual behavior |
|---|---|
| Count | **Exactly 4** option lines required; otherwise block returns `null` |
| Range 2–10 | **No** — parse fails if ≠ 4 |
| Missing option | **Parse fails** — no recovery |
| Out-of-order letters | **Accepted but dangerous** — IDs assigned by **position**, not printed letter |
| Multi-line option text | **No** — one line per option only |
| Markdown in options | Stored as **literal text** — no markdown processing |
| Numbering inside option text | Allowed as plain text |
| Images | **Not supported** |
| Empty option text | Line still counts if regex matches (e.g. `A) `) |

---

## 7. Answer Detection

**Mechanism:** First line matching `/^Answer\s*:/i` (after label normalization).

**Extraction regex:**

```javascript
/Answer\s*:\s*(?:([A-D])[\)\.\:\-]?\s*|([A-D])\b)/i
```

| Input | Result |
|---|---|
| `Answer: B` | `B` |
| `Answer: B)` | `B` |
| `Answer: B.` | `B` |
| `Answer: B) Jamestown` | `B` |
| `answer: c` | `C` (case-insensitive line match; letter uppercased) |
| `Answer: E` | Falls through → **defaults `A`** |
| `Answer: Beta` | **Defaults `A`** (no word match) |
| Option text as answer | **Not supported** |
| Numeric index `Answer: 1` | **Not supported** in text parser |

**Note:** Post-parse JSON normalizers (`parser-review`, `create-exam`, `exam.js`) accept **numeric** `correct` (0–3 → A–D), but the **text parser does not**.

---

## 8. Explanation Parsing

| Rule | Behavior |
|---|---|
| Start | First line matching `/^Explanation\s*:/i` |
| Body | **All lines from that line to end of block**, joined with `\n` |
| Label stripped | Only first line's `Explanation:` prefix removed |
| Multi-paragraph | **Yes** — newlines preserved in body |
| Lists / numbered text | **Yes** — stored as plain text |
| Markdown | **Literal** — no rendering at parse time |
| Code blocks | **Literal** |
| Blank lines inside explanation | **Removed** — `filter(Boolean)` runs on all lines before explanation extraction, so blank lines between explanation paragraphs are **lost** |
| End detection | End of block (or next `Qn.` block in bulk paste) |
| Lines after `Answer:` without `Explanation:` | **Discarded entirely** |

---

## 9. Failure Cases

| Example | Why it fails |
|---|---|
| Only 3 options | `optionLines.length !== 4` → `null` |
| 5 options | Same |
| No `Answer:` line | `answerIndex === -1` → `null` |
| `Correct: C` | Never normalized → no Answer line |
| `Q1.` with statements then options, but `clean:true` and Malayalam statement lines mis-detected as new questions | Deep clean can still mis-convert `1.` lines if heuristics fail (rare after recent fix) |
| Bulk paste with only `1.` `2.` blocks, no `?`/`:`/English keywords, Malayalam-only stem without `clean` | May fail to convert to `Q1.`/`Q2.` if stem heuristic fails |
| Options `A.` only, missing D | Fails (need 4 lines) |
| `(A) text` | Line not matched by `OPTION_REGEX` |
| `B ) text` | Space before `)` — not matched |
| Bilingual paste with wrong separator `---ML---` | No split; English parse may fail or include Malayalam text in stem |
| Bulk paste: 10 questions pasted, 5 cards in draft | Only first 5 applied **by index**; rest skipped (not an error) |
| Bulk paste: questions parse out of order | Cards get wrong Malayalam masks (index mapping, not Q-number mapping) |
| `parseQuiz` after failed blocks | Failed blocks **silently dropped** (`filter(Boolean)`) — partial success possible in `parseQuiz`, but `parseBulkQuestionPaste` requires ≥1 success |

---

## 10. Parser Ambiguities

| Case | What happens |
|---|---|
| **Option letter vs position** | `B) foo` as first option line → stored as **option A** |
| **Duplicate option labels** | Two `A)` lines → 5 option lines possible → **parse fails** (≠4) |
| **Answer inside explanation** | Included in explanation text if after `Explanation:` line |
| **"Answer:" inside question stem** | Deep clean may split `...Answer:\nA)` onto new line; otherwise may break stem |
| **Numbered statements `1.` `2.`** | Kept in stem if before options inside Q block; promoted to `Q1.` only at top level |
| **Malayalam stem without `?`** | Top-level `1.` may still become `Q1.` if ends with `:` |
| **`clean:true` + Malayalam** | Deep clean uses `/[\u0D00-\u0D7F]/` as "looks like question" for numeric lines — can mis-convert unless statement-list intro detected |
| **Missing D** | Hard fail |
| **Explanation blank lines** | Lost due to pre-trim filter |
| **Bulk Q-number vs card index** | `Q6` in paste goes to card index 5 only if it's the 6th **successfully parsed** block in order, not by number in label |
| **`normalizeSingleQuestionPaste` with Q1+Q2** | **Keeps only first block** |
| **Partial bulk parse** | `parseQuiz` drops failed blocks silently; user may get fewer questions than expected without explicit per-block errors |

---

## 11. Normalization Layer

### Always applied (`prepareQcpForParsing`)

1. `\r\n`, `\r` → `\n`; trim whole text
2. Malayalam/alias labels → `Answer:` / `Explanation:`
3. `Q 1.` → `Q1.`
4. Conservative `1.` → `Q1.` (context-aware; preserves statement lists)
5. Option prefix `A.` / `A:` / `A-` → `A) ` (in marker pass)
6. Strip lone `---+` horizontal rules (non-deep)

### Deep clean only (`clean: true` or Exam Creator "Clean (QCP)")

1. Remove `---+` lines
2. Strip emojis: `✅✔️💡⭐✨🔥📌👉•`
3. Collapse horizontal whitespace in lines
4. Split inline options: `text A) opt` → newline before `A)`
5. Trim content before first question marker
6. Per-line trim + numeric→Q heuristics (more aggressive than marker pass)
7. Collapse 3+ newlines; insert gap before `Qn.`

### Not normalized

- Smart quotes `""`
- Zero-width characters
- Malayalam punctuation variants beyond label regex
- Unicode NFC/NFD
- Option text casing
- Answer letter beyond uppercasing extracted letter

### Post-parse JSON normalization (separate from text)

- Pad options to 4 empty strings (`parser-review`)
- Numeric `correct` → letter
- Invalid `correct` → `"A"`
- `text || question || question_text` field aliasing

---

## 12. Parsing Pipeline

```
Raw clipboard / textarea text
        │
        ▼
┌───────────────────────────────────────┐
│ Entry point selection                 │
│ • parseQuiz (creator, bulk)           │
│ • parseQuestionPaste (draft, QB)      │
│ • parseBulkQuestionPaste (draft bulk) │
└───────────────────────────────────────┘
        │
        ▼
normalizeLineEndings()          ← \r\n→\n, trim
        │
        ▼
normalizeMalayalamQcpLabels()   ← ഉത്തരം/വിശദീകരണം/aliases
        │
        ▼
normalizeQuestionBlockMarkers() ← Q1./1. handling, statement lists
        │
        ▼
[optional] applyQcpDeepCleanLines()  if clean:true
        │
        ▼
[auto mode only] splitBilingualPaste()
        │                    ├─ English section ─┐
        │                    └─ Malayalam section (optional)
        ▼
normalizeSingleQuestionPaste()  ← single-question only: force Q1., first block
        │
        ▼
split(QUESTION_BLOCK_SPLIT)     ← /\n(?=Q\d+[\.\)]\s)/gi
        │
        ▼
parseQuestionBlock() × N
   ├─ trim lines, drop empty
   ├─ find Answer: line
   ├─ extractAnswerLetter()
   ├─ find Explanation: (optional)
   ├─ collect 4 OPTION_REGEX lines before answer
   ├─ stem = lines before first option
   └─ createParsedQuestionFields()
        │
        ▼
Question object
{
  id, text, options[{id,text}×4], correct,
  explanation, topics:[], generator, difficulty, ...
}
        │
        ├─ parser-review: normalizeQuestion() → edit UI
        ├─ create-exam API: JSON normalize → draft_exams.schema_json
        ├─ draft paste: applyParsedEnglishFields / applyParsedMalayalamFields
        └─ exam runtime: normalizeQuestion() + stripLeadingNumber() (display)
```

---

## 13. Canonical Safe Format (recommended)

Based on what **all active parsers accept most reliably**, use this and only this for AI generation:

```
Q1. <Single clear question stem. May span multiple lines.>

<Optional numbered statements — use 1. 2. 3. only AFTER an intro phrase containing "പരിഗണിക്കുക" or "Consider the following".>

A) <Option A text>
B) <Option B text>
C) <Option C text>
D) <Option D text>
Answer: <A|B|C|D>
Explanation: <Optional. Single paragraph preferred.>
```

### Formal grammar (PrepOS QCP v1)

```
Document   ::= Block (SEP Block)*
SEP        ::= "\n\n"

Block      ::= Header Stem OptionLine OptionLine OptionLine OptionLine AnswerLine ExplanationLine?

Header     ::= ("Q" POSINT "." | POSINT ".") SPACE
Stem       ::= Line (NL Line)*
OptionLine ::= LETTER SUFFIX SPACE Text NL
AnswerLine ::= "Answer:" SPACE LETTER SUFFIX? (SPACE RestOfLine)? NL
ExplanationLine ::= "Explanation:" (SPACE Text)? NL Text*

LETTER     ::= "A" | "B" | "C" | "D" | "a" | "b" | "c" | "d"
SUFFIX     ::= ")" | "." | ":" | "-"
POSINT     ::= [1-9][0-9]*
NL         ::= "\n"
SPACE      ::= " "
Text       ::= any characters except structure violations
```

### Malayalam variant (bulk / assistance paste)

```
Q1. <ചോദ്യം>

A) <ഓപ്ഷൻ>
B) <ഓപ്ഷൻ>
C) <ഓപ്ഷൻ>
D) <ഓപ്ഷൻ>
ഉത്തരം: <A|B|C|D>
വിശദീകരണം: <ഓപ്ഷണൽ>
```

### AI generator rules (maximize robustness)

1. Always use **`Q1.` `Q2.` …** for bulk paste (not bare `1.`).
2. Always use **`A)` `B)` `C)` `D)`** in that order (letter matches position).
3. Always use **`Answer: X`** on its own line (English) or **`ഉത്തരം: X`** (Malayalam).
4. Put **`Explanation:`** on its own line; keep explanation **one paragraph** (blank lines are stripped).
5. For statement questions, include **`പരിഗണിക്കുക`** or **`Consider the following`** on the stem intro line.
6. Separate questions with **one blank line**.
7. Do **not** use `Question:`, `Options:`, `(a)`, `E)`, `Correct:`, or `Reason:`.
8. For bilingual single-card paste, use exactly `--- Malayalam ---` on its own line between sections.
9. Bulk Malayalam maps to cards **by position** (1st parsed block → 1st card), not by `Q6` label.

---

## 14. Future-Proof Recommendations

*(Not current behavior — suggested improvements for AI reliability.)*

1. **Assign option IDs from printed letter**, not line order — eliminates the largest ambiguity.
2. **Explicit parse errors per block** in bulk paste (report "Q6 failed: only 3 options").
3. **Match bulk blocks to cards by Q-number** when labels present.
4. **Support `Correct:` / `Reason:` aliases** if desired for AI output variety.
5. **Preserve blank lines in explanations** (parse explanation before `filter(Boolean)` or use a different strategy).
6. **Accept 2–3 options with padding** for recovery mode (warn, don't fail).
7. **Unify deep clean and marker normalization** — `clean:true` still uses riskier Malayalam heuristic in `applyQcpDeepCleanLines`.
8. **Add `Question:` / `Options:` section headers** as optional aliases.
9. **Validate answer letter references existing option** at parse time.
10. **Publish a machine-readable JSON schema** alongside QCP for generators that can emit structured data directly.
11. **Remove unused `cleanQcpText` import** from `draft.js` or wire it to a visible action.
12. **Add round-trip tests** for full 10-question Malayalam bulk fixtures.

---

## Quick reference: where each UI path parses

| UI | Parser | Mode |
|---|---|---|
| Exam Creator → Generate | `parseQuiz` | Multi; no clean unless user clicked Clean first |
| Parser Review | (already parsed JSON) | No re-parse |
| Draft → per-card paste | `parseQuestionPaste` | Single; `auto`/`english`/`malayalam`; optional clean |
| Draft → bulk Malayalam | `parseBulkQuestionPaste` | Multi; index-mapped to cards |
| Question Bank → ML paste | `parseQuestionPaste` | `malayalam` only |
| Copy for ML translation | `serializeQuestionToQcp` | Outbound only |
| Bank search add | No parse | DB columns |
| Practice generator | No parse | `buildQuestion` |

---

## Key regex reference

| Name | Pattern |
|---|---|
| `OPTION_REGEX` | `/^[A-D][\)\.\:\-]\s+/i` |
| `QUESTION_BLOCK_SPLIT` | `/\n(?=Q\d+[\.\)]\s)/gi` |
| `QUESTION_START` | `/^Q\d+[\.\)]\s/i` |
| `ANSWER_LINE_REGEX` | `/^Answer\s*:/i` |
| `EXPLANATION_LINE_REGEX` | `/^Explanation\s*:/i` |
| Answer extraction | `/Answer\s*:\s*(?:([A-D])[\)\.\:\-]?\s*\|([A-D])\b)/i` |
| Bilingual split | `/(?:^|\n)(?:---+\s*(?:Malayalam\|മലയാളം)\s*---+\s*\|\[Malayalam\]\s*\|Malayalam\s*:\s*)\n/i` |

---

## Source files audited

- `js/core/question-parser.js`
- `js/core/question-parser.test.js`
- `js/core/question-parser-statements.fixture.test.js`
- `js/core/malayalam-copy.js`
- `js/creator.js`
- `js/draft.js`
- `js/qb-manager.js`
- `parser-review.html`
- `supabase/functions/create-exam/index.ts`
- `supabase/functions/_shared/draft-publish.ts`
- `js/exam.js`
- `supabase/migrations/20260621000000_question_assistance_malayalam.sql`
