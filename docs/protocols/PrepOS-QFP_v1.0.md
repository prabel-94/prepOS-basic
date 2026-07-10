# PrepOS QFP v1.0 — Question Format Protocol (Parser Compliance Specification)

> **Authority:** This protocol is derived from the active PrepOS runtime parser in `js/core/question-parser.js` (June 2026 audit). When this document conflicts with older examples, comments, or informal notes, **the runtime parser wins**.
>
> **Implementation reference:** `js/core/question-parser.js`  
> **Technical audit:** `docs/architecture/questions/question-format-audit.md`  
> **Edge-case verification:** `docs/architecture/questions/question-format-verification.md`

---

## Purpose

PrepOS QFP defines the **mandatory plain-text contract** for MCQ blocks imported via:

- `parseQuestionPaste`
- `parseBulkQuestionPaste`
- `parseQuiz`

Any generator protocol (including MCQ-GP) that produces text for PrepOS import **must normatively comply** with this specification.

---

## Generation-complete principle

> A question is not generation-complete merely because its content, difficulty, distractors, explanation, and coverage are valid. It is generation-complete only when it can be reliably parsed into the intended PrepOS question object without information loss, field corruption, or question-boundary failure.

---

## 1. Canonical block structure

Every question MUST be a single **QCP block** in this order:

```
Q[n]. <stem — may span multiple lines>
A) <option A>
B) <option B>
C) <option C>
D) <option D>
Answer: <A|B|C|D>
Explanation: <optional body — may span multiple lines>
```

### Bulk batches

Multiple blocks MUST be separated by at least one blank line. Each block MUST begin with `Q[n].` or `Q[n])` followed by a space.

---

## 2. Question opening

| Rule | Requirement | Mandatory |
|------|-------------|-----------|
| Block starter | `Q` + digits + `.` or `)` + space | **Yes** (bulk) |
| Accepted | `Q1.`, `Q12.`, `Q1)` | **Yes** |
| **Not accepted** | `Q1:` (colon starter) | — |
| **Not accepted** | `Question 1.` | — |
| Single-question paste | Parser prepends `Q1.` if missing | Auto-fix (avoid relying on this) |
| Bare numbering | `1.` may be promoted to `Q1.` only when line looks like a question stem | Conditional |
| Stored stem | Leading `Q[n].` / `Q[n])` is **stripped** after parse | — |
| Sequential numbering | Not enforced by parser | Optional |
| Duplicate numbers | Accepted; bulk maps by **block order**, not label | — |
| Multiline stem | **Allowed** — lines before first option line | **Yes** |

### Stem hazards (line-start tokens)

The following at **line start** in the stem region (before options) cause parse failure or corruption:

| Token at line start | Effect |
|---------------------|--------|
| `Answer:` / `Ans:` / `Correct Answer:` | Answer boundary detected early → parse **fails** |
| `Explanation:` before `Answer:` | Explanation absorbs answer line → **corrupt** |
| `Q2.` / `Q3.` … in single paste | Truncation or split → **fails** |
| Extra `A)`–`D)` lines before real options | Wrong option count → **fails** |

**Inline** occurrences of `Answer:`, `Explanation:`, `A)`, `Q2.` **within** a stem line (e.g. in quotation) are generally safe.

### Numbered statement stems

Numbered lines (`1.`, `2.`, …) inside a stem are preserved when the stem contains a statement-list intro such as:

- `Consider the following statements`
- `പരിഗണിക്കുക`
- `Match List I`
- `ക്രമീകരിക്കുക` / `Arrange the following`

### Match-list stems

`A.`, `B.`, … rows under **List I** / **List II** are stem content, not MCQ options, when `List I` context is present.

---

## 3. Options

| Rule | Requirement | Mandatory |
|------|-------------|-----------|
| Count | Exactly **4** option lines before `Answer:` | **Yes** |
| Syntax | `^[A-D][\)\.\:\-]\s+` (letter + delimiter + **space**) | **Yes** |
| Preferred | `A)` `B)` `C)` `D)` | **Yes** for generators |
| Also accepted | `A.` `A:` `A-` | Parser tolerance only |
| **Not accepted** | `(A)` | — |
| **Not accepted** | `B )` (space before paren) | — |
| **Not accepted** | `E)` as fifth option | — |
| Multiline options | **Not supported** — one line per option | — |
| Option letter in text | Position assigns A–D; printed letter ignored | — |
| Order | Must be A, B, C, D in sequence | **Yes** |

> **Implementation note:** If >4 option-prefix lines exist, the parser uses the **last 4** (`slice(-4)`). Generators MUST NOT rely on this — it can bind the wrong lines.

---

## 4. Correct answer

| Rule | Requirement | Mandatory |
|------|-------------|-----------|
| Line format | Own line matching `^Answer\s*:` | **Yes** |
| Preferred | `Answer: B` | **Yes** |
| Also accepted | `Answer: B)`, `Answer: B.`, `Answer: B) Jamestown` | Parser tolerance |
| Malayalam | `ഉത്തരം:` at line start → normalized to `Answer:` | Optional |
| Aliases (line start) | `Ans:`, `Correct Answer:`, `Correct option:` → `Answer:` | Avoid in generated text |
| Letter only | A, B, C, or D | **Yes** |
| **Not accepted** | `Answer: 1` (numeric index) | — |
| **Not accepted** | `Answer: Beta` (word) | Defaults silently to **A** |

