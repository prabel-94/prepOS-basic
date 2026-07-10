# PrepOS Question Format — Final Verification Pass

**Date:** June 2026  
**Scope:** Targeted edge-case verification against `js/core/question-parser.js` and related ingestion paths.  
**Method:** Direct code inspection + executable probes (Node).  
**Status:** Pre-canonical sign-off document.

This supplements [question-format-audit.md](./question-format-audit.md). Claims below are grounded in code behavior, not inference.

---

## 1. Unicode Robustness

**Finding:** The parser performs **no Unicode normalization**. There is no `normalize("NFC")`, no stripping of zero-width characters, and no BOM handling beyond what `String.prototype.trim()` provides.

| Input | Code path | Observed behavior |
|---|---|---|
| **NFC / NFD** | Stored verbatim in `text`, `options[].text`, `explanation` | Canonically equivalent sequences that differ at the byte level (e.g. NFD `e\u0301` vs NFC `\u00e9`) parse successfully but produce **different stored strings**. No equivalence guarantee for search, dedup, or display matching. |
| **ZWJ** (`U+200D`) | Pass-through | Preserved in stem/option/explanation text. |
| **ZWNJ** (`U+200C`) | Pass-through | Preserved. |
| **ZWSP** (`U+200B`) | Pass-through | Preserved. |
| **BOM** (`U+FEFF`) | `normalizeLineEndings` → `trim()` | Leading BOM removed by `trim()`; parsing succeeds. |
| **NBSP** (`U+00A0`) | Pass-through; not matched by deep-clean `[ \t]+` | Preserved in content. `trim()` removes leading/trailing NBSP. |
| **Malayalam combining marks** | Pass-through | Clusters with virama/ZWJ/ZWNJ parse and round-trip as pasted. No grapheme-cluster logic. |

**Deep clean (`clean: true`)** removes emoji (`✅✔️💡⭐✨🔥📌👉•`) and collapses ASCII space/tab only — not ZW* characters or NBSP.

**Implication for canonical spec:** NFC normalization is **not** required for parse success today, but identical words in different normalization forms will not compare equal in the bank hash (`question-hash.js` lowercases trimmed concatenation without normalization).

---

## 2. Option Text Safety

Options are collected only from lines that:

1. Appear **before** the first `^Answer\s*:` line, and  
2. Match `OPTION_REGEX` = `/^[A-D][\)\.\:\-]\s+/i` **at line start** (after per-line `trim()`).

**Safe inside option text** (verified — does not terminate parsing):

| Substring in option body | Example | Result |
|---|---|---|
| `Answer:` | `A) See Answer: trick` | Stored literally; parse succeeds. |
| `Explanation:` | `A) Has Explanation: inside` | Stored literally. |
| `Q2.` | `A) Next is Q2. fake` | Stored literally. |
| `A)` | `A) nested A) inside` | Stored literally. |
| `B)` mid-line | `A) first B) second` | Single option line; `B)` not treated as new option. |

**Unsafe patterns:**

| Pattern | Result |
|---|---|
| Extra option-prefix line before `Answer:` | e.g. two `B)` lines → 5 option-prefix lines → `optionLines.length !== 4` → **parse fails** (`null`). |
| Option text on its own line starting with `A)`–`D)` before the real option block | Treated as an option line; shifts stem/option boundary → usually **parse fails** (wrong option count or wrong stem). |
| Multi-line option | **Not supported** — only one line per option. |

**`clean: true` hazard:** `applyQcpDeepCleanLines` splits `([^A-D])\s+([A-D][\)\.\:\-]\s+)` onto new lines. A stem like `Choose A) Mars or B) Venus?` can be rewritten into spurious option lines and **break parsing** (verified: `parseQuestionPaste(..., { clean: true })` fails where default parse succeeds).

---

## 3. Stem Safety

Stem = all lines before the **first** line matching `OPTION_REGEX`, after blank-line removal.

