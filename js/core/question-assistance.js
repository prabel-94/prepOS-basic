/**
 * Malayalam assistance mask — display overlay on the same question entity.
 * English fields remain canonical for scoring, identity, and bank dedup.
 */

export const ASSISTANCE_LANG_MALAYALAM = "malayalam";

const OPTION_LETTERS = ["A", "B", "C", "D"];

/** Bank metadata key for manual Malayalam variant verification (staff-only). */
export const ML_VARIANT_VERIFICATION_KEY = "ml_variant_verification";

export function assistanceSessionKey(examId) {
  return `prepos-assistance-mask-${examId}`;
}

export function emptyMalayalamAssistance() {
  return {
    text: "",
    options: { A: "", B: "", C: "", D: "" },
    explanation: "",
  };
}

export function ensureMalayalamAssistance(question) {
  if (!question || typeof question !== "object") {
    return emptyMalayalamAssistance();
  }

  if (!question.assistance || typeof question.assistance !== "object") {
    question.assistance = {};
  }

  const current = question.assistance[ASSISTANCE_LANG_MALAYALAM];
  if (!current || typeof current !== "object") {
    question.assistance[ASSISTANCE_LANG_MALAYALAM] = emptyMalayalamAssistance();
  } else {
    const options = { ...emptyMalayalamAssistance().options, ...(current.options || {}) };
    question.assistance[ASSISTANCE_LANG_MALAYALAM] = {
      text: String(current.text ?? ""),
      options,
      explanation: String(current.explanation ?? ""),
    };
  }

  return question.assistance[ASSISTANCE_LANG_MALAYALAM];
}

function hasText(value) {
  return String(value ?? "").trim().length > 0;
}

export function hasMalayalamAssistance(question) {
  const mask = question?.assistance?.[ASSISTANCE_LANG_MALAYALAM];
  if (!mask || typeof mask !== "object") {
    return false;
  }

  if (hasText(mask.text) || hasText(mask.explanation)) {
    return true;
  }

  const options = mask.options || {};
  return OPTION_LETTERS.some((letter) => hasText(options[letter]));
}

export function examHasMalayalamAssistance(questions = []) {
  return questions.some((question) => hasMalayalamAssistance(question));
}

function normalizeOptions(options = []) {
  return (options || []).map((option, index) => {
    if (typeof option === "string") {
      return {
        id: OPTION_LETTERS[index] || "",
        text: option,
      };
    }

    return {
      id: option?.id || OPTION_LETTERS[index] || "",
      text: option?.text || "",
    };
  });
}

/**
 * Resolve display text/options/explanation with optional Malayalam mask.
 * Does not mutate the source question.
 */
export function resolveQuestionDisplay(question, useMalayalamMask = false) {
  const baseOptions = normalizeOptions(question?.options);
  const base = {
    text: question?.text || question?.question || question?.question_text || "",
    options: baseOptions,
    explanation: question?.explanation || question?.explanation_text || "",
  };

  if (!useMalayalamMask) {
    return base;
  }

  const mask = question?.assistance?.[ASSISTANCE_LANG_MALAYALAM];
  if (!mask) {
    return base;
  }

  const maskOptions = mask.options || {};

  return {
    text: hasText(mask.text) ? String(mask.text).trim() : base.text,
    options: base.options.map((option) => {
      const letter = String(option.id || "").toUpperCase();
      const masked = maskOptions[letter] ?? maskOptions[option.id] ?? "";
      return {
        ...option,
        text: hasText(masked) ? String(masked).trim() : option.text,
      };
    }),
    explanation: hasText(mask.explanation)
      ? String(mask.explanation).trim()
      : base.explanation,
  };
}

export function pruneMalayalamAssistance(question) {
  if (!hasMalayalamAssistance(question)) {
    if (question?.assistance) {
      delete question.assistance[ASSISTANCE_LANG_MALAYALAM];
      if (!Object.keys(question.assistance).length) {
        delete question.assistance;
      }
    }
    return question;
  }

  return question;
}

export function malayalamAssistanceFromMetadata(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    assistance: {
      [ASSISTANCE_LANG_MALAYALAM]: {
        text: String(value.text ?? ""),
        options: {
          A: String(value.options?.A ?? ""),
          B: String(value.options?.B ?? ""),
          C: String(value.options?.C ?? ""),
          D: String(value.options?.D ?? ""),
        },
        explanation: String(value.explanation ?? ""),
      },
    },
  };
}

