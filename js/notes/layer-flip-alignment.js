/**
 * Layer flip scroll capture + restore (Phase A/B landing accuracy).
 *
 * Restore priority (cross-language flip):
 *   1. anchor_id  — language-invariant UUID from the nearest visible semantic anchor
 *   2. chronologyDate — dates are language-invariant
 *   3. sectionNumber — heading numbering like "3.2"
 *   4. wikiKeys overlap — data-wiki-anchors (same-language only, text differs across variants)
 *   5. blockSeq — same-language only (sequence_order is independent per variant)
 *   6. structuralId — same-language only
 *   7. ratio / scrollY — last resort
 *
 * Same-language tab switches use blockSeq first (fast, reliable within one variant).
 */

const WIKI_PATTERN = /\[\[([^\]]+)\]\]/g;

const VIEWPORT_ANCHOR_SELECTORS = [
  "p.semantic-paragraph",
  ".semantic-chronology-node",
  ".semantic-timeline-entry",
  ".semantic-recall-qa",
  ".structural-group",
  "article",
  "details",
  ".semantic-inline-block",
  ".semantic-section-heading-only",
  "div.semantic-section-entry",
  ".semantic-paragraph-run",
  "[data-block-seq]",
];

const VIEWPORT_ANCHOR_SELECTOR = VIEWPORT_ANCHOR_SELECTORS.join(", ");

const RESTORE_ELEMENT_RANK = [
  "p.semantic-paragraph",
  ".semantic-chronology-node",
  ".semantic-timeline-entry",
  ".semantic-recall-qa",
  ".structural-group",
  "article",
  "details",
  ".semantic-inline-block",
  ".semantic-section-heading-only",
  "div.semantic-section-entry",
  ".semantic-paragraph-run",
];

const ANCHOR_NOTE_SELECTOR = ".semantic-anchor[data-anchor-id]";
const SEMANTIC_ANCHOR_SELECTOR = ".semantic-anchor";

export function viewportAnchorY() {
  return window.innerHeight * 0.35;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractWikiKeys(text = "") {
  const keys = new Set();
  WIKI_PATTERN.lastIndex = 0;
  let match;
  while ((match = WIKI_PATTERN.exec(String(text))) !== null) {
    const key = match[1].trim().toLowerCase();
    if (key) {
      keys.add(key);
    }
  }
  return [...keys];
}

/**
 * @param {Element} el
 * @returns {string[]}
 */
export function wikiKeysFromElement(el) {
  const keys = new Set();
  const direct = el?.dataset?.wikiAnchors;

  if (direct) {
    for (const key of direct.split(",")) {
      const trimmed = key.trim();
      if (trimmed) {
        keys.add(trimmed);
      }
    }
  }

  if (!keys.size) {
    const sample = String(el?.textContent ?? "").slice(0, 800);
    for (const key of extractWikiKeys(sample)) {
      keys.add(key);
    }
  }

  return [...keys].slice(0, 8);
}

/**
 * Find the nearest semantic anchor note in or near the given block element.
 * @param {Element} blockEl
 * @returns {{ anchorId: string|null, anchorNormalizedName: string|null }}
 */
export function nearestVisibleSemanticAnchor(blockEl) {
  if (!blockEl) {
    return { anchorId: null, anchorNormalizedName: null };
  }

  const findIn = (el) => el?.querySelector?.(SEMANTIC_ANCHOR_SELECTOR) ?? null;

  let note = findIn(blockEl);
  if (!note && blockEl.previousElementSibling) {
    note = findIn(blockEl.previousElementSibling);
  }

  if (!note) {
    return { anchorId: null, anchorNormalizedName: null };
  }

  return {
    anchorId: note.dataset?.anchorId ?? null,
    anchorNormalizedName: note.dataset?.normalizedName ?? null,
  };
}

/**
 * Find the nearest resolved semantic anchor (with anchor_id UUID) in or near
 * the given block element. Checks the element itself, then its previous sibling.
 * @param {Element} blockEl
 * @returns {string|null} anchor_id UUID or null
 */
export function nearestVisibleAnchorId(blockEl) {
  return nearestVisibleSemanticAnchor(blockEl).anchorId;
}

/**
 * @param {Element} el
 */
export function anchorKind(el) {
  if (!el?.matches) {
    return "block";
  }

  if (el.matches("p.semantic-paragraph")) {
    return "paragraph";
  }
  if (el.matches(".semantic-chronology-node")) {
    return "chronology";
  }
  if (el.matches(".semantic-timeline-entry")) {
    return "timeline-entry";
  }
  if (el.matches(".semantic-recall-qa")) {
    return "recall";
  }
  if (el.matches(".structural-group")) {
    return "structural";
  }
  if (el.matches("article")) {
    return "article";
  }
  if (el.matches("details")) {
    return "details";
  }
  if (el.matches(".semantic-section-heading-only, div.semantic-section-entry")) {
    return "section";
  }

  return "block";
}

/**
 * @param {Element} el
 */
export function restoreElementRank(el) {
  if (!el?.matches) {
    return RESTORE_ELEMENT_RANK.length;
  }

  for (let index = 0; index < RESTORE_ELEMENT_RANK.length; index += 1) {
    if (el.matches(RESTORE_ELEMENT_RANK[index])) {
      return index;
    }
  }

  return RESTORE_ELEMENT_RANK.length;
}

/**
 * @param {Element[]} matches
 * @param {object} state
 * @returns {Element|null}
 */
export function pickBestSeqMatch(matches, state = {}) {
  if (!matches?.length) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0];
  }

  let best = matches[0];
  let bestScore = Infinity;

  for (const el of matches) {
    let score = restoreElementRank(el);

    if (state.anchorKind && anchorKind(el) === state.anchorKind) {
      score -= 100;
    }

    if (state.blockType && el.dataset?.blockType === state.blockType) {
      score -= 50;
    }

    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

/**
 * When multiple elements contain the same anchor_id, pick the one closest
 * to the captured scroll ratio (proportional document position).
 * @param {Element[]} candidates
 * @param {number} capturedRatio - 0..1 proportional scroll position from capture
 * @returns {Element|null}
 */
export function pickClosestByRatio(candidates, capturedRatio = 0) {
  if (!candidates?.length) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const docHeight = Math.max(
    1,
    document.documentElement.scrollHeight - window.innerHeight
  );

  let best = candidates[0];
  let bestDist = Infinity;

  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    const elTop = rect.top + window.scrollY;
    const elRatio = elTop / (docHeight + window.innerHeight);
    const dist = Math.abs(elRatio - capturedRatio);

    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  }

  return best;
}

