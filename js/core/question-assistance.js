/**
 * Malayalam assistance mask — display overlay on the same question entity.
 * English fields remain canonical for scoring, identity, and bank dedup.
 */

export const ASSISTANCE_LANG_MALAYALAM = "malayalam";

const OPTION_LETTERS = ["A", "B", "C", "D"];

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