/** Payload for bank metadata RPC (assistance_malayalam value). */
export function malayalamAssistanceToMetadataPayload(question) {
  const mask = question?.assistance?.[ASSISTANCE_LANG_MALAYALAM];
  if (!mask || typeof mask !== "object") {
    return null;
  }

  return {
    text: String(mask.text ?? ""),
    options: {
      A: String(mask.options?.A ?? ""),
      B: String(mask.options?.B ?? ""),
      C: String(mask.options?.C ?? ""),
      D: String(mask.options?.D ?? ""),
    },
    explanation: String(mask.explanation ?? ""),
  };
}

export function normalizeMalayalamAssistanceForHash(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const options = payload.options || {};

  return (
    String(payload.text ?? "").trim() +
    String(options.A ?? "").trim() +
    String(options.B ?? "").trim() +
    String(options.C ?? "").trim() +
    String(options.D ?? "").trim() +
    String(payload.explanation ?? "").trim()
  ).toLowerCase();
}

export async function computeMalayalamAssistanceHash(payload) {
  const normalized = normalizeMalayalamAssistanceForHash(payload);
  const data = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function getMlVariantVerificationRecord(question) {
  if (question?.mlVerificationRecord && typeof question.mlVerificationRecord === "object") {
    return question.mlVerificationRecord;
  }

  const row = (question?.question_metadata || []).find(
    (entry) => entry.key === ML_VARIANT_VERIFICATION_KEY
  );

  return parseMlVariantVerificationValue(row?.value);
}

export function parseMlVariantVerificationValue(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    content_hash: String(value.content_hash ?? ""),
    verified_at: value.verified_at ?? null,
    verified_by: value.verified_by ?? null,
  };
}

/**
 * Attach _mlHasContent / _mlVerified / _mlNeedsReview on a question object.
 */
export async function enrichQuestionMalayalamVerification(question) {
  if (!question || typeof question !== "object") {
    return question;
  }

  const hasMl = hasMalayalamAssistance(question);
  let verified = false;

  if (hasMl) {
    const record = getMlVariantVerificationRecord(question);
    const payload = malayalamAssistanceToMetadataPayload(question);

    if (record?.content_hash && payload) {
      const currentHash = await computeMalayalamAssistanceHash(payload);
      verified = currentHash === record.content_hash;
    }
  }

  question._mlHasContent = hasMl;
  question._mlVerified = verified;
  question._mlNeedsReview = hasMl && !verified;
  return question;
}

/**
 * Batch-fetch question_metadata rows keyed by question id.
 */
export async function fetchQuestionMetadataMaps(
  sb,
  questionIds = [],
  keys = []
) {
  const uniqueIds = [...new Set(questionIds.filter(Boolean))];
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  const result = new Map();

  if (!uniqueIds.length || !uniqueKeys.length) {
    return result;
  }

  const { data, error } = await sb
    .from("question_metadata")
    .select("question_id, key, value")
    .in("question_id", uniqueIds)
    .in("key", uniqueKeys);

  if (error) {
    throw error;
  }

  for (const row of data ?? []) {
    const bucket = result.get(row.question_id) ?? {};
    bucket[row.key] = row.value;
    result.set(row.question_id, bucket);
  }

  return result;
}

/**
 * Certify the Malayalam mask currently on the question object (bank metadata shape).
 */
export async function certifyMalayalamVariant(sb, question) {
  const questionId = question?.id;
  if (!questionId) {
    throw new Error("Question id is required");
  }

  const normalized = malayalamAssistanceToMetadataPayload(question);
  if (!normalized || !hasMalayalamAssistance(question)) {
    throw new Error("Add Malayalam content before marking as verified");
  }

  const contentHash = await computeMalayalamAssistanceHash(normalized);
  const { data: userData } = await sb.auth.getUser();

  const record = {
    content_hash: contentHash,
    verified_at: new Date().toISOString(),
    verified_by: userData?.user?.id ?? null,
  };

  const { error } = await sb.from("question_metadata").upsert(
    {
      question_id: questionId,
      key: ML_VARIANT_VERIFICATION_KEY,
      value: record,
    },
    { onConflict: "question_id,key" }
  );

  if (error) {
    throw error;
  }

  question.mlVerificationRecord = record;
  question._mlHasContent = true;
  question._mlVerified = true;
  question._mlNeedsReview = false;
  return record;
}

export async function revokeMalayalamVariantVerification(
  sb,
  questionId,
  question = null
) {
  if (!questionId) {
    throw new Error("Question id is required");
  }

  const { error } = await sb
    .from("question_metadata")
    .delete()
    .eq("question_id", questionId)
    .eq("key", ML_VARIANT_VERIFICATION_KEY);

  if (error) {
    throw error;
  }

  if (question) {
    delete question.mlVerificationRecord;
    question._mlVerified = false;
    question._mlNeedsReview = hasMalayalamAssistance(question);
  }
}
