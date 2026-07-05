/**
 * PrepOS QCP question parser — shared by exam creator and draft editor.
 * Expects QCP blocks: Q1. stem, A)–D) options, Answer:, Explanation:
 * Also accepts: 1. numbering, ഉത്തരം / വിശദീകരണം (Malayalam labels).
 */

const OPTION_LETTERS = ["A", "B", "C", "D"];
const OPTION_REGEX = /^[A-D][\)\.\:\-]\s+/i;
const QUESTION_BLOCK_SPLIT = /\n(?=Q\d+[\.\)]\s)/gi;
const QUESTION_START = /^Q\d+[\.\)]\s/i;
const ANSWER_LINE_REGEX = /^Answer\s*:/i;
const EXPLANATION_LINE_REGEX = /^Explanation\s*:/i;

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

/** Malayalam + common aliases → canonical Answer / Explanation labels. */
export function normalizeMalayalamQcpLabels(text) {
  return text
    .replace(/^\s*ഉത്തരം\s*[:：\-]?\s*/gim, "Answer: ")
    .replace(/^\s*വിശദീകരണം\s*[:：\-]?\s*/gim, "Explanation: ")
    .replace(
      /\b(Ans|Correct Answer|Correct option|Correct Option)\b\s*[:：\-]?\s*/gi,
      "Answer: "
    )
    .replace(/\bExplanation\b\s*[:：\-]?\s*/gi, "Explanation: ");
}

const STATEMENT_LIST_INTRO_REGEX =
  /പരിഗണിക്കുക|പ്രസ്താവന|consider the following|consider the statements?|with reference|ക്രമീകരിക്കുക|arrange the following|match the following|match\s+list\s+i/i;

const MATCH_LIST_CONTEXT_REGEX = /match\s+list\s+i|list\s+i\b/i;

const QUESTION_STEM_INDICATOR_REGEX =
  /\b(?:Which|What|Who|Why|How|Consider|With reference|Arrange|Match|Select|Choose|Identify|Assertion|Reason|How many)\b/i;

function findPreviousNonEmptyLine(lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim()) {
      return lines[i].trim();
    }
  }
  return "";
}

