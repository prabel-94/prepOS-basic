/**
 * Question translation for prepublish Malayalam variants.
 *
 * Chrome built-in Translator API does NOT include Malayalam (ml) as of Chrome 138–141.
 * Supported Indian languages: bn, hi, kn, mr, ta, te — not ml.
 * @see https://developer.chrome.com/docs/ai/translator-api
 *
 * Strategy:
 * 1. Try Chrome Translator if en→ml ever becomes available.
 * 2. Otherwise use MyMemory free API (experiment fallback, requires network).
 */

export const TRANSLATOR_TARGET_LANGUAGE = "ml";
export const TRANSLATOR_SOURCE_LANGUAGE = "en";

/** BCP-47 codes supported by Chrome's on-device Translator (no ml). */
export const CHROME_TRANSLATOR_LANGUAGE_CODES = new Set([
  "ar", "bg", "bn", "cs", "da", "de", "el", "en", "es", "fi", "fr", "hi", "hr",
  "hu", "id", "it", "iw", "ja", "kn", "ko", "lt", "mr", "nl", "no", "pl", "pt",
  "ro", "ru", "sk", "sl", "sv", "ta", "te", "th", "tr", "uk", "vi", "zh", "zh-Hant",
]);

export function isBrowserTranslatorSupported() {
  return (
    typeof globalThis.Translator !== "undefined" &&
    typeof globalThis.Translator.create === "function" &&
    typeof globalThis.Translator.availability === "function"
  );
}

export function isMalayalamInChromeTranslatorList() {
  return CHROME_TRANSLATOR_LANGUAGE_CODES.has(TRANSLATOR_TARGET_LANGUAGE);
}

export function getMalayalamUnsupportedMessage() {
  return (
    "Chrome's on-device Translator API does not support Malayalam (ml) yet. " +
    "Supported Indian languages in Chrome include Hindi, Tamil, Telugu, Kannada, Bengali, and Marathi — not Malayalam. " +
    "PrepOS will use the experimental web fallback translator instead (requires internet)."
  );
}

export function getBrowserTranslatorSetupHint() {
  if (!isMalayalamInChromeTranslatorList()) {
    return getMalayalamUnsupportedMessage();
  }

  return (
    "Chrome desktop Translator API is required (Chrome 138+). " +
    "Enable chrome://flags/#optimization-guide-on-device-model and " +
    "chrome://flags/#language-detection-api, then reload."
  );
}

/**
 * @returns {Promise<string>} availability | "unsupported" | "not_listed"
 */
export async function getMalayalamTranslatorAvailability() {
  if (!isMalayalamInChromeTranslatorList()) {
    return "not_listed";
  }

  if (!isBrowserTranslatorSupported()) {
    return "unsupported";
  }

  try {
    return await globalThis.Translator.availability({
      sourceLanguage: TRANSLATOR_SOURCE_LANGUAGE,
      targetLanguage: TRANSLATOR_TARGET_LANGUAGE,
    });
  } catch {
    return "unavailable";
  }
}

/**
 * @returns {Promise<"chrome"|"web_fallback">}
 */
export async function resolveTranslationBackend() {
  if (!isMalayalamInChromeTranslatorList()) {
    return "web_fallback";
  }

  const availability = await getMalayalamTranslatorAvailability();

  if (availability === "available" || availability === "downloadable") {
    return "chrome";
  }

  return "web_fallback";
}

/**
 * @param {(progress: { loaded: number, total: number, percentage: number }) => void} [onDownloadProgress]
 */
