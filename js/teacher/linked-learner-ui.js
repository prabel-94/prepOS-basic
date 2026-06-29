/**
 * Teacher linked learner — provision + mode toggle (Phase 2).
 */

import { resolveAppPath } from "../core/access.js";
import {
  enterLinkedStudentMode,
  exitLinkedStudentMode,
  fetchTeacherLearnerContext,
  isLinkedLearnerEnabled,
  provisionLinkedLearner,
} from "../core/learner-context.js";
import { resetRuntimeForDebug } from "../core/runtime.js";
import { getClient } from "../core/get-client.js";

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setLinkedLearnerStatus(message, { isError = false } = {}) {
  const el = document.getElementById("linkedLearnerStatus");
  if (!el) return;

  el.textContent = message;
  el.classList.toggle("student-management-status--error", isError);
  el.classList.toggle("text-muted", !isError);
}

function renderLinkedLearnerCard(context) {
  const card = document.getElementById("linkedLearnerSection");
  if (!card || !isLinkedLearnerEnabled()) {
    return;
  }

  card.classList.remove("hidden");

  const titleEl = document.getElementById("linkedLearnerTitle");
  const bodyEl = document.getElementById("linkedLearnerBody");
  const actionsEl = document.getElementById("linkedLearnerActions");

  if (!bodyEl || !actionsEl) {
    return;
  }

  if (!context?.hasLink) {
    if (titleEl) {
      titleEl.textContent = "My Learning Account";
    }

    bodyEl.innerHTML = `
      <p class="section-sub">
        Create a linked learner identity on this teacher login. Assign exams to yourself,
        take them, and track practice — without a second password.
      </p>
    `;

    actionsEl.innerHTML = `
      <button type="button" id="provisionLinkedLearnerBtn" class="primary-btn w-full">
        Set up my learning account
      </button>
    `;

    document
      .getElementById("provisionLinkedLearnerBtn")
      ?.addEventListener("click", handleProvisionLinkedLearner);

    return;
  }

  const displayName = escapeHTML(context.displayName ?? "My learning");
  const modeLabel = context.studentModeActive
    ? "You are in <strong>My learning</strong> mode."
    : "You are in <strong>Teacher</strong> mode.";

  if (titleEl) {
    titleEl.textContent = "My Learning Account";
  }

  bodyEl.innerHTML = `
    <p class="section-sub">
      Linked learner: <strong>${displayName}</strong><br>
      ${modeLabel}
    </p>
    <p class="text-muted mt-10">
      Assign exams to this learner from Published Exams, then switch modes to take them.
    </p>
  `;

  if (context.studentModeActive) {
    actionsEl.innerHTML = `
      <button type="button" id="openMyLearningBtn" class="primary-btn w-full">
        Open my learning dashboard
      </button>
      <button type="button" id="exitStudentModeBtn" class="secondary-btn w-full mt-10">
        Switch to teacher mode
      </button>
    `;

    document
      .getElementById("openMyLearningBtn")
      ?.addEventListener("click", () => {
        window.location.href = resolveAppPath("student-dashboard.html");
      });

    document
      .getElementById("exitStudentModeBtn")
      ?.addEventListener("click", () => handleExitStudentMode());
  } else {
    actionsEl.innerHTML = `
      <button type="button" id="enterStudentModeBtn" class="primary-btn w-full">
        Switch to my learning
      </button>
    `;

    document
      .getElementById("enterStudentModeBtn")
      ?.addEventListener("click", () => handleEnterStudentMode());
  }
}

async function handleProvisionLinkedLearner() {
  const button = document.getElementById("provisionLinkedLearnerBtn");
  const defaultName =
    document.getElementById("learnerDisplayName")?.value?.trim() ||
    "My learning";

  const rawName = window.prompt(
    "Display name for your learning account:",
    defaultName
  );

  if (rawName === null) {
    return;
  }

  const displayName = rawName.trim() || defaultName;

  if (!displayName) {
    setLinkedLearnerStatus("Display name is required.", { isError: true });
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Setting up…";
  }

  setLinkedLearnerStatus("Creating linked learner account…");

  try {
    const sb = await getClient();
    await provisionLinkedLearner(sb, { displayName });
    setLinkedLearnerStatus("Linked learner ready. Assign exams to yourself, then switch modes.");
    await mountLinkedLearnerUI();
  } catch (error) {
    console.error("[Linked Learner] provision failed", error);
    setLinkedLearnerStatus(error.message || "Setup failed.", { isError: true });
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Set up my learning account";
    }
  }
}

async function handleEnterStudentMode() {
  setLinkedLearnerStatus("Switching to my learning…");

  try {
    const sb = await getClient();
    await enterLinkedStudentMode(sb);
    resetRuntimeForDebug();
    window.location.href = resolveAppPath("student-dashboard.html");
  } catch (error) {
    console.error("[Linked Learner] enter student mode failed", error);
    setLinkedLearnerStatus(error.message || "Could not switch modes.", {
      isError: true,
    });
  }
}

async function handleExitStudentMode() {
  setLinkedLearnerStatus("Switching to teacher mode…");

  try {
    const sb = await getClient();
    await exitLinkedStudentMode(sb);
    resetRuntimeForDebug();
    window.location.href = resolveAppPath("index.html");
  } catch (error) {
    console.error("[Linked Learner] exit student mode failed", error);
    setLinkedLearnerStatus(error.message || "Could not switch modes.", {
      isError: true,
    });
  }
}

export async function mountLinkedLearnerUI() {
  if (!isLinkedLearnerEnabled()) {
    return null;
  }

  const sb = await getClient();
  const context = await fetchTeacherLearnerContext(sb);
  renderLinkedLearnerCard(context);
  return context;
}

export async function mountStudentModeNav(runtime) {
  if (!runtime?.learnerContext?.studentModeActive) {
    return;
  }

  const root = document.getElementById("app-nav-root");
  if (!root || root.querySelector("[data-linked-student-mode-banner]")) {
    return;
  }

  const banner = document.createElement("div");
  banner.className = "student-preview-banner student-preview-banner--inline mt-10";
  banner.setAttribute("data-linked-student-mode-banner", "true");
  banner.innerHTML = `
    <span class="student-preview-banner-title">My learning mode</span>
    <span class="student-preview-banner-text">
      Acting as ${escapeHTML(runtime.learnerContext.displayName ?? "linked learner")}.
    </span>
    <button type="button" class="secondary-btn mt-10" id="navExitStudentModeBtn">
      Switch to teacher mode
    </button>
  `;

  root.appendChild(banner);

  document
    .getElementById("navExitStudentModeBtn")
    ?.addEventListener("click", () => handleExitStudentMode());
}
