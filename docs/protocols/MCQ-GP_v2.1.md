# 📘 MCQ-GP v2.1 (Multiple Choice Question Generation Protocol)

> **Version note:** MCQ-GP v2.1 introduces coverage-aware generation, Question Unit mapping, batch-level correct-option distribution control, option-symmetry auditing, representation diversity, chronological coverage integrity, existing-question-bank auditing, targeted gap-fill generation, cognitive duplication control, ECP integration, and **mandatory PrepOS parser compliance** via **PrepOS QFP v1.0**.

### Normative dependencies

| Protocol | Role |
|----------|------|
| **PrepOS QFP v1.0** (`PrepOS-QFP_v1.0.md`) | Canonical parser formatting and compliance specification — **authoritative for output structure** |
| **ECP** (active version) | Explanation field structure inside the `Explanation:` body |

MCQ-GP does **not** duplicate QFP. It normatively depends on QFP for all parser-safe formatting rules.

---

## Purpose

To systematically generate and maintain a complete MCQ question bank ensuring:

- full concept coverage
- multiple question representations
- cognitive diversity
- trap inclusion
- exam alignment
- controlled correct-option distribution
- resistance to structural answer leakage
- chronological coverage where relevant
- compatibility with existing question banks
- targeted gap-fill generation
- explanation compliance
- PrepOS parser compatibility

The objective is **not** merely to generate many questions. The objective is to build and maintain a question bank in which important knowledge is tested through appropriate retrieval demands, defensible distractors, varied cognitive architectures, and audit-verified coverage integrity.

---

## CORE PRINCIPLE

The goal is **NOT** to create many questions.

The goal is to **EXHAUST THE CONCEPT SPACE**.

### Supporting principles

- Exhausting concept space does **not** mean mechanically generating the same number of questions for every concept.
- Question-bank completeness requires testing important knowledge through appropriate retrieval demands and representations.
- Surface wording variation does **not** constitute genuine question diversity.
- Mere appearance of knowledge in a stem, option, or explanation does **not** mean that knowledge has been cognitively tested.
- New questions generated for an existing question bank must contribute new coverage, representation, retrieval demand, or cognitive value.

### Formal principle: Coverage ≠ Exposure

A fact, date, relationship, entity, concept, or significance point is **not** considered cognitively covered merely because it appears somewhere in a question or explanation. The learner must be required to **retrieve, recognize, discriminate, match, sequence, evaluate, or otherwise use** that knowledge to answer the question.

---

## INTEGRATION WITH PCP AND PREPOS

### PCP relationship

- MCQ-GP runs **AFTER** PCP.
- Questions must map to notes.

### Bidirectional flow

- Notes → Questions
- Questions → Notes

### Full integration architecture

`PCP / Source Knowledge → Question-Unit Mapping → Existing Question-Bank Audit (if applicable) → MCQ-GP Generation → ECP Validation → Difficulty Validation → QFP v1.0 Parser Verification → Mandatory Batch Integrity Audit`

### Restoration rule

Questions discovered during gap auditing that reveal missing source knowledge should trigger the existing bidirectional restoration mechanism rather than silently introducing unsupported knowledge into the question bank.

### Protocol flow note

| Workflow | Primary stage sequence |
|----------|------------------------|
| **New topic / no existing bank** | 1 → 2 → 3 → 4 → generate → 5 → 6 → 7 → 8 → 9 → 10 → 13 → 14 → 15 |
| **Existing question bank / gap-fill** | 1 → 2 → 3 → **11 → 12** → 4 → generate → 5 → 6 → 7 → 8 → 9 → 10 → **13** → 14 → **15** |

Stages 5–6 are applied during batch construction and revised before finalization. Stage 15 is mandatory before any batch is considered complete.

---

## STAGE 1: KNOWLEDGE EXTRACTION AND QUESTION-UNIT MAPPING

### Input

- Textbook / Notes / Source material
- PCP-derived concept inventory where available

### Process

Break content into atomic and relational knowledge elements.

### Atomic knowledge categories

