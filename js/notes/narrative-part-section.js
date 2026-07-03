/**
 * Narrative "Part / ഭാഗം" sections — collapsible for scroll relief, open by default.
 */

const ENGLISH_PART_HEADING =
  /^part\s+(I{1,3}|IV|VI{0,3}|IX|X|[1-4])\b/i;

const MALAYALAM_PART_HEADING =
  /^ഭാഗം\s+(I{1,3}|IV|VI{0,3}|IX|X|[1-4])\b/i;

const STORAGE_PREFIX = "prepos:narrative-parts:";

/**
 * @param {string} heading
 */
export function isNarrativePartHeading(heading) {
  const trimmed = String(heading ?? "").trim();
  if (!trimmed) {
    return false;
  }

  return ENGLISH_PART_HEADING.test(trimmed) || MALAYALAM_PART_HEADING.test(trimmed);
}

/**
 * Stable slug for localStorage (part-i … part-iv, bhagam-i …).
 * @param {string} heading
 */
export function narrativePartSlug(heading) {
  const trimmed = String(heading ?? "").trim();
  const english = trimmed.match(ENGLISH_PART_HEADING);
  if (english) {
    return `part-${english[1].toLowerCase()}`;
  }

  const malayalam = trimmed.match(MALAYALAM_PART_HEADING);
  if (malayalam) {
    return `bhagam-${malayalam[1].toLowerCase()}`;
  }

  return null;
}

function storageKey(variantId, language) {
  return `${STORAGE_PREFIX}${variantId}:${String(language ?? "english").toLowerCase()}`;
}

function loadPartState(variantId, language) {
  try {
    const raw = localStorage.getItem(storageKey(variantId, language));
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePartState(variantId, language, state) {
  try {
    localStorage.setItem(storageKey(variantId, language), JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Restore student collapse preferences after render. First visit stays open (HTML default).
 *
 * @param {HTMLElement} container
 * @param {{ variantId?: string, language?: string }} [options]
 */
export function bindNarrativePartCollapse(container, options = {}) {
  const variantId = options.variantId;
  const language = options.language ?? "english";

  if (!container || !variantId) {
    return;
  }

  const detailsList = container.querySelectorAll("details[data-narrative-part]");
  if (!detailsList.length) {
    return;
  }

  const state = loadPartState(variantId, language);

  detailsList.forEach((details) => {
    const slug = details.dataset.narrativePart;
    if (!slug) {
      return;
    }

    if (state[slug] === false) {
      details.open = false;
    }

    if (details.dataset.narrativePartBound === "true") {
      return;
    }

    details.dataset.narrativePartBound = "true";
    details.addEventListener("toggle", () => {
      const next = loadPartState(variantId, language);
      next[slug] = details.open;
      savePartState(variantId, language, next);
    });
  });
}
