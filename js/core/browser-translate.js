/**
 * Chrome built-in Translator API (on-device, prepublish workflow).
 * @see https://developer.chrome.com/docs/ai/translator-api
 */

export const TRANSLATOR_TARGET_LANGUAGE = "ml";
export const TRANSLATOR_SOURCE_LANGUAGE = "en";

export function isBrowserTranslatorSupported() {
  return (
    typeof globalThis.Translator !== "undefined" &&
    typeof globalThis.Translator.create === "function" &&
    typeof globalThis.Translator.availability === "function"
  );
}

export function getBrowserTranslatorSetupHint() {
  return (
    "Chrome desktop Translator API is required (Chrome 138+). " +
    "Enable chrome://flags/#optimization-guide-on-device-model and " +
    "chrome://flags/#language-detection-api, then reload. " +
    "Malayalam (en→ml) must show as available in Translator.availability()."
  );
}

/**
 * @returns {Promise<string>} availability | "unsupported"
 */
export async function getMalayalamTranslatorAvailability() {
  if (!isBrowserTranslatorSupported()) {
    return "unsupported";
  }

  return globalThis.Translator.availability({
    sourceLanguage: TRANSLATOR_SOURCE_LANGUAGE,
    targetLanguage: TRANSLATOR_TARGET_LANGUAGE,
  });
}

/**
 * @param {(progress: { loaded: number, total: number, percentage: number }) => void} [onDownloadProgress]
 */
export async function createMalayalamTranslator(onDownloadProgress) {
  const availability = await getMalayalamTranslatorAvailability();

  if (availability === "unsupported") {
    throw new Error(getBrowserTranslatorSetupHint());
  }

  if (availability === "unavailable") {
    throw new Error(
      "Malayalam translation is unavailable on this device (storage, language pair, or policy)."
    );
  }

  return globalThis.Translator.create({
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
}

/**
 * Translate an ordered list of English strings to Malayalam.
 * Empty strings are passed through unchanged.
 *
 * @param {string[]} texts
 * @param {{ onDownloadProgress?: (p: { loaded: number, total: number, percentage: number }) => void }} [options]
 * @returns {Promise<string[]>}
 */
export async function translateTextsToMalayalam(texts = [], options = {}) {
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

  return results;
}

/**
 * @param {{ question_text?: string, option_a?: string, option_b?: string, option_c?: string, option_d?: string, explanation?: string }} english
 * @param {{ onDownloadProgress?: Function, onFieldProgress?: (field: string, index: number, total: number) => void }} [options]
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

  const translated = await translateTextsToMalayalam(texts, {
    onDownloadProgress: options.onDownloadProgress,
  });

  const result = {};

  fields.forEach(([key], index) => {
    result[key] = translated[index] ?? "";
    if (String(texts[index]).trim()) {
      done += 1;
      options.onFieldProgress?.(key, done, total);
    }
  });

  return result;
}
