/**
 * Archived variant history — preview links and restore-as-draft workflow.
 */

import { resolveAppPath } from "../core/access.js";
import { createDraftRevisionFromVariant } from "./note-storage.js";
import { ARCHIVE_RETENTION_DAYS } from "./note-variants.js";

function escapeHTML(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(value);
  }
}

/**
 * @param {string|null|undefined} scheduledDeleteAt
 */
export function formatDaysUntilDeletion(scheduledDeleteAt) {
  if (!scheduledDeleteAt) {
    return `Kept for ${ARCHIVE_RETENTION_DAYS} days`;
  }

  const deleteAt = new Date(scheduledDeleteAt);
  if (Number.isNaN(deleteAt.getTime())) {
    return `Kept for ${ARCHIVE_RETENTION_DAYS} days`;
  }

  const msRemaining = deleteAt.getTime() - Date.now();
  if (msRemaining <= 0) {
    return "Scheduled for removal";
  }

  const days = Math.max(1, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
  return days === 1 ? "1 day left" : `${days} days left`;
}

/**
 * @param {Array<object>} archivedVariants
 * @param {{ activeVariantId?: string|null }} [options]
 */
export function renderVersionHistoryPanel(archivedVariants = [], options = {}) {
  if (!archivedVariants.length) {
    return "";
  }

  const activeVariantId = options.activeVariantId ?? null;

  const rows = archivedVariants
    .map((variant) => {
      const isActive = variant.id === activeVariantId;
      const previewHref = resolveAppPath(
        `note.html?variant=${encodeURIComponent(variant.id)}&mode=archive`
      );
      const retention = formatDaysUntilDeletion(variant.scheduled_delete_at);

      return `
        <li class="note-version-history-item${isActive ? " is-active" : ""}">
          <div class="note-version-history-main">
            <div class="note-version-history-title">${escapeHTML(variant.title)}</div>
            <div class="note-version-history-meta text-muted">
              Archived ${escapeHTML(formatDate(variant.updated_at))}
              · ${escapeHTML(retention)}
            </div>
          </div>
          <div class="note-version-history-actions">
            ${
              isActive
                ? `<span class="note-version-history-current text-muted">Viewing</span>`
                : `<a class="secondary-btn" href="${escapeHTML(previewHref)}">Preview</a>`
            }
            <button
              type="button"
              class="secondary-btn"
              data-restore-variant="${escapeHTML(variant.id)}"
              data-variant-title="${escapeHTML(variant.title)}"
            >Restore as draft</button>
          </div>
        </li>
      `;
    })
    .join("");

  return `
    <section class="note-version-history" aria-label="Archived versions">
      <h3 class="note-version-history-heading">Version history</h3>
      <p class="note-version-history-intro text-muted">
        Previous published versions are kept for ${ARCHIVE_RETENTION_DAYS} days after a new publish.
        Preview read-only or restore into the draft editor.
      </p>
      <ul class="note-version-history-list">${rows}</ul>
    </section>
  `;
}

/**
 * @param {HTMLElement|null} rootEl
 * @param {{ onRestoreStart?: () => void, onRestoreEnd?: () => void, onStatus?: (message: string, isError?: boolean) => void }} [handlers]
 * @returns {() => void}
 */
export function bindRestoreButtons(rootEl, handlers = {}) {
  if (!rootEl) {
    return () => {};
  }

  async function onClick(event) {
    const btn = event.target?.closest?.("[data-restore-variant]");
    if (!btn || !rootEl.contains(btn)) {
      return;
    }

    event.preventDefault();

    const sourceVariantId = btn.getAttribute("data-restore-variant");
    const variantTitle = btn.getAttribute("data-variant-title") || "this version";

    if (!sourceVariantId) {
      return;
    }

    const originalLabel = btn.textContent;
    btn.setAttribute("aria-busy", "true");
    btn.setAttribute("disabled", "disabled");
    btn.textContent = "Restoring…";
    handlers.onRestoreStart?.();

    try {
      const result = await restoreVariantAsDraft(sourceVariantId, { variantTitle });
      if (!result) {
        handlers.onStatus?.("Restore cancelled.");
        return;
      }

      if (result.openDraftId) {
        window.location.href = resolveAppPath(
          `note.html?variant=${encodeURIComponent(result.openDraftId)}&mode=draft`
        );
        return;
      }

      if (result.variant?.id) {
        window.location.href = resolveAppPath(
          `note.html?variant=${encodeURIComponent(result.variant.id)}&mode=draft`
        );
      }
    } catch (err) {
      console.error("[Version history] Restore failed", err);
      handlers.onStatus?.(err?.message || "Unable to restore this version.", true);
      window.alert(err?.message || "Unable to restore this version.");
    } finally {
      btn.textContent = originalLabel || "Restore as draft";
      btn.removeAttribute("aria-busy");
      btn.removeAttribute("disabled");
      handlers.onRestoreEnd?.();
    }
  }

  rootEl.addEventListener("click", onClick);

  return () => {
    rootEl.removeEventListener("click", onClick);
  };
}

/**
 * @param {HTMLElement|null} container
 * @param {{ onRestoreStart?: () => void, onRestoreEnd?: () => void, onStatus?: (message: string, isError?: boolean) => void }} [handlers]
 * @returns {() => void}
 */
export function bindVersionHistoryPanel(container, handlers = {}) {
  return bindRestoreButtons(container, handlers);
}

/**
 * @param {string} sourceVariantId
 * @param {{ variantTitle?: string }} [options]
 */
export async function restoreVariantAsDraft(sourceVariantId, options = {}) {
  const label = options.variantTitle || "this version";

  try {
    return await createDraftRevisionFromVariant(sourceVariantId);
  } catch (err) {
    if (err?.code !== "DRAFT_EXISTS") {
      throw err;
    }

    const replace = window.confirm(
      `A draft already exists for this language.\n\nReplace it with "${label}"? Your current draft content will be overwritten.`
    );

    if (replace) {
      return createDraftRevisionFromVariant(sourceVariantId, {
        replaceDraftId: err.existingDraftId,
      });
    }

    const openExisting = window.confirm("Open the existing draft instead?");
    if (openExisting) {
      return { openDraftId: err.existingDraftId };
    }

    return null;
  }
}

export function renderArchivePreviewBanner(variant, { publishedVariantId } = {}) {
  const retention = formatDaysUntilDeletion(variant?.scheduled_delete_at);
  const publishedHref = publishedVariantId
    ? resolveAppPath(`note.html?variant=${encodeURIComponent(publishedVariantId)}`)
    : null;

  return `
    <div class="note-archive-banner" role="status">
      <div class="note-archive-banner-main">
        <span class="draft-badge">ARCHIVED · ${escapeHTML(retention)}</span>
        <span class="note-archive-banner-text">Read-only preview of a previous published version.</span>
      </div>
      <div class="note-archive-banner-actions">
        ${
          publishedHref
            ? `<a class="secondary-btn" href="${escapeHTML(publishedHref)}">Current published</a>`
            : ""
        }
        <button type="button" class="primary-btn" data-restore-variant="${escapeHTML(variant?.id ?? "")}" data-variant-title="${escapeHTML(variant?.title ?? "")}">
          Restore as draft
        </button>
      </div>
    </div>
  `;
}
