/**
 * Language variant helpers for canonical notes.
 */

export const SUPPORTED_LANGUAGES = Object.freeze(["english", "malayalam"]);

export const LANGUAGE_LABELS = Object.freeze({
  english: "English",
  malayalam: "മലയാളം",
});

export const LANGUAGE_FALLBACK_ORDER = Object.freeze(["malayalam", "english"]);

export const VARIANT_STATUSES = Object.freeze(["draft", "published", "archived"]);

export const ARCHIVE_RETENTION_DAYS = 14;

export function normalizeLanguage(value = "english") {
  const key = String(value).trim().toLowerCase();

  if (key === "malayalam" || key === "ml") {
    return "malayalam";
  }

  if (key === "bilingual") {
    return "bilingual";
  }

  return "english";
}

export function getLanguageLabel(language) {
  return LANGUAGE_LABELS[normalizeLanguage(language)] ?? language;
}

export function buildLanguageFallbackChain(preferLanguage) {
  const preferred = normalizeLanguage(preferLanguage);
  const chain = [preferred];

  for (const lang of LANGUAGE_FALLBACK_ORDER) {
    if (!chain.includes(lang)) {
      chain.push(lang);
    }
  }

  return chain;
}