**Safe (verified):**

| Pattern | Example | Behavior |
|---|---|---|
| Inline `Answer:` in quotes | `The label "Answer:" appears here?` | Stem includes quoted text; parse succeeds. |
| Inline `Q2.` | `See Q2. below?` | Part of stem; parse succeeds. |
| Inline `A)` | `Pick A) or B) in the question?` | Part of stem **if not at line start**. |

**Unsafe — line-start structural tokens in stem:**

| Pattern | Behavior |
|---|---|
| Line starting `Answer:` (or normalized alias) before options | First `Answer:` becomes answer boundary → options after it ignored → **parse fails** (≠4 options). Verified: `Answer: B` example line in stem → `null`. |
| Line starting `A)`–`D)` before real options | Counted as first option → stem truncated → usually **parse fails**. Verified: format-example `A) sample...` line → `null`. |
| Line starting `Ans:` / `Correct Answer:` etc. | `normalizeMalayalamQcpLabels` rewrites to `Answer:` at line start → **parse fails**. Verified: `Ans: B is wrong` in stem → `null`. |
| Line starting `Q2.` (single-question paste) | `QUESTION_BLOCK_SPLIT` splits into two blocks before `parseQuestionBlock`; first block incomplete → **parse fails** (`null`). |
| Line starting `Q2.` (bulk paste) | Starts a new question block; prior block may parse with truncated explanation (see §4). |

**Quotation does not protect line-start tokens.** Protection is positional: tokens must not appear as **trimmed line prefixes** matching `OPTION_REGEX`, `ANSWER_LINE_REGEX`, or `QUESTION_BLOCK_SPLIT`.

---

## 4. Explanation Safety

Explanation = from first `^Explanation\s*:` line through **end of block**, joined with `\n`; only the first line's `Explanation:` prefix is stripped.

**Safe inside explanation body (single block, verified):**

- `Answer: C` on its own line → included in explanation text.
- `A) fake` on its own line → included in explanation text.
- Inline `Q2.` within a line → included.

**Lossy behavior:**

| Issue | Behavior |
|---|---|
| Blank lines in explanation | Removed by `filter(Boolean)` before structural parse → `\n\n` collapses to `\n`. Verified: `para1\n\npara2` → `para1\npara2`. |
| `Explanation:` before `Answer:` | Explanation slice runs to end of block → **`Answer: B` line absorbed into explanation**. Verified. |
| Lines after `Answer:` without `Explanation:` | **Discarded** (not in stem, options, answer, or explanation). |

**Bulk-paste hazard (critical, verified):**

`QUESTION_BLOCK_SPLIT` = `/\n(?=Q\d+[\.\)]\s)/gi` runs **before** per-block parse. A line starting `Q2. ` inside what authors intend as explanation starts a **new block**:

```
Explanation: see also
Q2. embedded in explanation
```

→ First block explanation becomes `see also` only; `Q2.` block fails silently (`parseQuiz` → `filter(Boolean)`). **No error surfaced.**

---

## 5. Maximum Size

| Layer | Limit found | Notes |
|---|---|---|
| Question stem length | **None in parser** | 50,000-character stem parsed successfully in probe. |
| Option text length | **None in parser** | Limited only by JS string / memory. |
| Explanation length | **None in parser** | Same. |
| Paste size | **None in parser** | 200-question bulk paste parsed successfully. |
| Bulk question count | **None in parser** | All blocks returned. |
| HTML `textarea` | **No `maxlength`** | Grep across `*.html`: no maxlength attributes on paste/edit areas. |
| `draft_exams.schema_json` | **Postgres `jsonb`** | No application-level size cap found. |
| `questions.question_text`, `option_*` | **`text`** (unbounded) | From `save_question_to_bank` migration. |
| Bank save `options` | **≥2 required** | Unlike parser's exactly-4 rule. |
| Publish validation | **≥2 options**, `correct` required | `draft-publish.ts`. |
| Parser | **Exactly 4 options** | Hard requirement. |

