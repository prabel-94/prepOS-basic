import { copyTextToClipboard } from "../core/malayalam-copy.js?v=20260602";
import { openModal, closeModal } from "./modal-system.js";

const DIALOG_ID = "malayalamCopyDialog";

function ensureMalayalamCopyDialog() {
  let dialog = document.getElementById(DIALOG_ID);
  if (dialog) {
    return dialog;
  }

  dialog = document.createElement("div");
  dialog.id = DIALOG_ID;
  dialog.className = "prepos-modal hidden";
  dialog.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content prepos-modal-content--wide">
      <div class="prepos-modal-header">
        <h2 class="h2">Copy for Malayalam translation</h2>
      </div>
      <div class="prepos-modal-body">
        <p class="text-muted small">
          Copy this entire text into ChatGPT or Claude. Paste the Malayalam output back into PrepOS
          (bulk Malayalam paste or per-card Malayalam editor).
        </p>
        <textarea
          id="malayalam-copy-dialog-text"
          class="malayalam-copy-dialog-text"
          rows="18"
          spellcheck="false"
          aria-label="Translation prompt and English question blocks"
        ></textarea>
      </div>
      <div class="prepos-modal-footer">
        <button type="button" class="secondary-btn" id="malayalam-copy-dialog-copy">
          Copy to clipboard
        </button>
        <button type="button" class="primary-btn" id="malayalam-copy-dialog-close">
          Close
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog.querySelector("#malayalam-copy-dialog-close")?.addEventListener("click", () => {
    closeModal(DIALOG_ID);
  });

  dialog.querySelector("#malayalam-copy-dialog-copy")?.addEventListener("click", async () => {
    const textarea = dialog.querySelector("#malayalam-copy-dialog-text");
    const value = textarea?.value || "";
    const statusEl = dialog.querySelector("#malayalam-copy-dialog-status");
    const result = await copyTextToClipboard(value);

    if (statusEl) {
      statusEl.textContent = result.ok
        ? "Copied to clipboard."
        : "Copy failed — select all in the box and copy manually.";
      statusEl.classList.remove("hidden");
    }
  });

  const status = document.createElement("p");
  status.id = "malayalam-copy-dialog-status";
  status.className = "text-muted small mt-5 hidden";
  dialog.querySelector(".prepos-modal-body")?.appendChild(status);

  return dialog;
}

/**
 * Show the full translation prompt + English QCP so authors can verify the latest rules.
 * @param {string} text
 */
export function showMalayalamTranslationCopyDialog(text) {
  if (typeof document === "undefined") {
    return;
  }

  const dialog = ensureMalayalamCopyDialog();
  const textarea = dialog.querySelector("#malayalam-copy-dialog-text");
  const statusEl = dialog.querySelector("#malayalam-copy-dialog-status");

  if (textarea) {
    textarea.value = String(text ?? "");
  }

  if (statusEl) {
    statusEl.textContent = "";
    statusEl.classList.add("hidden");
  }

  openModal(dialog, { overlayType: "modal" });

  requestAnimationFrame(() => {
    textarea?.focus();
    textarea?.select();
  });
}