- facts
- definitions
- principles
- relationships
- case laws
- exceptions
- entities
- persons
- institutions
- documents
- events
- dates
- chronology
- causes
- consequences
- comparisons
- distinctions
- quotations
- quotation attribution
- significance
- constitutional or conceptual developments
- event chains
- causal chains

### Question Unit

Each mapped element becomes a **Question Unit**: an atomic or relational knowledge element capable of supporting one or more meaningful retrieval demands.

**Each concept → Question Unit** (preserved and expanded).

### Question generation intensity

Not every Question Unit requires identical question treatment. Intensity must depend on:

- importance
- complexity
- exam relevance
- trap potential
- relationship density
- chronological importance
- existing question-bank coverage

---

## STAGE 2: QUESTION REPRESENTATION AND COGNITIVE MODULES

Select modules according to the knowledge structure of each Question Unit. Modules are representations, not quotas.

### MODULE 1: DIRECT RETRIEVAL MCQ

Tests direct factual retrieval.

Suitable knowledge includes:

- persons
- documents
- institutions
- terms
- dates
- events
- definitions

---

### MODULE 2: STATEMENT EVALUATION MCQ

Includes:

- two-statement questions
- three-statement questions
- four-statement questions
- partial truths
- closely related misconceptions
- mixed correct and incorrect propositions

---

### MODULE 3: CONCEPTUAL MCQ

Tests:

- meaning
- role
- function
- interpretation
- constitutional principle
- conceptual significance

---

### MODULE 4: CAUSAL MCQ

Tests:

- causes
- consequences
- trigger events
- structural causes
- immediate causes
- causal relationships

---

### MODULE 5: SIGNIFICANCE MCQ

Tests why an event, institution, document, reform, battle, person, or development is historically or conceptually important.

---

### MODULE 6: DISTINCTION AND COMPARISON MCQ

Tests differences between related entities, concepts, institutions, periods, movements, or developments.

---

### MODULE 7: CHRONOLOGY AND SEQUENCE MCQ

Tests:

- chronological ordering
- event progression
- political development
- constitutional evolution
- causal sequence
- event chains

---

### MODULE 8: PAIR-EVALUATION MCQ

Use the format:

`Consider the following pairs:`

The default question must be:

`How many pairs given above are correctly matched?`

Use count-based answer options appropriate to the number of pairs.

The explanation must identify:

- correct pairs
- incorrect pairs
- why incorrect pairs are incorrect

Do **not** normally use combination-code answers when a valid count-based architecture can test the same knowledge.

---

### MODULE 9: MATCH LIST I WITH LIST II

Use for associations involving:

- persons
- documents
- events
- concepts
- institutions
- movements
- dates
- significance

---

### MODULE 10: ASSERTION–REASON

Preserves the purpose of testing logical relationships.

Require verification that:

- Assertion is independently valid or invalid
- Reason is independently valid or invalid
- The explanatory relationship between A and R is correctly evaluated

---

### MODULE 11: QUOTATION MCQ

Tests:

- quotation attribution
- quotation–concept association
- quotation–movement association
- quotation–document association
- quotation significance

---

### MODULE 12: RELATIONAL AND DEVELOPMENTAL MCQ

Tests relationships such as:

- Cause → Development
- Event → Consequence
- Document → Constitutional Principle
- Movement → Demand
- Crisis → Political Outcome
- Reform → Institutional Change

---

### MODULE 13: TRAP GENERATION

#### Core techniques (preserved)

1. Absolute words
2. Reversal
3. Partial truth
4. Concept confusion

#### Expanded techniques

5. Chronological displacement
6. Person–event substitution
7. Document–provision confusion
8. Cause–consequence reversal
9. Similar institution confusion
10. Correct fact attached to the wrong entity
11. Correct event attached to the wrong date
12. Historically plausible but contextually incorrect statements

#### Trap rule

Traps must emerge from **plausible learner confusion**. Distractors must not be made difficult merely through obscure, irrelevant, or absurd alternatives.

---

## STAGE 3: COVERAGE AND REPRESENTATION PLANNING