**UI mapping limits (not parser):** Draft bulk Malayalam applies `min(parsedBlocks, cardCount)`; excess blocks skipped with user message (`draft.js`).

---

## 6. Hidden Assumptions

Assumptions present in code but easy to miss in prose specs:

| Assumption | Location | Effect |
|---|---|---|
| **Exactly 4 option lines** | `parseQuestionBlock` L346 | Fewer or more → silent `null`. |
| **Option IDs by position** | `OPTION_LETTERS[idx]` L350–352 | Printed letter on line is cosmetic. |
| **First `Answer:` wins** | `findIndex` L322 | Earlier spurious `Answer:` in stem breaks parse. |
| **First `Explanation:` anywhere** | `findIndex` L329 | Can appear before `Answer:`; pollutes explanation. |
| **Blank lines stripped early** | `filter(Boolean)` L316 | Affects stem, options, explanation fidelity. |
| **Default correct `A`** | `extractAnswerLetter` L306–307 | Unparseable answer letter → `A` (silent). |
| **Default correct `A`** | `normalizeQuestionForQcp` L543–546 | Invalid/missing correct → `A`. |
| **`parseQuiz` drops failed blocks** | L380 `.filter(Boolean)` | Partial bulk success without per-block errors. |
| **`normalizeSingleQuestionPaste` keeps block 1 only** | L401–405 | Multi-`Qn` single paste silently truncates. |
| **Bulk maps by index, not Q label** | `draft.js` L1531–1534 | `Q6` in text ≠ card index 6. |
| **Magic `OPTION_LETTERS`** | `["A","B","C","D"]` | No E/F; not configurable. |
| **`generator` defaults** | `createParsedQuestionFields` | Always `{ source: "parser", enabled: false, subject: "general", ... }`. |
| **`topics` always `[]`** | Parser output | Topics never extracted from QCP text. |
| **`id` always new UUID** | `crypto.randomUUID()` | Every parse creates fresh identity. |
| **Label alias substitution is global** | `normalizeMalayalamQcpLabels` | `\b(Ans\|Correct Answer\|...)\b` and `\bExplanation\b` anywhere in line, not only line-start labels. |
| **Deep-clean Malayalam heuristic** | `applyQcpDeepCleanLines` L247 | `/[\u0D00-\u0D7F]/` counts as question-like for numeric-line promotion. |
| **Bilingual split requires trailing newline** | `BILINGUAL_SECTION_SPLIT` | Separator must be followed by `\n`. |

---

## 7. Serialization Round-Trip

**Functions:** `serializeQuestionToQcp()` → `parseSingleQuestion()` (equivalently `parseQuestionPaste`).

### Content fields (text, options, correct, explanation)

| Case | Lossless? |
|---|---|
| Standard single-line stem + 4 options + answer + explanation | **Yes** (verified). |
| Multi-line stem | **Yes** (verified). |
| Multiline explanation (no blank lines) | **Yes**. |
| Explanation with blank lines | **No** — blank lines removed on re-parse. |
| Options with printed letters out of order | **Positions preserved** by `normalizeQuestionForQcp` letter/index merge; re-parse keeps position-based IDs. |
| `correct` letter | **Yes** if valid A–D. |

### Fields that always change or are dropped

| Field | On re-parse |
|---|---|
| `id` | **New UUID** |
| `question_id` | **`null`** |
| `topics` | **`[]`** (even if non-empty before serialize) |
| `generator` | **Reset** to parser defaults (`source: "parser"`, `enabled: false`, `subject: "general"`, …) |
| `difficulty` | **Reset** to all-null object |
| `bank_status` | **`"draft"`** |
| `primary_pattern` | **`null`** |
| `explanationMeta`, `tracking`, `assistance` | **Dropped** (not serialized) |
| Q prefix number | **Follows `index` arg** (default 1), not original |

