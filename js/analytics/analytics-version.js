/**
 * PrepOS Analytics Version Constants
 * -------------------------------------------------------
 * Tracks active engine versions for observability provenance.
 */


export const ANALYTICS_VERSION = "v1";
export const MASTERY_VERSION = "v1";
export const CLASSIFICATION_VERSION = "v1";
export const DIFFICULTY_VERSION = "v1";


/**
 * Standard version metadata for observability records.
 */
export function getVersionMetadata() {
  return {
    analyticsVersion: ANALYTICS_VERSION,
    masteryVersion: MASTERY_VERSION,
    classificationVersion: CLASSIFICATION_VERSION,
    difficultyVersion: DIFFICULTY_VERSION,
    versionMetadata: {
      analyticsVersion: ANALYTICS_VERSION,
      masteryVersion: MASTERY_VERSION,
      classificationVersion: CLASSIFICATION_VERSION,
      difficultyVersion: DIFFICULTY_VERSION
    }
  };
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


export function renderAnalyticsVersions(
  containerId = "analytics-versions-panel"
) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const versions = getVersionMetadata();

  el.innerHTML = `
    <table class="debug-table">
      <tbody>
        <tr><th>analytics engine</th><td>${escapeHtml(versions.analyticsVersion)}</td></tr>
        <tr><th>mastery logic</th><td>${escapeHtml(versions.masteryVersion)}</td></tr>
        <tr><th>classification rules</th><td>${escapeHtml(versions.classificationVersion)}</td></tr>
        <tr><th>difficulty engine</th><td>${escapeHtml(versions.difficultyVersion)}</td></tr>
      </tbody>
    </table>
    <p class="small mt-10">Snapshots preserve originating versions at creation time.</p>`;
}
