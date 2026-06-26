/**
 * Topic Notes section for teacher and student home pages (variant-aware).
 */

import { getClient } from "../core/get-client.js";
import { resolveAppPath } from "../core/access.js";
import { buildNoteStudentPreviewHref } from "../core/student-preview.js";
import { getLanguageLabel, normalizeLanguage } from "./note-variants.js";
import { saveNoteVariant } from "./note-storage.js";

function escapeHTML(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatUpdatedAt(value) {
  if (!value) {
    return "";
  }

  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * @param {"teacher"|"student"|"admin"} role
 */
export async function fetchNotesForHome(role, limit = 30) {
  const sb = await getClient();

  let query = sb
    .from("note_variants")
    .select(
      `
      id,
      language,
      title,
      status,
      updated_at,
      note_id,
      notes (
        id,
        topic_id,
        title,
        topics ( id, name )
      )
    `
    )
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (role === "student") {
    query = query.eq("status", "published");
  }

  if (role === "preview-student") {
    query = query.eq("status", "published");
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

function groupByCanonicalNote(rows = []) {
  const map = new Map();

  for (const row of rows) {
    const noteId = row.notes?.id ?? row.note_id;
    if (!noteId) {
      continue;
    }

    if (!map.has(noteId)) {
      map.set(noteId, {
        note: row.notes,
        variants: [],
      });
    }

    map.get(noteId).variants.push(row);
  }

  return [...map.values()];
}

function resolveVariantHref(variant, role) {
  if (role === "preview-student") {
    const topicId = variant.notes?.topic_id;
    const lang = normalizeLanguage(variant.language);

    if (topicId) {
      return buildNoteStudentPreviewHref({ topicId, lang });
    }

    return buildNoteStudentPreviewHref({ variantId: variant.id });
  }

  if (role === "teacher" || role === "admin") {
    if (variant.status === "draft") {
      return resolveAppPath(
        `note.html?variant=${encodeURIComponent(variant.id)}&mode=draft`
      );
    }
  }

  const topicId = variant.notes?.topic_id;
  const lang = normalizeLanguage(variant.language);

  if (topicId) {
    return resolveAppPath(
      `note.html?topic=${encodeURIComponent(topicId)}&lang=${encodeURIComponent(lang)}`
    );
  }

  return resolveAppPath(`note.html?variant=${encodeURIComponent(variant.id)}`);
}

async function openDraftWorkspaceFromPublished({ topicId, language, title, publishedVariantId }) {
  const sb = await getClient();
  const normalizedLanguage = normalizeLanguage(language);

  const { data: source, error } = await sb
    .from("note_sources")
    .select("raw_markdown")
    .eq("variant_id", publishedVariantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const rawMarkdown = source?.raw_markdown ?? "";
  if (!rawMarkdown.trim()) {
    throw new Error("Unable to create draft: published source markdown not found.");
  }

  const result = await saveNoteVariant({
    topicId,
    title,
    language: normalizedLanguage,
    status: "draft",
    rawMarkdown,
    parsed: null,
  });

  const variantId = result?.variant?.id;
  if (!variantId) {
    throw new Error("Unable to create draft: draft variant id missing.");
  }

  window.location.href = resolveAppPath(
    `note.html?variant=${encodeURIComponent(variantId)}&mode=draft`
  );
}

function bindDraftButtons(container) {
  if (!container || container.dataset.draftButtonsBound === "true") {
    return;
  }

  container.dataset.draftButtonsBound = "true";

  container.addEventListener("click", async (event) => {
    const btn = event.target?.closest?.("[data-view-draft]");
    if (!btn || !container.contains(btn)) {
      return;
    }

    event.preventDefault();

    const topicId = btn.getAttribute("data-topic-id") || "";
    const language = btn.getAttribute("data-language") || "english";
    const title = btn.getAttribute("data-title") || "Untitled Note";
    const draftId = btn.getAttribute("data-draft-id") || "";
    const publishedVariantId = btn.getAttribute("data-published-variant-id") || "";

    if (draftId) {
      window.location.href = resolveAppPath(
        `note.html?variant=${encodeURIComponent(draftId)}&mode=draft`
      );
      return;
    }

    if (!topicId || !publishedVariantId) {
      console.warn("[Topic Notes] Missing draft creation inputs.");
      return;
    }

    const originalLabel = btn.textContent;
    btn.setAttribute("aria-busy", "true");
    btn.setAttribute("disabled", "disabled");
    btn.textContent = "Creating…";

    try {
      await openDraftWorkspaceFromPublished({
        topicId,
        language,
        title,
        publishedVariantId,
      });
    } catch (err) {
      console.error("[Topic Notes] Create draft from published failed", err);
      btn.textContent = "View draft";
      btn.removeAttribute("aria-busy");
      btn.removeAttribute("disabled");
      window.alert(err?.message || "Unable to create draft right now.");
    } finally {
      btn.textContent = originalLabel || "View draft";
    }
  });
}

export function renderTopicNotesList(container, grouped = [], role = "student") {
  if (!container) {
    return;
  }

  if (!grouped.length) {
    const hint =
      role === "student" || role === "preview-student"
        ? "No published topic notes yet."
        : "No canonical notes yet. Import from Question Bank → Import canonical note.";

    container.innerHTML = `<div class="empty-state">${escapeHTML(hint)}</div>`;
    return;
  }

  container.innerHTML = grouped
    .map(({ note, variants }) => {
      const topicName = note?.topics?.name ?? note?.title ?? "Topic";
      const variantLines = variants
        .map((v) => {
          const href = resolveVariantHref(v, role);
          const lang = getLanguageLabel(v.language);
          const status =
            role === "student" || role === "preview-student"
              ? ""
              : ` <span class="topic-note-status topic-note-status--${escapeHTML(v.status)}">${escapeHTML(v.status)}</span>`;
          const updated = formatUpdatedAt(v.updated_at);

          const isStaff = role === "teacher" || role === "admin";
          const draftSibling =
            isStaff && v.status === "published"
              ? variants.find(
                  (candidate) =>
                    candidate.status === "draft" &&
                    normalizeLanguage(candidate.language) === normalizeLanguage(v.language)
                )
              : null;

          return `
            <div class="topic-note-row recent-item mt-10">
              <div class="topic-note-row-main">
                <div><b>${escapeHTML(lang)}</b>${status}</div>
                <div class="topic-note-meta text-muted">${escapeHTML(v.title)}${updated ? ` · ${escapeHTML(updated)}` : ""}</div>
              </div>
              <div class="topic-note-row-actions flex gap-10">
                <a class="secondary-btn" href="${escapeHTML(href)}">${
                  role === "student" || role === "preview-student"
                    ? "Read"
                    : v.status === "draft"
                      ? "Refine"
                      : "Read"
                }</a>
                ${
                  isStaff && v.status === "published"
                    ? `<button
                        type="button"
                        class="secondary-btn"
                        data-view-draft="true"
                        data-topic-id="${escapeHTML(v.notes?.topic_id)}"
                        data-language="${escapeHTML(v.language)}"
                        data-title="${escapeHTML(v.title)}"
                        data-published-variant-id="${escapeHTML(v.id)}"
                        ${draftSibling?.id ? `data-draft-id="${escapeHTML(draftSibling.id)}"` : ""}
                      >View draft</button>`
                    : ""
                }
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="topic-notes-canonical-group mt-10">
          <div class="h3">${escapeHTML(topicName)}</div>
          ${variantLines}
        </div>
      `;
    })
    .join("");

  if (role === "teacher" || role === "admin") {
    bindDraftButtons(container);
  }
}

export async function loadTopicNotesSection(container, { role = "student", limit = 30 } = {}) {
  if (!container) {
    return;
  }

  container.innerHTML = '<div class="text-muted">Loading topic notes…</div>';

  try {
    const rows = await fetchNotesForHome(role, limit);
    const grouped = groupByCanonicalNote(rows);
    renderTopicNotesList(container, grouped, role);
  } catch (error) {
    console.error("[Topic Notes home]", error);

    const message =
      error?.code === "42P01" || error?.message?.includes("note_variants")
        ? "Topic notes require the latest database migrations."
        : "Unable to load topic notes right now.";

    container.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
  }
}