### Not guaranteed lossless

- Round-trip through QCP is **not** an identity operation on the full question object.
- Round-trip on **content** is reliable only when explanation has no blank lines, stem/options contain no line-start structural tokens, and `clean: true` is not used on re-parse.

---

## 8. Generator Compatibility

**Generators found:**

| Entry | Patterns | Output builder |
|---|---|---|
| `js/generator-core.js` | Routes `malayalam` → `MalayalamGenerator`; `english` → `runEnglishGenerator` | — |
| `js/generators/malayalam.js` | `SYNONYM`, `OPPOSITE_WORD` | `buildQuestion()` |
| `js/generators/english.js` | `SYNONYM`, `OPPOSITE_WORD` | `buildQuestion()` |

Generators emit **JSON objects directly** into draft schema (`appendGeneratedQuestion` in `draft.js`). They **do not** pass through the QCP text parser.

### Compatible with parser *assumptions* (as JSON)

| Requirement | Generators |
|---|---|
| 4 options | **Yes** — always 4 strings shuffled into A–D via `correctIndex`. |
| `correct` as letter | **Yes** — `correct: correct \|\| optionIds[correctIndex]`. |
| `text` string | **Yes**. |
| `explanation` string | **Yes** (Malayalam synonym uses `buildMalayalamLexiconExplanation`; English often `""`). |

### Not QCP-text-compatible without transformation

| Generator field | Issue if serialized to QCP |
|---|---|
| `explanationMeta`, `tracking` | Not in QCP format; lost on serialize. |
| `difficulty` as `{ score, label }` | Lost on QCP round-trip. |
| `topics` arrays | Lost on QCP round-trip (parser never reads topics from text). |
| English stems with `"quoted words"` | Fine in QCP. |
| Malayalam Unicode | Fine in QCP. |

### Incompatibilities across subsystems (not generator bugs)

| Layer | Rule | Mismatch |
|---|---|---|
| QCP parser | Exactly **4** options | Bank save / publish allow **≥2**. |
| Parser output | `topics: []` | Bank save requires **≥1 topic**. |
| Generator output | Includes `tracking`, `explanationMeta` | Parser schema has no equivalent. |

**Conclusion:** Generators are compatible with draft/exam JSON consumption. They are **not** designed to emit QCP text; `serializeQuestionToQcp` can export them, but metadata is lossy on re-import.

---

## 9. Future Structured Parser

### Should PrepOS add a canonical JSON Question Schema?

**Yes — recommended**, for these code-backed reasons:

1. **Round-trip loss** — QCP serialize/parse drops `topics`, `generator`, `difficulty`, assistance, tracking (§7).
2. **Silent failures** — Text parser drops bad blocks and defaults bad answers (§6).
3. **Positional ambiguity** — Option letter vs line order (§2, audit §10).
4. **Generators already produce JSON** — Text parser is only needed for human/LLM paste paths.
5. **Bank hash** — Operates on normalized JSON fields, not QCP text.

### Proposed architecture

```
                    ┌─────────────────────┐
  LLM / human paste │  QCP text (QFP v1)  │
                    └──────────┬──────────┘
                               │ parseQcp()
                               ▼
                    ┌─────────────────────┐
                    │ QuestionSchema v1   │  ← canonical internal form
                    │ (JSON)              │
                    └──────────┬──────────┘
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
      draft schema        bank save           serializeQcp()
      exam runtime        generators merge    (export only)
```

### Migration path (backwards compatible)