> **Defect warning:** Unparseable answer letters default to `A` without error. Generators must verify answer lines explicitly.

---

## 5. Explanation

| Rule | Requirement | Mandatory |
|------|-------------|-----------|
| Presence | Optional | No |
| Label | `Explanation:` on its own line (or `വിശദീകരണം:` for Malayalam) | If present |
| Body start | May continue on same line or following lines | Either |
| Multiline | **Allowed** after `Explanation:` line | Yes |
| Boundary | From first `^Explanation\s*:` through **end of block** | — |
| Blank lines inside | Stripped before parse — paragraphs collapse | Avoid blank lines |
| ECP fields | `Core Fact:`, `Historical Significance:`, `Exam Trap:` in body | **Parser-safe** |
| Lines after `Answer:` without `Explanation:` | **Discarded** | — |

### Explanation hazards

| Condition | Effect |
|-----------|--------|
| `Explanation:` before `Answer:` | Answer line absorbed into explanation |
| `Q2.` at line start inside explanation (bulk) | Splits into new block — **truncation** |
| Blank line between explanation paragraphs | Lines merged — spacing lost |

---

## 6. Question boundaries

| Rule | Requirement |
|------|-------------|
| Bulk split regex | `\n(?=Q\d+[\.\)]\s)` |
| Blank line between blocks | **Recommended** |
| Introductory text before `Q1.` | **Not supported** — will break or prepend |
| Trailing text after last block | Ignored if not matching `Q[n].` |
| Code fences | **Not supported** |
| Markdown headings as separators | **Not supported** |

---

## 7. Whitespace and normalization

| Aspect | Parser behaviour |
|--------|------------------|
| Line endings | `\r\n`, `\r` → `\n` |
| Per-line trim | Applied before structural parse |
| Blank lines | Removed before parse (`filter(Boolean)`) |
| Multiple spaces | Collapsed only when `clean: true` / deep clean |
| Tabs | Pass through (trimmed per line) |
| Unicode NFC/NFKC | **Not applied** |
| Malayalam script | Fully supported in stem/options/explanation |
| Smart quotes, en/em dashes | Pass through if inline in text |
| `clean: true` | May **break** stems with inline `A)` / `B)` — generators should not require clean |

---

## 8. Malayalam compatibility

Malayalam uses the **same parser**. No separate Malayalam parser exists.

| English | Malayalam (accepted at line start) |
|---------|-----------------------------------|
| `Answer:` | `ഉത്തരം:` |
| `Explanation:` | `വിശദീകരണം:` |

Malayalam statement-list intros (`പരിഗണിക്കുക`, `ക്രമീകരിക്കുക`) preserve numbered stem lines.

For bilingual paste (`target: "auto"`), separate English and Malayalam with:

```
--- Malayalam ---
```

or `[Malayalam]` or `Malayalam:` on its own line before Malayalam block.

---

## 9. Failure conditions

### Hard failure (block returns `null`)

- Empty block
- No `Answer:` line
- ≠4 option lines before answer (after slice logic)
- Spurious option-prefix lines in stem

### Silent partial failure

| Condition | Behaviour |
|-----------|-----------|
| Bulk parse — some blocks fail | Failed blocks **dropped**; no per-block error |
| Unparseable answer letter | Defaults to **A** |
| Single paste with multiple `Q[n].` | **First block only** |
| `clean: true` on inline `A)` stems | May fail where default parse succeeds |

---

## 10. Mandatory generator checklist

Before releasing any generated batch, verify **every block**:

- [ ] Starts with `Q[n].` + space
- [ ] Has multiline stem only before options (no line-start `Answer:` / `Explanation:` / `Q2.`)
- [ ] Has exactly four options: `A)` `B)` `C)` `D)` each on own line
- [ ] Has `Answer: X` on own line where X ∈ {A,B,C,D}
- [ ] Has `Explanation:` on own line if explanation present
- [ ] ECP subfields appear only inside explanation body
- [ ] No blank lines inside explanation body
- [ ] No `Q[n].` tokens inside explanation
- [ ] Match-list / statement-list intros present when stem contains `A.` / `1.` rows
- [ ] Batch separated by blank lines between blocks
- [ ] Parse test: `parseBulkQuestionPaste(batch)` returns `ok: true` with expected count

---

## 11. Parser verification procedure

1. Concatenate batch into single string with blank lines between blocks.
2. Run through `parseBulkQuestionPaste(text)` (or `parseQuiz` for exam creator path).
3. Confirm `ok === true` and `questions.length` equals expected count.
4. For each parsed question, verify:
   - `text` preserves stem (minus `Q[n].` prefix)
   - `options.length === 4` with correct text
   - `correct` matches intended letter
   - `explanation` contains full ECP body
5. Reject batch if any block fails or count mismatches.

---

## 12. Known implementation issues (report only — do not exploit)

| Issue | Recommendation |
|-------|----------------|
| Answer defaults to `A` on malformed input | Always verify answer line in generation audit |
| `>4` option lines → last 4 used | Never emit >4 option-prefix lines |
| Bulk silent drop | Verify question count after parse |
| `normalizeMalayalamQcpLabels` rewrites `Ans:` mid-text | Avoid alias strings at line start in stems |

---

## 13. Versioning

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-07-06 | Initial protocol derived from runtime parser audit |

**END OF PrepOS QFP v1.0**