/**
 * @param {Element} el
 * @param {number} viewY
 */
function scoreAnchorCandidate(el, viewY) {
  const rect = el.getBoundingClientRect();
  if (rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
    return Infinity;
  }

  const center = rect.top + rect.height / 2;
  let score = Math.abs(center - viewY);

  if (el.matches("p.semantic-paragraph")) {
    score -= 1200;
  } else if (el.matches(".semantic-chronology-node")) {
    score -= 1000;
  } else if (el.matches(".semantic-timeline-entry")) {
    score -= 950;
  } else if (el.matches(".structural-group")) {
    score -= 800;
  } else if (el.matches("article, details")) {
    score -= 600;
  } else if (el.matches(".semantic-recall-qa, .semantic-section-heading-only")) {
    score -= 500;
  } else if (el.matches("div.semantic-section-entry")) {
    score -= 450;
  } else if (el.matches(".semantic-paragraph-run, .semantic-inline-block")) {
    score -= 400;
  }

  return score;
}

/**
 * @param {Element} el
 * @returns {object|null}
 */
export function readAlignmentFromElement(el) {
  if (!el) {
    return null;
  }

  const anchor = el.closest?.(VIEWPORT_ANCHOR_SELECTOR) ?? el;

  const viewY = viewportAnchorY();
  const rect = anchor.getBoundingClientRect();
  const ratioInElement =
    rect.height > 0 ? (viewY - rect.top) / rect.height : 0;

  const blockSeqRaw = anchor.dataset?.blockSeq ?? el.dataset?.blockSeq;
  const blockSeq =
    blockSeqRaw != null && blockSeqRaw !== "" ? Number(blockSeqRaw) : null;

  const structuralToggle = anchor.closest?.(".structural-group")?.querySelector(
    ":scope > .structural-heading-row .structural-toggle"
  );

  const semanticAnchor = nearestVisibleSemanticAnchor(anchor);

  return {
    el: anchor,
    anchorId: semanticAnchor.anchorId,
    anchorNormalizedName: semanticAnchor.anchorNormalizedName,
    blockSeq: Number.isFinite(blockSeq) ? blockSeq : null,
    blockType: anchor.dataset?.blockType ?? null,
    anchorKind: anchorKind(anchor),
    ratioInElement: Math.min(1, Math.max(0, ratioInElement)),
    structuralId: structuralToggle?.dataset?.structuralId ?? null,
    chronologyDate:
      anchor.dataset?.chronologyDate ??
      anchor.querySelector?.(".semantic-chronology-date")?.textContent?.trim() ??
      null,
    sectionNumber: anchor.dataset?.sectionNumber ?? null,
    wikiKeys: wikiKeysFromElement(anchor),
  };
}