| Phase | Action | Compatibility |
|---|---|---|
| **0 (now)** | Document QFP v1 text rules (§10); keep `question-parser.js` | Existing paste unchanged. |
| **1** | Add `QuestionSchemaV1` TypeScript/JSDoc typedef mirroring `createParsedQuestionFields` + extensions (`topics`, `assistance`, …) | No behavior change. |
| **2** | `parseQcp(text) → QuestionSchemaV1`; `validateQuestionSchema(obj)` shared by publish/bank | Parser output validated explicitly; optional warnings for dropped blocks. |
| **3** | `importQuestions({ format: "qcp" \| "json" })` in draft/creator | JSON paste accepted alongside QCP. |
| **4** | LLM prompts offer **JSON or QCP**; JSON preferred for bulk | QCP remains supported indefinitely. |
| **5** | Deprecate lossy fields in QCP export docs; add `serializeQuestionToJson` as primary export | `serializeQuestionToQcp` kept for Malayalam copy workflow. |

**Rule:** QCP remains the human-readable interchange format; JSON becomes the **authoritative internal contract**.

---

## 10. Canonical AI Generation Contract

### PrepOS Question Formatting Protocol — Text Profile (QFP v1.0)

This profile defines the **QCP text format** that MUST be produced by external LLMs (ChatGPT, Claude, Gemini, etc.) when output is plain text for PrepOS import via `parseQuestionPaste`, `parseBulkQuestionPaste`, or `parseQuiz`.

**Key words:** MUST, MUST NOT, SHOULD, SHOULD NOT, MAY — per RFC 2119.

---

### 10.1 Document structure

1. A **document** MUST consist of one or more **question blocks**.
2. Each question block MUST contain, in order:
   1. a **stem section**;
   2. exactly four **option lines**;
   3. one **answer line**;
   4. an optional **explanation section**.
3. Blocks MUST NOT include fields not defined here (e.g. `Question:`, `Options:`, `Correct:`, `Reason:`, `Notes:`, `Topic:`) as structural labels.
4. A document with multiple blocks SHOULD separate blocks with a single blank line.

---

### 10.2 Stem section

1. The first line of a block MUST begin with `Q<n>. ` where `<n>` is a positive integer (e.g. `Q1. `, `Q12. `).
2. For a **single-question** paste, if the author omits `Q1.`, PrepOS MAY prepend it; authors SHOULD NOT rely on this.
3. The stem MAY span multiple lines.
4. Continuation lines MUST NOT begin with:
   - `A)` `B)` `C)` `D)` or variants `A.` `A:` `A-` (case-insensitive);
   - `Answer:` or aliases `Ans:`, `Correct Answer:`, `Correct option:`, `ഉത്തരം:`;
   - `Explanation:` or `വിശദീകരണം:`;
   - `Q<m>.` / `Q<m>)` where `<m>` is any integer (bulk paste only — starts a new block).
5. The stem MAY contain the substrings `Answer:`, `Explanation:`, `A)`, `Q2.` **inline** within a line (e.g. in quotation or prose).
6. For stems with numbered statements (`1.` `2.` …), the stem SHOULD include an intro phrase such as `പരിഗണിക്കുക` or `Consider the following` before numbered lines.

---

### 10.3 Option lines

1. Each block MUST contain exactly **four** option lines.
2. Option lines MUST appear immediately after the stem section (allowing no intervening structural lines).
3. Each option line MUST match: `^[A-D][\)\.\:\-]\s+` followed by option text (case-insensitive letter).
4. The four option lines MUST appear in order: first line `A)`, second `B)`, third `C)`, fourth `D)`.
5. The letter on each option line MUST match its position (first line `A)`, second `B)`, etc.). PrepOS assigns option IDs by position, not by printed letter.
6. Option text MUST be contained on a **single line**.
7. Option text MAY contain the literals `Answer:`, `Explanation:`, `Q2.`, `A)` in the body.

---

### 10.4 Answer line

1. Each block MUST contain exactly one answer line matching `^Answer:\s*` (after PrepOS label normalization).
2. For Malayalam assistance paste, authors MAY use `ഉത്തരം:` instead; it MUST be normalized to `Answer:`.
3. The answer line MUST specify a single letter `A`, `B`, `C`, or `D`.
4. Permitted forms include: `Answer: B`, `Answer: B)`, `Answer: B.`, `Answer: B) Jamestown`.
5. The answer line MUST NOT use `E)`, numeric indices, or option text alone.
6. The answer line MUST appear after all four option lines.