export async function createMalayalamTranslator(onDownloadProgress) {
  if (!isMalayalamInChromeTranslatorList()) {
    throw new Error(getMalayalamUnsupportedMessage());
  }

  const availability = await getMalayalamTranslatorAvailability();

  if (availability === "unsupported") {
    throw new Error(getBrowserTranslatorSetupHint());
  }

  if (availability === "unavailable") {
    throw new Error(
      "Malayalam translation is unavailable on this device (storage, language pair, or policy)."
    );
  }

  try {
    return await globalThis.Translator.create({
      sourceLanguage: TRANSLATOR_SOURCE_LANGUAGE,
      targetLanguage: TRANSLATOR_TARGET_LANGUAGE,
      monitor(monitor) {
        if (!onDownloadProgress) return;

        monitor.addEventListener("downloadprogress", (event) => {
          const total = event.total || 1;
          onDownloadProgress({
            loaded: event.loaded,
            total,
            percentage: Math.round((event.loaded / total) * 100),
          });
        });
      },
    });
  } catch (error) {
    const message = error?.message || String(error);

    if (/not supported|language options/i.test(message)) {
      throw new Error(getMalayalamUnsupportedMessage());
    }

    throw error;
  }
}

/**
 * Experimental fallback — MyMemory free API (en|ml). Requires network.
 * @param {string} text
 */
export async function translateTextViaWebFallback(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("langpair", `${TRANSLATOR_SOURCE_LANGUAGE}|${TRANSLATOR_TARGET_LANGUAGE}`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Web translation failed (HTTP ${response.status}). Try again later.`);
  }

  const payload = await response.json();
  const translated = payload?.responseData?.translatedText;

  if (!translated || typeof translated !== "string") {
    throw new Error("Web translation returned an empty result.");
  }

  if (/QUERY LENGTH LIMIT/i.test(translated)) {
    throw new Error(
      "Web translation daily limit reached. Paste Malayalam manually or try again tomorrow."
    );
  }

  return translated.trim();
}

/**
 * @param {string[]} texts
 * @param {{ backend?: "chrome"|"web_fallback", onDownloadProgress?: Function }} [options]
 * @returns {Promise<{ results: string[], backend: string }>}
 */
export async function translateTextsToMalayalam(texts = [], options = {}) {
  const backend = options.backend ?? (await resolveTranslationBackend());

  if (backend === "chrome") {
    const translator = await createMalayalamTranslator(options.onDownloadProgress);
    const results = [];

    for (const text of texts) {
      const trimmed = String(text ?? "").trim();
      if (!trimmed) {
        results.push("");
        continue;
      }

      results.push(await translator.translate(trimmed));
    }

    return { results, backend: "chrome" };
  }

  const results = [];

  for (const text of texts) {
    results.push(await translateTextViaWebFallback(text));
  }

  return { results, backend: "web_fallback" };
}

/**
 * @param {{ question_text?: string, option_a?: string, option_b?: string, option_c?: string, option_d?: string, explanation?: string }} english
 * @param {{ onDownloadProgress?: Function, onFieldProgress?: (field: string, index: number, total: number) => void, onBackendResolved?: (backend: string) => void }} [options]
 * @returns {Promise<Record<string, string> & { _backend?: string }>}
 */
export async function translateQuestionFieldsToMalayalam(english, options = {}) {
  const fields = [
    ["question_text", english.question_text ?? ""],
    ["option_a", english.option_a ?? ""],
    ["option_b", english.option_b ?? ""],
    ["option_c", english.option_c ?? ""],
    ["option_d", english.option_d ?? ""],
    ["explanation", english.explanation ?? ""],
  ];

  const texts = fields.map(([, value]) => value);
  const total = texts.filter((t) => String(t).trim()).length;
  let done = 0;

  const backend = await resolveTranslationBackend();
  options.onBackendResolved?.(backend);

  const { results } = await translateTextsToMalayalam(texts, {
    backend,
    onDownloadProgress: options.onDownloadProgress,
  });

  const result = { _backend: backend };

  fields.forEach(([key], index) => {
    result[key] = results[index] ?? "";
    if (String(texts[index]).trim()) {
      done += 1;
      options.onFieldProgress?.(key, done, total);
    }
  });

  return result;
}
