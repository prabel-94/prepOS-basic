/**
 * Bilingual MSMDF layer flip — full section (Narrative→Narrative, etc.) without loading whole variant.
 */

import { getClient } from "../core/get-client.js";
import { enrichSemanticMapWithAnchorNotePresence } from "../anchors/anchor-selectors.js";
import {
  bindPublishedSemanticReading,
  preparePublishedStudentSemanticMap,
} from "../anchors/anchor-student-reader.js";
import { fetchRepresentationLayer } from "./note-selectors.js";
import {
  bindStructuralCollapse,
  getAvailableTabs,
  renderRepresentationTab,
} from "./note-renderer.js";
import { withReadingErgonomics } from "./reading-ergonomics.js";
import {
  getLanguageLabel,
  normalizeLanguage,
  SUPPORTED_LANGUAGES,
} from "./note-variants.js";

/**
 * @param {HTMLElement} container
 * @returns {{ blockSeq: number|null, ratio: number, scrollY: number }}
 */
export function captureLayerScrollState(container) {
  const scrollY = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = docHeight > 0 ? scrollY / docHeight : 0;
  const anchor = findViewportBlockAnchor(container);

  return {
    blockSeq: anchor?.blockSeq ?? null,
    ratio,
    scrollY,
  };
}

/**
 * @param {HTMLElement} container
 * @returns {{ blockSeq: number, el: Element }|null}
 */
export function findViewportBlockAnchor(container) {
  if (!container) {
    return null;
  }

  const marks = container.querySelectorAll("[data-block-seq]");
  if (!marks.length) {
    return null;
  }

  const viewMid = window.innerHeight * 0.35;

  for (const el of marks) {
    const rect = el.getBoundingClientRect();
    if (rect.top <= viewMid && rect.bottom >= viewMid) {
      return { blockSeq: Number(el.dataset.blockSeq), el };
    }
  }

  for (const el of marks) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) {
      return { blockSeq: Number(el.dataset.blockSeq), el };
    }
  }

  return null;
}

/**
 * @param {HTMLElement} container
 * @param {{ blockSeq?: number|null, ratio?: number, scrollY?: number }} state
 */
export function restoreLayerScrollState(container, state = {}) {
  requestAnimationFrame(() => {
    if (state.blockSeq != null) {
      const target = container?.querySelector(
        `[data-block-seq="${CSS.escape(String(state.blockSeq))}"]`
      );
      if (target) {
        target.scrollIntoView({ block: "start", behavior: "instant" });
        return;
      }
    }

    if (state.ratio != null) {
      const max = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      window.scrollTo({ top: state.ratio * max, left: 0, behavior: "instant" });
      return;
    }

    if (state.scrollY != null) {
      window.scrollTo({ top: state.scrollY, left: 0, behavior: "instant" });
    }
  });
}

function siblingLanguage(language) {
  const normalized = normalizeLanguage(language);
  return normalized === "malayalam" ? "english" : "malayalam";
}

function flipButtonLabel(language) {
  return normalizeLanguage(language) === "malayalam" ? "മലയാളം" : "English";
}

function resolveSiblingVariant(variants, primaryLanguage) {
  const target = siblingLanguage(primaryLanguage);
  return (
    variants.find(
      (variant) =>
        normalizeLanguage(variant.language) === target &&
        variant.status === "published"
    ) ?? null
  );
}