/**
 * @param {HTMLElement} container
 * @returns {ReturnType<typeof readAlignmentFromElement>|null}
 */
export function findViewportBlockAnchor(container) {
  if (!container) {
    return null;
  }

  const viewY = viewportAnchorY();
  const candidates = container.querySelectorAll(VIEWPORT_ANCHOR_SELECTOR);

  let best = null;
  let bestScore = Infinity;

  for (const el of candidates) {
    const score = scoreAnchorCandidate(el, viewY);
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return readAlignmentFromElement(best);
}

/**
 * @param {HTMLElement} container
 */
export function captureLayerScrollState(container) {
  const scrollY = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = docHeight > 0 ? scrollY / docHeight : 0;
  const anchor = findViewportBlockAnchor(container);

  return {
    anchorId: anchor?.anchorId ?? null,
    anchorNormalizedName: anchor?.anchorNormalizedName ?? null,
    blockSeq: anchor?.blockSeq ?? null,
    blockType: anchor?.blockType ?? null,
    anchorKind: anchor?.anchorKind ?? null,
    ratioInElement: anchor?.ratioInElement ?? null,
    structuralId: anchor?.structuralId ?? null,
    chronologyDate: anchor?.chronologyDate ?? null,
    sectionNumber: anchor?.sectionNumber ?? null,
    wikiKeys: anchor?.wikiKeys ?? [],
    ratio,
    scrollY,
  };
}

/**
 * @param {Element} target
 */
export function expandStructuralAncestors(target) {
  if (!target) {
    return;
  }

  let group = target.closest?.(".structural-group");
  while (group) {
    const toggle = group.querySelector(
      ":scope > .structural-heading-row .structural-toggle"
    );
    const panel = group.querySelector(":scope > .structural-content");

    if (toggle && panel?.classList.contains("collapsed")) {
      toggle.setAttribute("aria-expanded", "true");
      panel.classList.remove("collapsed");
      const indicator = toggle.querySelector(".structural-indicator");
      if (indicator) {
        indicator.textContent = "−";
      }
    }

    group = group.parentElement?.closest?.(".structural-group") ?? null;
  }
}

/**
 * @param {Element} target
 */
export function expandSemanticCollapsibleAncestors(target) {
  if (!target) {
    return;
  }

  let details = target.closest?.("details.semantic-collapsible");
  while (details) {
    if (!details.open) {
      details.open = true;
    }

    details = details.parentElement?.closest?.("details.semantic-collapsible") ?? null;
  }
}

function blockParentForSemanticAnchor(el) {
  return (
    el.closest(
      "[data-block-seq], p.semantic-paragraph, article, details, .structural-group, .semantic-chronology-node, .semantic-timeline-entry"
    ) ?? el
  );
}

function findBySemanticAnchorMatches(container, selector, ratio = 0) {
  const matches = container.querySelectorAll(selector);
  if (!matches.length) {
    return null;
  }

  const blockParents = [...matches].map(blockParentForSemanticAnchor);
  return pickClosestByRatio(blockParents, ratio);
}

/**
 * Restore by anchor_id — the primary cross-language homing signal.
 * Finds `.semantic-anchor[data-anchor-id="UUID"]` in the target content,
 * then returns its containing block element for scroll alignment.
 * @param {HTMLElement} container
 * @param {string} anchorId
 * @param {number} ratio - captured scroll ratio for positional tiebreaking
 * @returns {Element|null}
 */
function findByAnchorId(container, anchorId, ratio = 0) {
  return findBySemanticAnchorMatches(
    container,
    `${ANCHOR_NOTE_SELECTOR}[data-anchor-id="${CSS.escape(anchorId)}"]`,
    ratio
  );
}

/**
 * Same-language fallback when anchor_id is unavailable (candidate/dormant anchors).
 * @param {HTMLElement} container
 * @param {string} normalizedName
 * @param {number} ratio
 * @returns {Element|null}
 */
function findByNormalizedName(container, normalizedName, ratio = 0) {
  return findBySemanticAnchorMatches(
    container,
    `.semantic-anchor[data-normalized-name="${CSS.escape(normalizedName)}"]`,
    ratio
  );
}

function findByBlockSeq(container, state) {
  if (state.blockSeq == null) {
    return null;
  }

  const bySeq = container.querySelectorAll(
    `[data-block-seq="${CSS.escape(String(state.blockSeq))}"]`
  );
  return pickBestSeqMatch([...bySeq], state);
}

/**
 * @param {HTMLElement} container
 * @param {object} state
 * @param {object} [options]
 * @param {boolean} [options.crossLanguage] - true when flipping between languages
 * @returns {Element|null}
 */
export function findRestoreTarget(container, state = {}, options = {}) {
  if (!container) {
    return null;
  }

  const crossLanguage = Boolean(options.crossLanguage);
  const ratio = state.ratio ?? 0;

  if (crossLanguage && state.anchorId) {
    const byAnchor = findByAnchorId(container, state.anchorId, ratio);
    if (byAnchor) {
      return byAnchor;
    }
  }

  if (!crossLanguage) {
    const bySeq = findByBlockSeq(container, state);
    if (bySeq) {
      return bySeq;
    }
  }

  if (state.chronologyDate) {
    const byDate = container.querySelector(
      `[data-chronology-date="${CSS.escape(String(state.chronologyDate))}"]`
    );
    if (byDate) {
      return byDate;
    }
  }

  if (state.sectionNumber) {
    const bySection = container.querySelectorAll(
      `[data-section-number="${CSS.escape(String(state.sectionNumber))}"]`
    );
    const bestSectionMatch = pickBestSeqMatch([...bySection], state);
    if (bestSectionMatch) {
      return bestSectionMatch;
    }
  }

  if (state.wikiKeys?.length) {
    const marked = container.querySelectorAll("[data-wiki-anchors]");
    let best = null;
    let bestOverlap = 0;

    for (const el of marked) {
      const keys = new Set(
        (el.dataset.wikiAnchors ?? "")
          .split(",")
          .map((key) => key.trim())
          .filter(Boolean)
      );
      const overlap = state.wikiKeys.filter((key) => keys.has(key)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = el;
      }
    }

    if (best) {
      return best;
    }
  }

  if (!crossLanguage && state.anchorId) {
    const byAnchor = findByAnchorId(container, state.anchorId, ratio);
    if (byAnchor) {
      return byAnchor;
    }
  }

  if (!crossLanguage && state.anchorNormalizedName) {
    const byName = findByNormalizedName(
      container,
      state.anchorNormalizedName,
      ratio
    );
    if (byName) {
      return byName;
    }
  }

  if (crossLanguage) {
    const bySeq = findByBlockSeq(container, state);
    if (bySeq) {
      return bySeq;
    }
  }

  if (state.structuralId) {
    const toggle = container.querySelector(
      `[data-structural-id="${CSS.escape(String(state.structuralId))}"]`
    );
    if (toggle) {
      return toggle.closest(".structural-group") ?? toggle;
    }
  }

  return null;
}

/**
 * @param {Element} target
 * @param {number|null|undefined} ratioInElement
 */
export function scrollToAlignmentTarget(target, ratioInElement = 0) {
  expandStructuralAncestors(target);
  expandSemanticCollapsibleAncestors(target);

  const rect = target.getBoundingClientRect();
  const viewY = viewportAnchorY();
  const elementTop = rect.top + window.scrollY;
  const clampedRatio = Math.min(1, Math.max(0, ratioInElement ?? 0));
  const offsetInElement = clampedRatio * Math.max(rect.height, 1);
  const targetScroll = elementTop + offsetInElement - viewY;

  window.scrollTo({
    top: Math.max(0, targetScroll),
    left: 0,
    behavior: "instant",
  });
}

function applyLayerScrollRestore(container, state = {}, options = {}) {
  const target = findRestoreTarget(container, state, options);
  if (target) {
    scrollToAlignmentTarget(target, state.ratioInElement);
    return true;
  }

  if (state.ratio != null) {
    const max = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    window.scrollTo({
      top: state.ratio * max,
      left: 0,
      behavior: "instant",
    });
    return true;
  }

  if (state.scrollY != null) {
    window.scrollTo({ top: state.scrollY, left: 0, behavior: "instant" });
    return true;
  }

  return false;
}

/**
 * @param {HTMLElement} container
 * @param {object} state
 * @param {object} [options]
 * @param {boolean} [options.crossLanguage]
 */
export function restoreLayerScrollState(container, state = {}, options = {}) {
  const run = () => {
    applyLayerScrollRestore(container, state, options);
  };

  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(() => {
      run();
      window.setTimeout(run, 50);
    });
  });
}
