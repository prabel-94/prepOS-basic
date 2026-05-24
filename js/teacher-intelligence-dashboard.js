/**
 * PrepOS Teacher Intelligence Dashboard — orchestration bootstrap only.
 */

import { bootPage } from "./core/page-boot.js";
import {
  loadTeacherIntelligence,
  buildClassroomLearningState,
} from "./teacher/teacher-intelligence.js";
import {
  selectClassroomSnapshot,
  selectInterventionCards,
  selectWeakTopicDistribution,
  selectHardestConcepts,
  selectQuestionQualitySignals,
  selectConfidenceWarnings,
  selectClassroomTrend,
  selectExamQualityInsights,
  selectStudentDistributionSummary,
} from "./teacher/teacher-selectors.js";
import { renderTeacherDashboard } from "./teacher/teacher-dashboard-renderer.js";

async function initTeacherIntelligence() {
  const runtime = await bootPage({
    roles: ["teacher", "admin"],
    nav: {
      variant: "home",
      title: "Classroom Intelligence",
      subtitle: "Intervention-oriented classroom analytics",
    },
  });

  if (!runtime) return;

  try {
    const intelligence = await loadTeacherIntelligence();
    const classroomState = buildClassroomLearningState(intelligence);
    window.__PREPOS_TEACHER_LEARNING_STATE__ = classroomState;

    renderTeacherDashboard({
      snapshotView: selectClassroomSnapshot(classroomState),
      trendView: selectClassroomTrend(classroomState),
      interventionCards: selectInterventionCards(classroomState),
      weakTopics: selectWeakTopicDistribution(classroomState),
      difficultConcepts: selectHardestConcepts(classroomState),
      questionSignals: selectQuestionQualitySignals(classroomState),
      confidenceWarnings: selectConfidenceWarnings(classroomState),
      examInsights: selectExamQualityInsights(classroomState),
      studentDistribution: selectStudentDistributionSummary(classroomState),
    });
  } catch (error) {
    console.error("[Teacher Intelligence]", error);
    const snapshot = document.getElementById("classroomSnapshot");
    if (snapshot) {
      snapshot.innerHTML = `<div class="teacher-intel-empty">Failed to load classroom intelligence.</div>`;
    }
  }
}

initTeacherIntelligence();
