/**
 * Copy QCP question blocks with the PrepOS Malayalam translation prompt for ChatGPT.
 */

import { serializeQuestionsToQcp } from "./question-parser.js";

export const MALAYALAM_TRANSLATION_COPY_PROMPT = `Translate the following question block into Malayalam using cognitive translation model we developed for prepOS.
Rules:
- Keep exact structure: Q1., A) B) C) D), then Answer: and Explanation:
- Use ഉത്തരം: instead of Answer: and വിശദീകരണം: instead of Explanation:
- Do NOT change the answer letter (e.g. if Answer: B, ഉത്തരം: must still be B)
- Do not add commentary — output only the translated block
- Output only the Malayalam block(s) below, ready to paste back into PrepOS.`;

export const MALAYALAM_TRANSLATION_COPY_SEPARATOR = "---";

export function buildMalayalamTranslationClipboard(questions = [], { startIndex = 1 } = {}) {
  const blocks = serializeQuestionsToQcp(questions, { startIndex });

  if (!blocks.trim()) {
    return "";
  }

  return [
    MALAYALAM_TRANSLATION_COPY_PROMPT,
    "",
    MALAYALAM_TRANSLATION_COPY_SEPARATOR,
    "",
    blocks,
  ].join("\n");
}

export async function copyTextToClipboard(text) {
  const payload = String(text ?? "");

  if (!payload.trim()) {
    return { ok: false, error: "Nothing to copy.", text: payload };
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      return { ok: true };
    }
  } catch (_) {
    // fall through to execCommand fallback
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = payload;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (copied) {
      return { ok: true };
    }
  } catch (_) {
    // fall through to manual modal
  }

  return { ok: false, error: "Clipboard blocked — copy manually.", text: payload };
}

let fallbackModalEl = null;

export function showClipboardFallbackModal(text, { title = "Copy manually" } = {}) {
  if (!fallbackModalEl) {
    fallbackModalEl = document.createElement("div");
    fallbackModalEl.className = "qcp-clipboard-fallback hidden";
    fallbackModalEl.innerHTML = `
      <div class="qcp-clipboard-fallback-backdrop" data-action="close"></div>
      <div class="qcp-clipboard-fallback-panel" role="dialog" aria-modal="true">
        <h3 class="qcp-clipboard-fallback-title"></h3>
        <p class="text-muted small">Select all and copy (Ctrl+C), then paste into ChatGPT.</p>
        <textarea class="qcp-clipboard-fallback-text" rows="14" readonly></textarea>
        <div class="flex gap-10 mt-10">
          <button type="button" class="primary-btn" data-action="select">Select all</button>
          <button type="button" class="secondary-btn" data-action="close">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(fallbackModalEl);

    fallbackModalEl.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) {
        return;
      }

      if (action === "select") {
        const textarea = fallbackModalEl.querySelector(".qcp-clipboard-fallback-text");
        textarea?.focus();
        textarea?.select();
      }

      if (action === "close" || event.target.dataset.action === "close") {
        fallbackModalEl.classList.add("hidden");
      }
    });
  }

  fallbackModalEl.querySelector(".qcp-clipboard-fallback-title").textContent = title;
  const textarea = fallbackModalEl.querySelector(".qcp-clipboard-fallback-text");
  textarea.value = String(text ?? "");
  fallbackModalEl.classList.remove("hidden");
  textarea.focus();
  textarea.select();
}

export async function copyMalayalamTranslationPackage(
  questions = [],
  { startIndex = 1, onFallback } = {}
) {
  const payload = buildMalayalamTranslationClipboard(questions, { startIndex });

  if (!payload.trim()) {
    return { ok: false, error: "Question has no content to copy." };
  }

  const result = await copyTextToClipboard(payload);
  if (result.ok) {
    const count = questions.length;
    return {
      ok: true,
      message:
        count === 1
          ? "Copied prompt + QCP question — paste into ChatGPT."
          : `Copied prompt + ${count} QCP questions — paste into ChatGPT.`,
    };
  }

  if (typeof onFallback === "function") {
    onFallback(payload);
  } else {
    showClipboardFallbackModal(payload);
  }

  return {
    ok: false,
    error: result.error,
    usedFallback: true,
    message: "Clipboard blocked — copy from the dialog.",
  };
}
