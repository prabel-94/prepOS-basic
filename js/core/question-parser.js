/**
 * PrepOS QCP question parser — shared by exam creator and draft editor.
 * Expects QCP blocks: Q1. stem, A)–D) options, Answer:, Explanation:
 */

const OPTION_LETTERS = ["A", "B", "C", "D"];
const OPTION_REGEX = /^[A-D][\)\.\:\-]\s+/i;
const QUESTION_BLOCK_SPLIT = /\n(?=Q\d+[\.\)]\s)/gi;
const QUESTION_START = /^Q\d+[\.\)]\s/i;

const BILINGUAL_SECTION_SPLIT =
  /(?:^|\n)(?:---+\s*(?:Malayalam|മലയാളം)\s*---+\s*|\[Malayalam\]\s*|Malayalam\s*:\s*)\n/i;

function normalizeLineEndings(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function createParsedQuestionFields({ text, options, correct, explanation }) {
  return {
    id: crypto.randomUUID(),
    question_id: null,
    text,
    options,
    correct,
    explanation,
    topics: [],
    bank_status: "draft",
    primary_pattern: null,
    generator: {
      enabled: false,
      subject: "general",
      pattern: null,
      source: "parser",
      version: 1,
      last_generated_at: null,
    },
    difficulty: {
      cognitive_level: null,
      complexity_level: null,
      depth_level: null,
      score: null,
      label: null,
    },
  };
}

/**
 * QCP clean — pure function version of exam creator "Clean (QCP)".
 */
export function cleanQcpText(rawText) {
  let text = normalizeLineEndings(rawText);

  text = text.replace(/^---+$/gm, "");
  text = text.replace(/[✅✔️💡⭐✨🔥📌👉•]/g, "");
  text = text.replace(/[ \t]+/g, " ");

  const firstQuestionMatch = text.match(/(?:^|\n)\s*(?:Q\s*)?\d+[\.\)]\s+/i);
  if (firstQuestionMatch) {
    text = text.slice(firstQuestionMatch.index);
  }

  text = text.replace(
    /\b(Ans|Correct Answer|Correct option|Correct Option)\b\s*[:\-]?\s*/gi,
    "Answer: "
  );
  text = text.replace(/\bExplanation\b\s*[:\-]?\s*/gi, "Explanation: ");

  const lines = text.split("\n").map((line) => line.trim());
  const cleaned = [];

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];

    if (!line) {
      cleaned.push("");
      continue;
    }

    const isQuestionNumber =
      /^\d+[\.\)]\s+/.test(line) || /^Q\s*\d+[\.\)]\s+/i.test(line);

    if (isQuestionNumber) {
      const content = line.replace(/^(?:Q\s*)?\d+[\.\)]\s*/i, "");
      const hasQuestionPattern =
        /[:?]["”']?\s*$/.test(content) ||
        /\bWhich\b/i.test(content) ||
        /\bWhat\b/i.test(content) ||
        /\bWho\b/i.test(content) ||
        /\bWhy\b/i.test(content) ||
        /\bHow\b/i.test(content) ||
        /\bConsider\b/i.test(content) ||
        /\bArrange\b/i.test(content) ||
        /\bMatch\b/i.test(content) ||
        /\bSelect\b/i.test(content) ||
        /\bChoose\b/i.test(content) ||
        /\bIdentify\b/i.test(content) ||
        /\bAssertion\b/i.test(content) ||
        /\bReason\b/i.test(content) ||
        /\bWith reference\b/i.test(content) ||
        /\bHow many\b/i.test(content);

      if (hasQuestionPattern) {
        const qNum = line.match(/\d+/)?.[0] || "1";
        line = `Q${qNum}. ${content}`;
      }
    }

    line = line.replace(/^([A-D])[\.\):-]\s*/i, "$1) ");
    cleaned.push(line);
  }

  text = cleaned.join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/\n(Q\d+\.)/g, "\n\n$1");
  return text.trim();
}