> **Replaces the v2.0 mandatory per-concept formula** (`1 Direct + 1 Statement + 1 Trap`). That rule does not apply in v2.1.

For every Question Unit, determine:

- whether it requires direct retrieval
- whether it requires statement evaluation
- whether it contains a useful misconception or trap
- whether it requires relational testing
- whether it requires significance testing
- whether it requires chronological testing
- whether it requires multiple representations
- whether it is already adequately covered by an existing question bank

### Planning principle

**Question quantity must follow knowledge structure, not a fixed per-concept quota.**

- Important concepts may require multiple questions.
- Minor concepts may require only one question.
- Closely related Question Units may be tested together when this produces a stronger question.

---

## STAGE 4: BATCH ARCHITECTURE AND REPRESENTATION DIVERSITY

Ensure meaningful inclusion of multiple question architectures across a batch.

### Mandatory rule against stem monotony

Repeated use of a single stem pattern, especially excessive use of `Which of the following`, must be avoided.

### Required diversity across architectures

- direct identification
- statement evaluation
- pair evaluation
- matching
- chronology
- causal analysis
- significance analysis
- conceptual distinction
- quotation testing
- event–consequence relationships
- development–outcome relationships

### Lexical variation rule

**Lexical variation alone does not constitute representational diversity.**

Changing `Which of the following` to `Which one of the following` does **not** create meaningful diversity when the cognitive architecture remains unchanged.

### Batch-level requirement

Question architecture must be audited at the batch level before finalization.

---

## STAGE 5: CORRECT-OPTION DISTRIBUTION CONTROL

Correct-option placement must be controlled at the **batch level**.

### Target distribution

Approximately balanced distribution across:

- A
- B
- C
- D

Exact equality is not mandatory when the number of questions is not divisible by four.

### Prohibited patterns

- No answer position should become disproportionately dominant
- Conspicuous runs of identical correct answers should be avoided
- Answer positions should not form easily detectable patterns

### Verification rule

**Correct-option balance must be verified, not merely intended.**

### Answer-distribution ledger

During batch generation, maintain a temporary ledger recording:

- A count
- B count
- C count
- D count
- percentage distribution
- longest consecutive run of the same correct option

Before final output, calculate these values. If imbalance is detected, rebalance by repositioning options without damaging question quality or introducing answer leakage.

---

## STAGE 6: OPTION SYMMETRY AND ANSWER-LEAKAGE CONTROL

Options must exhibit **functional symmetry**.

### Audit dimensions

- option length
- grammatical complexity
- qualification density
- specificity
- terminology
- clause count
- explanatory detail
- stylistic consistency

### Prohibited leakage patterns

- the correct answer is usually the longest option
- the correct answer is the only qualified option
- the correct answer is the only technically precise option
- the correct answer is the only grammatically complete option
- distractors are obviously shorter or less informative
- the correct answer repeats distinctive wording from the stem

### Symmetry principle

**Functional symmetry does not require identical word counts.** The objective is comparable plausibility and structural quality.

### Mandatory audit

A pre-output answer-leakage audit is required for every batch.

---

## STAGE 7: DIFFICULTY BALANCING

Include a deliberate spread of difficulty:

- **Easy** → factual
- **Moderate** → conceptual
- **Hard** → reasoning
- **Trap** → misleading

### PrepOS Difficulty Guide

When the PrepOS Difficulty Guide is available, generated questions must comply with it.

### Invalid difficulty sources

Difficulty must arise from legitimate cognitive demand rather than:

- obscure trivia
- unnecessarily complicated wording
- implausible distractors
- excessive statement length
- artificial ambiguity

---

## STAGE 8: CHRONOLOGICAL COVERAGE INTEGRITY

### Principle: Date Exposure ≠ Date Testing

#### Date Exposure

The date appears in the stem, options, or explanation but is not required to answer the question.

#### Direct Date Retrieval

The learner identifies the date associated with an event.

#### Event Retrieval from Date

The learner identifies the event associated with a supplied date.

#### Event–Date Matching

The learner evaluates event–date associations.

#### Relative Chronology

The learner determines the temporal order of events.

#### Chronological-Causal Sequencing

