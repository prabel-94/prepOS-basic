/**
 * PrepOS Settings Page — binds preference controls to the preferences store.
 */

import { bootPage } from "./core/page-boot.js";
import {
  getPreference,
  setPreference,
  syncPreferencesFromServer,
  getAllPreferences,
} from "./core/preferences.js";

const statusEl = document.getElementById("settingsStatus");

function showStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
  statusEl.classList.toggle("error", isError);

  clearTimeout(statusEl._timer);
  statusEl._timer = setTimeout(() => {
    statusEl.classList.add("hidden");
  }, 2500);
}

function bindToggle(id, prefKey) {
  const el = document.getElementById(id);
  if (!el) return;

  el.checked = getPreference(prefKey) === true;

  el.addEventListener("change", () => {
    setPreference(prefKey, el.checked);
    showStatus("Saved");
  });
}

function bindSelect(id, prefKey) {
  const el = document.getElementById(id);
  if (!el) return;

  const current = getPreference(prefKey);
  const currentStr = String(current ?? "");

  for (const option of el.options) {
    if (option.value === currentStr) {
      option.selected = true;
      break;
    }
  }

  el.addEventListener("change", () => {
    const raw = el.value;
    const asNumber = Number(raw);
    const value = raw && !isNaN(asNumber) ? asNumber : raw;
    setPreference(prefKey, value);
    showStatus("Saved");
  });
}

async function init() {
  const runtime = await bootPage({
    roles: ["teacher", "admin", "student"],
    nav: {
      title: "Settings",
      subtitle: "Preferences",
    },
  });

  if (!runtime) return;

  await syncPreferencesFromServer();

  bindToggle("prefReadingAutoBookmark", "reading.autoBookmark");
  bindSelect("prefReadingDefaultLanguage", "reading.defaultLanguage");
  bindToggle("prefPracticeAssistance", "practice.assistanceDefault");
  bindToggle("prefPracticeAdaptive", "practice.adaptiveMode");
  bindSelect("prefPracticeSessionLimit", "practice.defaultSessionLimit");
}

init().catch((err) => {
  console.error("[Settings] Init failed:", err);
});