function parseQuestionBlock(block) {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return null;
  }

  const answerIndex = lines.findIndex((line) => /^Answer\s*:/i.test(line));
  if (answerIndex === -1) {
    return null;
  }

  const answerLine = lines[answerIndex];
  const answerMatch = answerLine.match(/Answer\s*:\s*([A-D])\b/i);
  const correct = answerMatch ? answerMatch[1].toUpperCase() : "A";

  const explanationIndex = lines.findIndex((line) => /^Explanation\s*:/i.test(line));
  let explanation = "";

  if (explanationIndex !== -1) {
    explanation = lines
      .slice(explanationIndex)
      .join("\n")
      .replace(/^Explanation\s*:/i, "")
      .trim();
  }

  const optionLines = lines.filter(
    (line, idx) => idx < answerIndex && OPTION_REGEX.test(line)
  );

  if (optionLines.length !== 4) {
    return null;
  }

  const options = optionLines.map((line, idx) => ({
    id: OPTION_LETTERS[idx],
    text: line.replace(OPTION_REGEX, "").trim(),
  }));

  const firstOptionIndex = lines.indexOf(optionLines[0]);
  if (firstOptionIndex === -1) {
    return null;
  }

  const text = lines
    .slice(0, firstOptionIndex)
    .join("\n")
    .replace(/^Q\d+[\.\)]\s*/i, "")
    .trim();

  return createParsedQuestionFields({ text, options, correct, explanation });
}

/**
 * Parse one or more QCP question blocks from pasted text.
 */
export function parseQuiz(rawText) {
  let text = normalizeLineEndings(rawText);
  text = text.replace(/^---+$/gm, "");

  const blocks = text
    .split(QUESTION_BLOCK_SPLIT)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map(parseQuestionBlock).filter(Boolean);
}

/**
 * Ensure pasted text is a single Q1. block for parseQuiz.
 */
export function normalizeSingleQuestionPaste(rawText) {
  let text = normalizeLineEndings(rawText);
  if (!text) {
    return "";
  }

  if (!QUESTION_START.test(text)) {
    const firstLine = text.split("\n")[0]?.trim() || "";
    if (/^\d+[\.\)]\s+/.test(firstLine)) {
      text = `Q${text}`;
    } else {
      text = `Q1. ${text}`;
    }
  }

  const blocks = text.split(QUESTION_BLOCK_SPLIT).map((block) => block.trim()).filter(Boolean);
  return blocks[0] || text;
}

export function parseSingleQuestion(rawText) {
  const normalized = normalizeSingleQuestionPaste(rawText);
  if (!normalized) {
    return null;
  }

  return parseQuiz(normalized)[0] || null;
}

/**
 * Split bilingual paste into English + optional Malayalam sections.
 */
export function splitBilingualPaste(rawText) {
  const text = normalizeLineEndings(rawText);
  const match = text.match(BILINGUAL_SECTION_SPLIT);

  if (!match || match.index === undefined) {
    return { english: text, malayalam: null };
  }

  return {
    english: text.slice(0, match.index).trim(),
    malayalam: text.slice(match.index + match[0].length).trim(),
  };
}

const PARSE_ERROR =
  "Could not parse question. Use QCP format: Q1. stem, A)–D) options, Answer: X, Explanation: (optional).";

/**
 * Parse a single-question paste for draft cards.
 * @param {"auto"|"english"|"malayalam"} target
 */
export function parseQuestionPaste(rawText, { target = "auto", clean = false } = {}) {
  let text = normalizeLineEndings(rawText);
  if (!text) {
    return { ok: false, error: "Paste is empty." };
  }

  if (clean) {
    text = cleanQcpText(text);
  }

  if (target === "english") {
    const english = parseSingleQuestion(text);
    if (!english) {
      return { ok: false, error: PARSE_ERROR };
    }
    return { ok: true, english };
  }

  if (target === "malayalam") {
    const malayalam = parseSingleQuestion(text);
    if (!malayalam) {
      return { ok: false, error: PARSE_ERROR };
    }
    return { ok: true, malayalam };
  }

  const { english: englishText, malayalam: malayalamText } = splitBilingualPaste(text);
  const english = parseSingleQuestion(englishText);
  if (!english) {
    return { ok: false, error: PARSE_ERROR };
  }

  const result = { ok: true, english };

  if (malayalamText) {
    const malayalam = parseSingleQuestion(malayalamText);
    if (!malayalam) {
      result.warning =
        "English was applied, but the Malayalam section could not be parsed.";
    } else {
      result.malayalam = malayalam;
    }
  }

  return result;
}

/**
 * Parse multiple QCP blocks (Q1., Q2., …) from one paste.
 */
export function parseBulkQuestionPaste(rawText, { clean = false } = {}) {
  let text = normalizeLineEndings(rawText);
  if (!text) {
    return { ok: false, error: "Paste is empty." };
  }

  if (clean) {
    text = cleanQcpText(text);
  }

  const questions = parseQuiz(text);
  if (!questions.length) {
    return {
      ok: false,
      error: `${PARSE_ERROR} Paste multiple blocks: Q1., Q2., Q3., …`,
    };
  }

  return { ok: true, questions };
}