function looksLikeTopLevelQuestionStem(content) {
  return (
    /[:?][\"""']?\s*$/.test(content) ||
    QUESTION_STEM_INDICATOR_REGEX.test(content) ||
    /\?/.test(content)
  );
}

/** List I rows use A. B. C. D. — not MCQ option lines. */
function isMatchListLetterItemLine(trimmed, recentLines = []) {
  if (!/^[A-D]\.\s+/i.test(trimmed)) {
    return false;
  }

  const context = recentLines
    .slice(-6)
    .map((line) => String(line ?? "").trim())
    .join("\n");

  return MATCH_LIST_CONTEXT_REGEX.test(context);
}

/** Convert 1. / Q1) block starters to Q1. for the structural parser. */
export function normalizeQuestionBlockMarkers(text) {
  let normalized = text.replace(
    /(?:^|\n)Q\s*(\d+)[\.\)]\s+/gi,
    (match, num, offset) => `${offset > 0 ? "\n" : ""}Q${num}. `
  );

  const lines = normalized.split("\n");
  const output = [];
  let blockPhase = "none";
  let statementListIntro = false;

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (blockPhase === "answer" || blockPhase === "explanation") {
        blockPhase = "none";
      }
      output.push(line);
      continue;
    }

    if (/^Q\d+[\.\)]\s+/i.test(trimmed)) {
      blockPhase = "question";
      statementListIntro = STATEMENT_LIST_INTRO_REGEX.test(
        trimmed.replace(/^Q\d+[\.\)]\s*/i, "")
      );
      output.push(line);
      continue;
    }

    if (OPTION_REGEX.test(trimmed)) {
      if (isMatchListLetterItemLine(trimmed, output)) {
        output.push(line);
        continue;
      }

      blockPhase = "options";
      output.push(line.replace(/^([A-D])[\.\):-]\s*/i, "$1) "));
      continue;
    }

    if (ANSWER_LINE_REGEX.test(trimmed)) {
      blockPhase = "answer";
      output.push(line);
      continue;
    }

    if (EXPLANATION_LINE_REGEX.test(trimmed)) {
      blockPhase = "explanation";
      output.push(line);
      continue;
    }

    const numericMatch = trimmed.match(/^(\d+)[\.\)]\s+(.+)$/);
    if (numericMatch) {
      const num = numericMatch[1];
      const content = numericMatch[2];
      const nextLine = (lines[i + 1] || "").trim();
      const nextIsNumeric = /^\d+[\.\)]\s+/.test(nextLine);
      const prevNonEmpty = findPreviousNonEmptyLine(output);
      const prevIntroducesStatements =
        statementListIntro ||
        STATEMENT_LIST_INTRO_REGEX.test(
          prevNonEmpty.replace(/^Q\d+[\.\)]\s*/i, "")
        );

      const insideQuestionBeforeOptions =
        blockPhase === "question" || blockPhase === "options";

      if (
        insideQuestionBeforeOptions ||
        nextIsNumeric ||
        prevIntroducesStatements
      ) {
        output.push(line);
        continue;
      }

      if (blockPhase === "none" && looksLikeTopLevelQuestionStem(content)) {
        blockPhase = "question";
        statementListIntro = STATEMENT_LIST_INTRO_REGEX.test(content);
        line = `Q${num}. ${content}`;
      }

      output.push(line);
      continue;
    }

    if (blockPhase === "explanation") {
      output.push(line);
      continue;
    }

    output.push(line);
  }

  return output.join("\n").trim();
}

function applyQcpDeepCleanLines(text) {
  text = text.replace(/^---+$/gm, "");
  text = text.replace(/[✅✔️💡⭐✨🔥📌👉•]/g, "");
  text = text.replace(/[ \t]+/g, " ");

  // ⭐ NEW: Split A-D options that are on same line with preceding text
  // e.g., "Select the Answer: A) option" → "Select the Answer:\nA) option"
  text = text.replace(/([^A-D])\s+([A-D][\)\.\:\-]\s+)/g, "$1\n$2");

  const firstQuestionMatch = text.match(/(?:^|\n)\s*(?:Q\s*)?\d+[\.\)]\s+/i);
  if (firstQuestionMatch) {
    text = text.slice(firstQuestionMatch.index);
  }

  const lines = text.split("\n").map((line) => line.trim());
  const cleaned = [];

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];

    if (!line) {
      cleaned.push("");
      continue;
    }

    const isNumericLine = /^\d+[\.\)]\s+/.test(line);
    const isQuestionNumber = isNumericLine || /^Q\s*\d+[\.\)]\s+/i.test(line);

    // If it's a numeric line, check neighbors before converting
    if (isQuestionNumber) {
      const content = line.replace(/^(?:Q\s*)?\d+[\.\)]\s*/i, "");
      const qNum = line.match(/\d+/)?.[0] || "1";
      const prevNonEmpty = (() => {
        for (let j = cleaned.length - 1; j >= 0; j -= 1) {
          if (cleaned[j] !== "") return cleaned[j];
        }
        return null;
      })();
      const nextLine = (lines[i + 1] || "").trim();

      const nextIsNumeric = /^\d+[\.\)]\s+/.test(nextLine);

      // Heuristics: only convert to Qn if
      // - it already looks like a question (question keywords / ? / :)
      // - AND it's not the start of a numeric sequence (1.,2.,3.)
      const looksLikeQuestion =
        /[:?][\""']?\s*$/.test(content) ||
        /\bWhich\b/i.test(content) ||
        /\bWhat\b/i.test(content) ||
        /\bWho\b/i.test(content) ||
        /\bWhy\b/i.test(content) ||
        /\bHow\b/i.test(content) ||
        /\bConsider\b/i.test(content) ||
        /\bWith reference\b/i.test(content) ||
        /\bArrange\b/i.test(content) ||
        /\bMatch\b/i.test(content) ||
        /\bSelect\b/i.test(content) ||
        /\bChoose\b/i.test(content) ||
        /\bIdentify\b/i.test(content) ||
        /\bAssertion\b/i.test(content) ||
        /\bReason\b/i.test(content) ||
        /\bHow many\b/i.test(content) ||
        /[\u0D00-\u0D7F]/.test(content);

      const prevIndicatesStatementList =
        prevNonEmpty &&
        STATEMENT_LIST_INTRO_REGEX.test(
          prevNonEmpty.replace(/^(?:Q\s*)?\d+[\.\)]\s*/i, "")
        );

      const prevIsNumericStatement =
        prevNonEmpty && /^\d+[\.\)]\s+/.test(prevNonEmpty);

      const insideStatementSequence =
        prevIndicatesStatementList || prevIsNumericStatement || nextIsNumeric;

      if (looksLikeQuestion && !insideStatementSequence) {
        line = `Q${qNum}. ${content}`;
      } else {
        // keep as statement/numbered line
        cleaned.push(line);
        continue;
      }
    }

    // normalize options A-D formatting (skip List I letter rows in match-list stems)
    if (!isMatchListLetterItemLine(line, cleaned)) {
      line = line.replace(/^([A-D])[\.\):-]\s*/i, "$1) ");
    }
    cleaned.push(line);
  }

  text = cleaned.join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/\n(Q\d+\.)/g, "\n\n$1");
  return text.trim();
}

/**
 * Minimal normalize before parse (labels + block numbers).
 * @param {string} rawText
 * @param {{ deepClean?: boolean }} options
 */
export function prepareQcpForParsing(rawText, { deepClean = false } = {}) {
  let text = normalizeLineEndings(rawText);
  text = normalizeMalayalamQcpLabels(text);
  // Note: keep marker normalization conservative so deepClean can
  // preserve internal numbered statements
  text = normalizeQuestionBlockMarkers(text);

  if (deepClean) {
    text = applyQcpDeepCleanLines(text);
  }

  return text.replace(/^---+$/gm, "").trim();
}

/**
 * QCP clean — pure function version of exam creator "Clean (QCP)".
 */
export function cleanQcpText(rawText) {
  return prepareQcpForParsing(rawText, { deepClean: true });
}

function extractAnswerLetter(answerLine) {
  const match = answerLine.match(
    /Answer\s*:\s*(?:([A-D])[\)\.\:\-]?\s*|([A-D])\b)/i
  );
  if (!match) {
    return "A";
  }

  return (match[1] || match[2] || "A").toUpperCase();
}

function parseQuestionBlock(block) {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return null;
  }

  const answerIndex = lines.findIndex((line) => ANSWER_LINE_REGEX.test(line));
  if (answerIndex === -1) {
    return null;
  }

  const correct = extractAnswerLetter(lines[answerIndex]);

  const explanationIndex = lines.findIndex((line) =>
    EXPLANATION_LINE_REGEX.test(line)
  );
  let explanation = "";

  if (explanationIndex !== -1) {
    explanation = lines
      .slice(explanationIndex)
      .join("\n")
      .replace(/^Explanation\s*:/i, "")
      .trim();
  }

  const allOptionLines = lines.filter(
    (line, idx) => idx < answerIndex && OPTION_REGEX.test(line)
  );

  const optionLines =
    allOptionLines.length > 4 ? allOptionLines.slice(-4) : allOptionLines;

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
  const text = prepareQcpForParsing(rawText);

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
  let text = prepareQcpForParsing(rawText);
  if (!text) {
    return "";
  }

  if (!QUESTION_START.test(text)) {
    const firstLine = text.split("\n")[0]?.trim() || "";
    if (/^\d+[\.\)]\s+/.test(firstLine)) {
      text = normalizeQuestionBlockMarkers(text);
    } else {
      text = `Q1. ${text}`;
    }
  }

  const blocks = text
    .split(QUESTION_BLOCK_SPLIT)
    .map((block) => block.trim())
    .filter(Boolean);
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
  "Could not parse question. Use QCP format: Q1. (or 1.) stem, A)–D) options, Answer: or ഉത്തരം:, Explanation: or വിശദീകരണം: (optional).";

/**
 * Parse a single-question paste for draft cards.
 * @param {"auto"|"english"|"malayalam"} target
 */
export function parseQuestionPaste(rawText, { target = "auto", clean = false } = {}) {
  let text = normalizeLineEndings(rawText);
  if (!text) {
    return { ok: false, error: "Paste is empty." };
  }

  text = prepareQcpForParsing(text, { deepClean: clean });

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
  const english = parseSingleQuestion(
    prepareQcpForParsing(englishText, { deepClean: clean })
  );
  if (!english) {
    return { ok: false, error: PARSE_ERROR };
  }

  const result = { ok: true, english };

  if (malayalamText) {
    const malayalam = parseSingleQuestion(
      prepareQcpForParsing(malayalamText, { deepClean: clean })
    );
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

  text = prepareQcpForParsing(text, { deepClean: clean });
  const questions = parseQuiz(text);

  if (!questions.length) {
    return {
      ok: false,
      error: `${PARSE_ERROR} Paste multiple blocks: Q1., Q2., Q3., … (or 1., 2., 3., …)`,
    };
  }

  return { ok: true, questions };
}

const OPTION_LETTERS_EXPORT = ["A", "B", "C", "D"];

/**
 * Normalize draft or bank question rows into a common QCP shape.
 */
export function normalizeQuestionForQcp(question = {}) {
  if (!question || typeof question !== "object") {
    return {
      text: "",
      options: OPTION_LETTERS_EXPORT.map((id) => ({ id, text: "" })),
      correct: "A",
      explanation: "",
    };
  }

  if (Array.isArray(question.options) && question.options.length) {
    const options = OPTION_LETTERS_EXPORT.map((letter, index) => {
      const match =
        question.options.find(
          (option) => String(option?.id || "").toUpperCase() === letter
        ) || question.options[index];

      return {
        id: letter,
        text: String(match?.text ?? ""),
      };
    });

    return {
      text: String(question.text ?? question.question ?? question.question_text ?? ""),
      options,
      correct: String(question.correct ?? question.correct_option ?? "A")
        .trim()
        .toUpperCase()
        .charAt(0) || "A",
      explanation: String(question.explanation ?? question.explanation_text ?? ""),
    };
  }

  return {
    text: String(question.text ?? question.question_text ?? ""),
    options: OPTION_LETTERS_EXPORT.map((letter) => ({
      id: letter,
      text: String(question[`option_${letter.toLowerCase()}`] ?? ""),
    })),
    correct: String(question.correct ?? question.correct_option ?? "A")
      .trim()
      .toUpperCase()
      .charAt(0) || "A",
    explanation: String(question.explanation ?? ""),
  };
}

/**
 * Serialize a question to a single QCP block (inverse of parseSingleQuestion).
 */
export function serializeQuestionToQcp(question, { index = 1 } = {}) {
  const normalized = normalizeQuestionForQcp(question);
  const num = Math.max(1, Number(index) || 1);
  const lines = [`Q${num}. ${normalized.text.trim()}`];

  for (const option of normalized.options) {
    lines.push(`${option.id}) ${String(option.text ?? "").trim()}`);
  }

  const correct = String(normalized.correct || "A")
    .trim()
    .toUpperCase()
    .charAt(0);

  if (OPTION_LETTERS_EXPORT.includes(correct)) {
    lines.push(`Answer: ${correct}`);
  }

  if (normalized.explanation.trim()) {
    lines.push(`Explanation: ${normalized.explanation.trim()}`);
  }

  return lines.join("\n");
}