function scrollMemoryKey(language, tab) {
  return `${normalizeLanguage(language)}:${tab}`;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.contentEl
 * @param {HTMLElement|null} [options.contentWrapEl]
 * @param {HTMLElement|null} [options.flipBarEl]
 * @param {object} options.primaryBundle
 * @param {Array} options.variants
 * @param {boolean} [options.enabled]
 * @param {boolean} [options.isStudent]
 * @param {boolean} [options.isTeacher]
 * @param {() => string} options.getActiveTab
 * @param {() => Array<{ key: string, label: string }>} options.getTabs
 */
export function createLayerFlipReading({
  contentEl,
  contentWrapEl,
  flipBarEl,
  primaryBundle,
  variants,
  enabled = true,
  isStudent = false,
  isTeacher = false,
  getActiveTab,
  getTabs,
}) {
  const flipEnabled = Boolean(enabled);
  const primaryLanguage = normalizeLanguage(primaryBundle.variant.language);
  const siblingVariant = resolveSiblingVariant(variants, primaryLanguage);

  const layerCache = new Map();
  const semanticMapCache = new Map();
  const scrollMemory = new Map();

  let contentLanguage = primaryLanguage;
  let pendingFlipRestore = null;
  let rendering = false;

  function cacheKey(variantId, tab) {
    return `${variantId}:${tab}`;
  }

  function updateFlipBar(tab) {
    if (!flipEnabled || !flipBarEl || !siblingVariant) {
      flipBarEl?.classList.add("hidden");
      return;
    }

    const tabMeta = getTabs().find((entry) => entry.key === tab);
    const tabLabel = tabMeta?.label ?? tab;
    const targetLanguage = siblingLanguage(contentLanguage);
    const btn = flipBarEl.querySelector("[data-layer-flip-toggle]");
    const hint = flipBarEl.querySelector("[data-layer-flip-hint]");

    flipBarEl.classList.remove("hidden");

    if (btn) {
      btn.disabled = rendering;
      btn.textContent = flipButtonLabel(targetLanguage);
      btn.setAttribute(
        "aria-label",
        `Read ${tabLabel} in ${getLanguageLabel(targetLanguage)}`
      );
    }

    if (hint) {
      hint.textContent = `${tabLabel} · ${getLanguageLabel(contentLanguage)}`;
    }
  }

  async function loadSemanticMap(variantId, language) {
    const key = cacheKey(variantId, "semantic");
    if (semanticMapCache.has(key)) {
      return semanticMapCache.get(key);
    }

    let semanticMap = await preparePublishedStudentSemanticMap(variantId, language);

    if (isTeacher && semanticMap && Object.keys(semanticMap).length) {
      try {
        const sb = await getClient();
        semanticMap = await enrichSemanticMapWithAnchorNotePresence(
          sb,
          semanticMap,
          language
        );
      } catch (err) {
        console.warn("[Layer flip semantic map]", err);
      }
    }

    semanticMapCache.set(key, semanticMap ?? {});
    return semanticMap ?? {};
  }

  function buildRenderOptions(language, semanticMap, variantId) {
    const base = withReadingErgonomics({ preferLanguage: language });

    if (!semanticMap || !Object.keys(semanticMap).length) {
      return base;
    }

    return withReadingErgonomics({
      preferLanguage: language,
      semanticMap,
      semanticPreview: true,
      semanticInteractive: true,
      studentMode: Boolean(isStudent),
      highlightEmptyAnchorNotes: Boolean(isTeacher),
    });
  }

  function captureBeforeLeave(tab = getActiveTab()) {
    const state = captureLayerScrollState(contentEl);
    scrollMemory.set(scrollMemoryKey(contentLanguage, tab), state);
    return state;
  }

  async function ensureLayerData(language, tab) {
    const variantId =
      language === primaryLanguage
        ? primaryBundle.variant.id
        : siblingVariant?.id;

    if (!variantId) {
      return null;
    }

    const key = cacheKey(variantId, tab);
    if (layerCache.has(key)) {
      return layerCache.get(key);
    }

    if (language === primaryLanguage) {
      const blocks = primaryBundle.representations[tab] ?? [];
      const payload = {
        variantId,
        language,
        blocks,
        representations: primaryBundle.representations,
        topicMap: primaryBundle.topicMap,
        sectionExtensions: primaryBundle.sectionExtensions ?? [],
      };
      layerCache.set(key, payload);
      return payload;
    }

    const layer = await fetchRepresentationLayer(variantId, tab);
    if (!layer) {
      return null;
    }

    const payload = {
      variantId,
      language,
      blocks: layer.blocks,
      representations: layer.representations,
      topicMap: layer.topicMap,
      sectionExtensions: layer.sectionExtensions ?? [],
    };
    layerCache.set(key, payload);
    return payload;
  }

  async function renderActiveTab({ restoreFrom = null } = {}) {
    const tab = getActiveTab();
    rendering = true;
    updateFlipBar(tab);

    try {
      const layerData = await ensureLayerData(contentLanguage, tab);

      contentEl.classList.remove("hidden");
      contentEl.classList.add("semantic-reading-surface");

      if (!layerData?.blocks?.length) {
        const label = getLanguageLabel(contentLanguage);
        contentEl.innerHTML = `<p class="canonical-empty">No ${label} content in this section yet.</p>`;
        updateFlipBar(tab);
        return;
      }

      const semanticMap = await loadSemanticMap(layerData.variantId, contentLanguage);
      const renderOptions = buildRenderOptions(
        contentLanguage,
        semanticMap,
        layerData.variantId
      );

      contentEl.innerHTML = renderRepresentationTab(
        tab,
        layerData.representations,
        layerData.topicMap,
        renderOptions,
        { customDefinitions: layerData.sectionExtensions }
      );

      if (tab === "structural") {
        bindStructuralCollapse(contentEl);
      }

      if (semanticMap && Object.keys(semanticMap).length) {
        bindPublishedSemanticReading(contentEl, {
          semanticMap,
          preferLanguage: contentLanguage,
          role: isStudent ? "student" : isTeacher ? "teacher" : "admin",
          governanceContext:
            isStudent
              ? null
              : {
                  noteId: primaryBundle.variant.note_id,
                  variantId: layerData.variantId,
                  language: contentLanguage,
                },
        });
      }

      const saved =
        restoreFrom ??
        scrollMemory.get(scrollMemoryKey(contentLanguage, tab)) ??
        pendingFlipRestore;
      pendingFlipRestore = null;

      if (saved) {
        restoreLayerScrollState(contentEl, saved);
      }
    } finally {
      rendering = false;
      updateFlipBar(tab);
    }
  }

  async function toggleLanguage() {
    if (!siblingVariant || rendering) {
      return;
    }

    const tab = getActiveTab();
    const leavingState = captureBeforeLeave(tab);
    const nextLanguage = siblingLanguage(contentLanguage);

    if (!SUPPORTED_LANGUAGES.includes(nextLanguage) || !siblingVariant) {
      return;
    }

    contentWrapEl?.classList.add("is-flipping");

    pendingFlipRestore =
      scrollMemory.get(scrollMemoryKey(nextLanguage, tab)) ?? {
        blockSeq: leavingState.blockSeq,
        ratio: leavingState.ratio,
      };

    contentLanguage = nextLanguage;
    await renderActiveTab();

    window.setTimeout(() => {
      contentWrapEl?.classList.remove("is-flipping");
    }, 450);
  }

  function bindFlipControl() {
    if (!flipEnabled || !flipBarEl || !siblingVariant) {
      flipBarEl?.classList.add("hidden");
      return () => {};
    }

    const btn = flipBarEl.querySelector("[data-layer-flip-toggle]");
    if (!btn || btn.dataset.bound === "true") {
      return () => {};
    }

    btn.dataset.bound = "true";
    const handler = () => {
      toggleLanguage().catch((err) => {
        console.error("[Layer flip]", err);
      });
    };
    btn.addEventListener("click", handler);
    updateFlipBar(getActiveTab());

    return () => btn.removeEventListener("click", handler);
  }

  function isEnabled() {
    return flipEnabled && Boolean(siblingVariant);
  }

  function resetContentLanguage() {
    contentLanguage = primaryLanguage;
    pendingFlipRestore = null;
  }

  return {
    isEnabled,
    bindFlipControl,
    captureBeforeLeave,
    renderActiveTab,
    toggleLanguage,
    resetContentLanguage,
    updateFlipBar,
  };
}
