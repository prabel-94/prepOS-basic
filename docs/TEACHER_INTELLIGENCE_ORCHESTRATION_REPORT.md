# PrepOS Teacher Intelligence Orchestration Report

## Overview

This phase transforms the teacher experience from **exam administration** to **classroom intelligence orchestration**. Teacher intelligence answers a fundamentally different question than student intelligence:

| Layer | Question |
|-------|----------|
| Student | How am I learning? |
| Teacher | What is happening across students, topics, exams, and concepts? |

Teacher intelligence is **diagnostic, comparative, operational, and intervention-oriented** — not personalized or motivational.

---

## Architecture

Four-layer separation mirrors the student intelligence stack:

```
teacher-intelligence.html
        │
        ▼
js/teacher-intelligence-dashboard.js   ← thin orchestrator (fetch → state → select → render)
        │
   ┌────┴────┬────────────────┬─────────────────────────┐
   ▼         ▼                ▼                         ▼
teacher-   teacher-         teacher-dashboard-      teacher-inspector.js
intelligence selectors.js    renderer.js             (overlay hooks)
.js
```

### Layer responsibilities

| Module | Role | Must NOT do |
|--------|------|-------------|
| `teacher-intelligence.js` | Aggregate canonical classroom analytics | DOM, pedagogy, Supabase in renderer |
| `teacher-selectors.js` | Translate analytics → intervention intelligence | Compute mastery, fetch data |
| `teacher-dashboard-renderer.js` | Presentation only | Compute mastery, fetch, intervention logic |
| `teacher-intelligence-dashboard.js` | Boot page, wire layers | Business logic |

**Public attempts** (`public_exam_attempts`) are counted for metadata only and **excluded** from mastery, weak topics, and intervention signals. Only canonical `exam_attempts` feed classroom intelligence.

---

## Classroom Learning State Contract

`buildClassroomLearningState()` exposes:

```js
{
  snapshot,              // topics mastered, weak/at-risk counts, confidence, trend
  classroomMastery,      // aggregated topic mastery across all students
  weakTopics,            // weak topics + affected student counts
  difficultConcepts,     // low mastery + question difficulty fusion
  interventionSignals,   // operational intervention cards (source data)
  studentDistribution,   // at-risk / unstable / high / average buckets (no rankings)
  questionDifficulty,    // hardest canonical questions + quality signals
  examInsights,          // per-exam performance and spread
  confidenceDistribution,// coverage + stability warnings
  metadata               // exam count, attempt counts, emptyReason, etc.
}
```

Stored on `window.__PREPOS_TEACHER_LEARNING_STATE__` for debugging.

---

## Selector Structure

Selectors answer **“Where should I intervene?”** not **“What statistics exist?”**

| Selector | Output |
|----------|--------|
| `selectClassroomSnapshot` | High-level classroom KPIs |
| `selectInterventionCards` | Priority intervention cards with recommendations |
| `selectWeakTopicDistribution` | Affected students, mastery avg, confidence, trend |
| `selectHardestConcepts` | Difficult concepts with summaries |
| `selectAtRiskStudents` | Remediation-focused student profiles (no leaderboard) |
| `selectQuestionQualitySignals` | Hardest / skipped / ambiguous question flags |
| `selectDifficultyInsights` | Grouped difficulty signals |
| `selectTopicCoverage` | Canonical coverage ratio |
| `selectConfidenceWarnings` | Low-confidence and insufficient-data warnings |
| `selectClassroomTrend` | Improving / stable / declining |
| `selectExamQualityInsights` | Recent exam spread and performance |

---

## Intervention Intelligence

Intervention signals merge:

1. **Weak topic clusters** — struggle rate across students, exam count, confidence tier
2. **Unstable mastery** — borderline classroom averages (50–65%) recommending reinforcement

Example card shape:

> **72% of students struggle with Federalism**  
> 6 of 8 students affected. Observed across 3 canonical exams.  
> Confidence: High  
> Recommendation: Schedule a focused revision block…

---

## Question Intelligence

Question quality is **interpretive**, not statistical-only:

| Signal | Meaning |
|--------|---------|
| `universallyMissed` | Accuracy &lt; 30% |
| `highSkipRate` | Skip rate ≥ 20% |
| `unstableDifficulty` | Mid accuracy with enough attempts |
| `potentiallyAmbiguous` | Mid accuracy + elevated skips |

Hardest canonical questions surface first via `buildKnowledgeQuestionStats` + `hardestQuestions` (knowledge mode).

---

## Student Distribution (Phase 5)

Buckets support intervention — **not ranking**:

- **High performers** — avg ≥ 80%, no critical topics
- **Average performers** — default band
- **At-risk** — avg &lt; 50% or 2+ critical topics
- **Unstable mastery** — high score/topic variance

Counts appear in question insights section; individual identities are not ranked or labeled.

---

## Overlay / Inspector Roadmap

Foundation hooks in `js/ui/teacher-inspector.js`:

- `openTeacherInspector(id, data)` / `openInspector(id, data)`
- Placeholder modal with JSON payload preview
- `data-inspector-id` buttons on cards

**Future inspectors (not implemented):**

| ID | Purpose |
|----|---------|
| `mastery-inspector` | Topic mastery drill-down |
| `topic-inspector` | Weak topic classroom breakdown |
| `question-inspector` | Question quality forensics |
| `classroom-breakdown` | Exam / student segment view |
| `confidence-inspector` | Coverage and stability provenance |

---

## Empty States

| Condition | Message |
|-----------|---------|
| No canonical data | No canonical classroom analytics available yet. |
| Low coverage | More verified topic-linked assessments are needed… |
| Public-only | Public practice attempts do not contribute to classroom mastery intelligence. |

---

## Debugging

```js
window.debugTeacherIntelligence()
```

Returns snapshot, intervention signals, difficult concepts, weak topics, confidence distribution, and full classroom state.

---

## Validation Matrix

| Scenario | Expected behavior |
|----------|-------------------|
| Multi-student classroom | Aggregated weak topics, intervention priorities, difficult concepts |
| Low data classroom | Cautious confidence messaging, no false certainty |
| Public attempts only | Excluded from mastery; public-only warning |
| Question quality | Hardest / unstable / ambiguous questions surfaced |
| Multi-exam aggregation | Classroom-wide topic merge, merged intervention signals |

---

## Files Added

- `js/teacher/teacher-intelligence.js`
- `js/teacher/teacher-selectors.js`
- `js/teacher/teacher-dashboard-renderer.js`
- `js/teacher-intelligence-dashboard.js`
- `js/ui/teacher-inspector.js`
- `teacher-intelligence.html`
- CSS: `.teacher-intel-*` in `css/style.css`
- Nav link from `index.html` → Classroom Intelligence

---

## Next Steps

1. Full inspector UIs wired to overlay side panels
2. Deep link from intervention cards → QB filtered by topic
3. Teacher results page cross-link to classroom intelligence
4. Optional: at-risk student drill-down with privacy-preserving labels
