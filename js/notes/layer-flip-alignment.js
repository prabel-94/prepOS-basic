/**
 * Layer flip scroll capture + restore (Phase A/B landing accuracy).
 */

const WIKI_PATTERN = /\[\[([^\]]+)\]\]/g;

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
  } else if (el.matches(".structural-group")) {
    score -= 800;
  } else if (el.matches("article, details")) {
    score -= 600;
  } else if (el.matches(".semantic-paragraph-run")) {
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

  const anchor =
    el.closest?.(
      "p.semantic-paragraph, .semantic-chronology-node, .structural-group, article, details, .semantic-paragraph-run, [data-block-seq]"
    ) ?? el;

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

  return {
    el: anchor,
    blockSeq: Number.isFinite(blockSeq) ? blockSeq : null,
    blockType: anchor.dataset?.blockType ?? null,
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
  const candidates = container.querySelectorAll(
    "p.semantic-paragraph, .semantic-chronology-node, .structural-group, article, details, .semantic-paragraph-run, [data-block-seq]"
  );

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
    blockSeq: anchor?.blockSeq ?? null,
    blockType: anchor?.blockType ?? null,
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
 * @param {HTMLElement} container
 * @param {object} state
 * @returns {Element|null}
 */
export function findRestoreTarget(container, state = {}) {
  if (!container) {
    return null;
  }

  if (state.blockSeq != null) {
    const bySeq = container.querySelector(
      `[data-block-seq="${CSS.escape(String(state.blockSeq))}"]`
    );
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

  if (state.structuralId) {
    const toggle = container.querySelector(
      `[data-structural-id="${CSS.escape(String(state.structuralId))}"]`
    );
    if (toggle) {
      return toggle.closest(".structural-group") ?? toggle;
    }
  }

  if (state.sectionNumber) {
    const bySection = container.querySelector(
      `[data-section-number="${CSS.escape(String(state.sectionNumber))}"]`
    );
    if (bySection) {
      return bySection;
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

  return null;
}

/**
 * @param {Element} target
 * @param {number|null|undefined} ratioInElement
 */
export function scrollToAlignmentTarget(target, ratioInElement = 0) {
  expandStructuralAncestors(target);

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

function applyLayerScrollRestore(container, state = {}) {
  const target = findRestoreTarget(container, state);
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
 */
export function restoreLayerScrollState(container, state = {}) {
  const run = () => {
    applyLayerScrollRestore(container, state);
  };

  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(() => {
      run();
      window.setTimeout(run, 50);
    });
  });
}
