/**
 * Experimental Malayalam language variant stored in question_metadata.
 * Prepublish + teacher verification before status = published.
 */

export const LANGUAGE_VARIANT_META_KEY = "language_variant_malayalam";
export const LANGUAGE_VARIANT_SOURCE_BROWSER = "browser_translator";

/**
 * @param {Record<string, unknown>} meta from extractQuestionMeta
 * @returns {object|null}
 */
export function parseMalayalamVariant(meta = {}) {
  const raw = meta[LANGUAGE_VARIANT_META_KEY];
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return raw;
}

/**
 * @param {object|null} variant
 * @returns {"none"|"draft"|"published"}
 */
export function getMalayalamVariantStatus(variant) {
  const status = String(variant?.status ?? "").toLowerCase();
  if (status === "published") return "published";
  if (status === "draft") return "draft";
  return "none";
}

export function emptyMalayalamVariantFields() {
  return {
    question_text: "",
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    explanation: "",
  };
}

/**
 * @param {object|null} variant
 */
export function malayalamVariantToFormFields(variant) {
  const base = emptyMalayalamVariantFields();
  if (!variant) return base;

  return {
    question_text: variant.question_text ?? "",
    option_a: variant.option_a ?? "",
    option_b: variant.option_b ?? "",
    option_c: variant.option_c ?? "",
    option_d: variant.option_d ?? "",
    explanation: variant.explanation ?? "",
  };
}

/**
 * @param {Record<string, string>} fields
 * @param {{ status?: string, source?: string, englishHash?: string|null }} [meta]
 */
export function buildMalayalamVariantPayload(fields, meta = {}) {
  const now = new Date().toISOString();

  return {
    status: meta.status ?? "draft",
    source: meta.source ?? LANGUAGE_VARIANT_SOURCE_BROWSER,
    question_text: String(fields.question_text ?? "").trim(),
    option_a: String(fields.option_a ?? "").trim(),
    option_b: String(fields.option_b ?? "").trim(),
    option_c: String(fields.option_c ?? "").trim(),
    option_d: String(fields.option_d ?? "").trim(),
    explanation: String(fields.explanation ?? "").trim(),
    translated_at: meta.translated_at ?? now,
    verified_at: meta.status === "published" ? now : meta.verified_at ?? null,
    source_english_hash: meta.englishHash ?? null,
  };
}

export function validateMalayalamVariantForSave(fields) {
  if (!String(fields.question_text ?? "").trim()) {
    throw new Error("Malayalam question text is required.");
  }

  const options = [
    fields.option_a,
    fields.option_b,
    fields.option_c,
    fields.option_d,
  ].map((t) => String(t ?? "").trim());

  if (options.filter(Boolean).length < 2) {
    throw new Error("At least two Malayalam options are required.");
  }
}
