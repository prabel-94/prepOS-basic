/**
 * Overlay lifecycle orchestration helpers (workflow semantics on top of modal-system).
 * Minimal, composable, and compatible with existing overlay stack behavior.
 */

import { closeModal, isModalOpen } from "./modal-system.js";
import { suppressNextReadingRestore } from "../notes/reading-ergonomics.js";

/**
 * Replace one overlay with another workflow surface.
 *
 * Typical use: inspector → editor (avoid stacked overlays).
 *
 * @param {object} options
 * @param {HTMLElement|string|null} options.fromOverlay
 * @param {() => void|Promise<void>} options.openNext
 * @param {boolean} [options.suppressReadingRestore]
 */
export async function replaceOverlay({
  fromOverlay,
  openNext,
  suppressReadingRestore: suppressRestore = false,
} = {}) {
  if (suppressRestore) {
    suppressNextReadingRestore();
  }

  if (fromOverlay && isModalOpen(fromOverlay)) {
    closeModal(fromOverlay);
  }

  await openNext?.();
}