---

### 10.5 Explanation section

1. An explanation section MAY be omitted.
2. If present, it MUST begin with a line matching `^Explanation:\s*` (or `^വിശദീകരണം:\s*`).
3. The explanation MAY continue on subsequent lines.
4. Explanation body lines MAY contain `Answer:`, `A)`, `Q2.`, etc.
5. Explanation body lines MUST NOT begin with `Q<n>. ` in **bulk** documents (starts a new question block).
6. Authors SHOULD NOT place `Explanation:` before `Answer:`.
7. Authors SHOULD use a single paragraph; blank lines between paragraphs MAY be removed by PrepOS.

---

### 10.6 Bilingual documents (single card)

1. An English block and Malayalam block MAY be concatenated.
2. The Malayalam section MUST be preceded by one of these markers on its own line, followed by a newline:
   - `--- Malayalam ---`
   - `--- മലയാളം ---`
   - `[Malayalam]`
   - `Malayalam:`

---

### 10.7 Bulk documents

1. Each block MUST satisfy §10.1–10.5 independently.
2. Block headers MUST use `Q<n>. ` (RECOMMENDED) rather than bare `1.` numbering.
3. Blocks are mapped to draft cards by **parse order** (first block → first card), not by the numeric label in `Q<n>`.
4. Authors MUST NOT use `clean: true` semantics when stems contain inline `A)` / `B)` examples.

---

### 10.8 Character encoding

1. Documents MUST be UTF-8.
2. Authors MAY use Malayalam and English in any field.
3. Authors SHOULD NOT depend on Unicode normalization equivalence; authors SHOULD use consistent composed characters.

---

### 10.9 Minimal valid examples

**English (single block):**

```
Q1. Which planet is known as the Red Planet?
A) Venus
B) Mars
C) Jupiter
D) Saturn
Answer: B
Explanation: Mars appears red due to iron oxide on its surface.
```

**Malayalam labels:**

```
Q1. ചുവന്ന ഗ്രഹം ഏതാണ്?
A) വെനസ്
B) ചൊവ്വ
C) വ്യാഴം
D) ശനി
ഉത്തരം: B
വിശദീകരണം: ഇരുമ്പ് ഓക്സൈഡ് കാരണം ചൊവ്വ ചുവപ്പാണ്.
```

**Bulk (two blocks):**

```
Q1. First question?
A) One
B) Two
C) Three
D) Four
Answer: A

Q2. Second question?
A) Alpha
B) Beta
C) Gamma
D) Delta
Answer: B
```

---

### 10.10 Non-normative notes

- PrepOS MAY apply `clean: true` deep-cleaning in some UI paths; LLM output SHOULD target the strict rules above without requiring deep clean.
- Topics, difficulty, and generator metadata are NOT imported from QCP text; they MUST be assigned inside PrepOS after import.
- For lossless metadata interchange, a future JSON Question Schema (§9) SHOULD be used instead of QCP.

---

## Sign-off checklist

| Item | Verified |
|---|---|
| Unicode handling documented | ✅ |
| Option/stem/explanation safety boundaries | ✅ |
| Size limits catalogued | ✅ |
| Hidden assumptions enumerated | ✅ |
| Round-trip field diff listed | ✅ |
| Generators reviewed | ✅ |
| JSON schema migration sketched | ✅ |
| QFP v1.0 AI contract written | ✅ |

**Recommendation:** Accept [question-format-audit.md](./question-format-audit.md) + this verification document as the canonical PrepOS Question Formatting Specification, with [PrepOS-QFP_v1.0.md](../protocols/PrepOS-QFP_v1.0.md) as the external LLM contract.