The learner reconstructs a sequence in which chronological order also represents historical development or causation.

### Mandatory rule

A date is considered cognitively covered only when answering the question requires retrieval, recognition, discrimination, matching, sequencing, or chronological use of that date. Mere appearance of a date does **not** constitute chronological coverage.

### Representation rule

Important dates must be tested through varied representations. Do not rely exclusively on direct `Which year?` questions.

---

## STAGE 9: QUESTION VALIDATION

Each question must satisfy the core quality standard:

- Clear
- Unambiguous
- Single correct answer
- Concept-linked
- Exam relevant

### Expanded validation checklist

- factual correctness
- single defensible answer
- distractor plausibility
- absence of accidental clues
- option symmetry
- correct-option distribution (batch context)
- question architecture diversity (batch context)
- absence of factual duplication
- absence of cognitive duplication
- source alignment
- difficulty validity
- chronological integrity where relevant
- parser compatibility (per QFP v1.0 §10 checklist — advisory at this stage; mandatory at Stages 14–15)

---

## STAGE 10: EXPLANATION COMPLIANCE (ECP INTEGRATION)

All explanations generated under MCQ-GP must comply with the **current active version of ECP** (Explanation Compliance Protocol).

MCQ-GP does not duplicate ECP. It requires strict integration with it.

When the active ECP requires structured explanation fields such as:

- `Core Fact:`
- `Historical Significance:`
- `Exam Trap:`

MCQ-GP must reproduce those fields **exactly**.

### Parser-safe ECP placement (mandatory)

ECP subfields (`Core Fact:`, `Historical Significance:`, `Exam Trap:`, and any other active ECP headings) MUST appear **only inside the explanation body**, after the `Explanation:` line. They MUST NOT appear in the stem or option region.

Per QFP v1.0:

- `Explanation:` MUST be on its own line after `Answer:`.
- ECP body MAY span multiple lines.
- Blank lines inside the explanation body MUST be avoided (parser strips blank lines).
- `Q[n].` tokens MUST NOT appear inside explanations.

### Alignment requirement

The explanation must remain factually aligned with:

- the stem
- correct answer
- distractors
- tested Question Unit

---

## STAGE 11: EXISTING QUESTION-BANK COVERAGE AUDIT

**Applies when an existing question bank is available.**

### Pipeline

`Source Knowledge → Existing Question Bank → Coverage Audit → Gap Identification → Targeted Generation`

### Audit must identify

- untested Question Units
- weakly tested Question Units
- overtested Question Units
- concepts appearing only in explanations
- dates exposed but not cognitively tested
- missing causal relationships
- missing distinctions
- missing significance
- missing chronology
- missing relational knowledge
- missing entities
- missing quotations where relevant
- underrepresented question architectures

### Coverage classification

- **Strong Coverage**
- **Adequate Coverage**
- **Weak Coverage**
- **Exposure Only**
- **No Coverage**

---

## STAGE 12: TARGETED GAP-FILL GENERATION

When an existing question bank has been audited, additional questions must primarily target **verified coverage gaps**.

### Pipeline

`Gap Identification → Question Target Selection → Representation Selection → Generation → Duplication Audit → Batch Integrity Audit`

### Gap-fill validity rule

A question is **not** a valid gap-fill question merely because its wording differs from an existing question.

The new question must contribute at least one of the following:

- new knowledge coverage
- new retrieval demand
- new relationship
- new chronological test
- new cognitive operation
- meaningful new representation
- correction of an identified weakness in existing coverage

---

## STAGE 13: FACTUAL AND COGNITIVE DUPLICATION CONTROL

### Surface Duplicate

Questions with substantially identical wording.

### Factual Duplicate

Questions that retrieve the same isolated fact despite different wording.

### Cognitive Duplicate

Questions that test substantially the same knowledge through substantially the same reasoning pathway.

### Productive Reinforcement

Questions that revisit important knowledge through meaningfully different retrieval demands or representations.

### Duplication rule

Not all repeated concepts constitute duplication. Important knowledge may be deliberately revisited. However, repeated questions must provide additional cognitive or representational value.

---

## STAGE 14: PREPOS OUTPUT COMPLIANCE (QFP v1.0)

All generated question text MUST comply with **PrepOS QFP v1.0** (`PrepOS-QFP_v1.0.md`). QFP is derived from the active runtime parser (`js/core/question-parser.js`) and is the sole authoritative formatting contract.

### Generation-complete principle (mandatory)

> A question is not generation-complete merely because its content, difficulty, distractors, explanation, and coverage are valid. It is generation-complete only when it can be reliably parsed into the intended PrepOS question object without information loss, field corruption, or question-boundary failure.

**No question or batch may be released until this principle is satisfied.**

### MCQ-GP mandatory output template

Every generated question MUST use exactly this structure:

```
Q[number]. <stem — multiline permitted before options>
A) <option>
B) <option>
C) <option>
D) <option>
Answer: <A|B|C|D>
Explanation:
<ECP body per active ECP>
```

### Exact capitalization (mandatory for generators)

- `Q` + number + `.` + space (not `Q1:`)
- `A)` `B)` `C)` `D)` — each on its own line
- `Answer:` — own line; letter only (A, B, C, or D)
- `Explanation:` — own line before ECP body

Do not use `(A)`, `E)`, `Ans:`, bare `1.` numbering for bulk blocks, or Malayalam labels unless generating a Malayalam-only block per QFP §8.

### Module-specific stem rules (parser-critical)

| Module | Mandatory stem safeguard |
|--------|--------------------------|
| **Statement evaluation** | Include `Consider the following statements` (or equivalent, e.g. `പരിഗണിക്കുക`) before numbered `1.` / `2.` lines |
| **Chronology** | Include `Arrange the following` / `ക്രമീകരിക്കുക` before numbered event lines |
| **Match List I / II** | Include `Match List I` before `List I` / `List II` rows using `A.` / `1.` notation |
| **Pair evaluation** | Include `Consider the following pairs:` before pair rows; options are counts, not pair codes |
| **Direct / conceptual** | No line-start `Answer:`, `Explanation:`, or spurious `A)`–`D)` before real options |

### Batch formatting (mandatory)

- Separate consecutive questions with **at least one blank line**.
- Number blocks `Q1.`, `Q2.`, … (sequential recommended; parser accepts duplicates but generators should not duplicate).
- Exactly **four** MCQ options per block — never more than four option-prefix lines.

### Forbidden patterns (cause parse failure or silent corruption)

- `Answer:` or `Ans:` at line start inside the stem
- `Explanation:` before `Answer:`
- `Q2.` or higher at line start inside a single-question paste or explanation
- Fifth option line (`E)`)
- `(A)` option syntax
- Blank lines inside explanation body
- Introductory prose before `Q1.` in bulk output
- Relying on parser auto-fix (`Q1.` prepend, answer default to `A`, last-four-options slice)

### Mandatory parser verification procedure

Before Stage 15, every batch MUST pass QFP §11:

1. Concatenate all blocks with blank-line separation.
2. Verify via `parseBulkQuestionPaste(batch)` (or equivalent runtime path).
3. Confirm `ok === true` and `questions.length` equals expected count.
4. Per question, verify stem, four options, correct letter, and full explanation (including ECP fields).
5. **Reject and regenerate** any block that fails — do not release partially parsed batches.

Parser verification is **mandatory**, not advisory. Mentioning "PrepOS parser validation" without executing this procedure does not satisfy MCQ-GP.

---

## STAGE 15: MANDATORY BATCH INTEGRITY AUDIT

Before final output, audit every batch for:

1. source coverage
2. Question Unit coverage
3. factual correctness
4. single-answer validity
5. distractor plausibility
6. correct-option distribution
7. consecutive answer patterns
8. option-length leakage
9. structural answer leakage
10. stem repetition
11. question-architecture diversity
12. factual duplication
13. cognitive duplication
14. chronological coverage
15. difficulty validity
16. ECP compliance
17. PrepOS parser compliance (QFP v1.0 §10–§11 — **reject batch on failure**)

### Parser compliance audit (item 17 — operational)

For every block in the batch, confirm:

- [ ] `Q[n].` starter with space (not `Q1:`)
- [ ] Stem free of line-start `Answer:` / `Explanation:` / extra `Q[n].`
- [ ] Exactly four options: `A)` `B)` `C)` `D)`
- [ ] `Answer: X` where X ∈ {A,B,C,D}
- [ ] `Explanation:` on own line; ECP fields inside body only
- [ ] No blank lines inside explanation
- [ ] Module-specific stem intro present where numbered rows exist
- [ ] `parseBulkQuestionPaste` returns success with full question count

### Completion rule

**A generated batch is not complete until it passes the Mandatory Batch Integrity Audit**, including mandatory QFP parser verification. A batch that fails item 17 MUST be revised or regenerated — it cannot be released.

---

## APPENDIX A: PARSER COMPLIANCE MATRIX (QFP v1.0 vs MCQ-GP v2.1)

| Formatting Feature | Parser Requirement | Mandatory / Optional | Failure Behaviour | MCQ-GP v2.1 Coverage |
| ------------------ | ------------------ | -------------------- | ----------------- | ---------------------- |
| Block starter `Q[n].` + space | `Q\d+[\.\)]\s` | Mandatory (bulk) | Block not split / mis-parsed | **FULLY COVERED** (Stage 14) |
| `Q1:` colon starter | Not accepted | — | Block merge / failure | **FULLY COVERED** (forbidden) |
| Multiline stem | Lines before first option | Optional | — | **FULLY COVERED** |
| Exactly 4 options | `A)`–`D)` with space after delimiter | Mandatory | `null` block | **FULLY COVERED** (Stage 14) |
| `(A)` option syntax | Not recognized | — | Wrong option count | **FULLY COVERED** (forbidden) |
| `Answer:` own line | `^Answer\s*:` | Mandatory | `null` block | **FULLY COVERED** |
| Answer letter A–D only | Regex extraction | Mandatory | Silent default to **A** | **FULLY COVERED** + verification |
| `Explanation:` after answer | Own line | Optional | Corruption if before answer | **FULLY COVERED** (Stage 10, 14) |
| ECP headings in explanation | Parser-safe | Optional | — | **FULLY COVERED** (Stage 10) |
| Blank lines in explanation | Stripped | Avoid | Paragraph collapse | **FULLY COVERED** (Stage 10) |
| Statement-list intro | Preserves `1.`/`2.` in stem | Mandatory for statements | Spurious `Q` blocks | **FULLY COVERED** (Stage 14 module table) |
| Match-list `List I` context | Preserves `A.` rows | Mandatory for match-list | Options mis-bound | **FULLY COVERED** (Stage 14 module table) |
| Bulk blank-line separation | Recommended | Optional | Boundary ambiguity | **FULLY COVERED** (Stage 14) |
| Malayalam `ഉത്തരം:` / `വിശദീകരണം:` | Normalized | Optional | — | **FULLY COVERED** (QFP ref; English default in Stage 14) |
| Parser verification procedure | Runtime parse test | Mandatory for release | Silent block drop | **FULLY COVERED** (Stage 14–15) |
| `>4` option lines | Last 4 used | — | Silent wrong options | **FULLY COVERED** (forbidden; do not exploit) |
| Generation-complete principle | Parse before release | Mandatory | Partial batch loss | **FULLY COVERED** (Stage 14) |

---

## OUTPUT

Each topic should produce, as applicable:

- mapped Question Units
- coverage-aware question bank
- multiple meaningful question representations
- balanced difficulty
- controlled correct-option distribution
- structurally symmetric options
- cognitively tested important dates
- ECP-compliant explanations
- QFP v1.0 parser-verified question structure
- parser verification result (pass/fail per batch)
- existing-question-bank coverage audit
- targeted gap-fill questions
- final Batch Integrity Audit result

The objective remains:

**EXHAUST THE CONCEPT SPACE WITHOUT CREATING REDUNDANT QUESTION VOLUME.**

---

**END OF MCQ-GP v2.1**
