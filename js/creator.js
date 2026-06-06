// ==============================================
// PrepOS Creator System v2
// creator.js
// ==============================================

import { getClient } from "./core/get-client.js";
import { bootPage } from "./core/page-boot.js";

// ==============================================
// CLEAN QUESTION TEXT
// ==============================================

function cleanQuestionText(text){

  return text

    .trim()

    // ------------------------------------------
    // Remove:
    // Q1.
    // Q1)
    // Q 1.
    // 1.
    // 1)
    // ------------------------------------------

    .replace(
      /^Q?\s*\d+[\.\)]\s*/i,
      ""
    )

    // ------------------------------------------
    // Remove:
    // (1)
    // ------------------------------------------

    .replace(
      /^\(\d+\)\s*/,
      ""
    )

    .trim();

}

// ==============================================
// CREATE DRAFT
// ==============================================

async function createDraft(
  title,
  questions,
  duration
){

  try{

    const sb = await getClient();

    // ------------------------------------------
    // SESSION
    // ------------------------------------------

    const session =
      await sb.auth.getSession();

    const accessToken =
      session?.data?.session?.access_token;

    if(!accessToken){

      alert(
        "Please sign in to create draft."
      );

      return null;

    }

    // ------------------------------------------
    // REQUEST
    // ------------------------------------------

    const res = await fetch(
      "https://bcqjfosxneuyoyuzhdiq.supabase.co/functions/v1/create-exam",
      {
        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          apikey:
            SUPABASE_ANON_KEY,

          Authorization:
            `Bearer ${accessToken}`

        },

        body: JSON.stringify({

          title,

          duration,

          questions

        })

      }
    );

    // ------------------------------------------
    // ERROR
    // ------------------------------------------

    if(!res.ok){

      const errorText =
        await res.text();

      console.error(
        "Create exam failed:",
        res.status,
        errorText
      );

      alert(
        `Create draft failed (${res.status})`
      );

      return null;

    }

    // ------------------------------------------
    // RESPONSE
    // ------------------------------------------

    const data =
      await res.json();

    console.log(
      "CREATE EXAM RESPONSE:",
      data
    );

    if(data.error){

      console.error(data.error);

      alert(data.error);

      return null;

    }

    // ------------------------------------------
    // DRAFT ID
    // ------------------------------------------

    const draftId =

      data.draft_id ||

      data.draft?.id ||

      data.id ||

      null;

    if(!draftId){

      console.error(
        "Draft ID missing",
        data
      );

      alert(
        "Draft created but ID missing"
      );

      return null;

    }

    // ------------------------------------------
    // RELATIVE URL
    // IMPORTANT:
    // supports GitHub Pages subfolders
    // ------------------------------------------

    return `draft.html?id=${draftId}`;

  }catch(err){

    console.error(err);

    alert("Failed to create draft");

    return null;

  }

}

// ===============================
// QCP CLEAN v2
// PrepOS Question Cleaning Protocol
// ===============================

function cleanQCP(){

  let text =
    document.getElementById("input").value;

  // ===============================
  // BASIC NORMALIZATION
  // ===============================

  text = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  // remove markdown separators
  text = text.replace(/^---+$/gm, "");

  // remove emojis/icons
  text = text.replace(
    /[✅✔️💡⭐✨🔥📌👉•]/g,
    ""
  );

  // normalize spaces
  text = text.replace(/[ \t]+/g, " ");

  // ===============================
  // REMOVE HEADER CONTENT
  // Everything before first question
  // ===============================

  const firstQuestionMatch =
    text.match(
      /(?:^|\n)\s*(?:Q\s*)?\d+[\.\)]\s+/i
    );

  if(firstQuestionMatch){

    const startIndex =
      firstQuestionMatch.index;

    text =
      text.slice(startIndex);

  }

  // ===============================
  // STANDARDIZE ANSWER LABELS
  // ===============================

  text = text.replace(
    /\b(Ans|Correct Answer|Correct option|Correct Option)\b\s*[:\-]?\s*/gi,
    "Answer: "
  );

  // ===============================
  // STANDARDIZE EXPLANATION LABELS
  // ===============================

  text = text.replace(
    /\bExplanation\b\s*[:\-]?\s*/gi,
    "Explanation: "
  );

  // ===============================
  // SPLIT INTO LINES
  // ===============================

  let lines =
    text
      .split("\n")
      .map(l => l.trim());

  let cleaned = [];

  // ===============================
  // PROCESS LINE BY LINE
  // ===============================

  for(let i = 0; i < lines.length; i++){

    let line = lines[i];

    if(!line){
      cleaned.push("");
      continue;
    }

    // ===============================
    // DETECT REAL QUESTION STARTS
    // ===============================

    const isQuestionNumber =
      /^\d+[\.\)]\s+/.test(line) ||
      /^Q\s*\d+[\.\)]\s+/i.test(line);

    if(isQuestionNumber){

      const content =
        line.replace(
          /^(?:Q\s*)?\d+[\.\)]\s*/i,
          ""
        );

      // ===============================
      // DETECT IF THIS IS
      // A REAL QUESTION
      // ===============================

      const hasQuestionPattern =

        // punctuation endings
        /[:?]["”']?\s*$/.test(content) ||

        // UPSC style prompts
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

      // ===============================
      // REAL QUESTION
      // → convert to Qx.
      // ===============================

      if(hasQuestionPattern){

        const qNum =
          line.match(/\d+/)?.[0] || "1";

        line =
          `Q${qNum}. ${content}`;

      }

      // otherwise:
      // leave numbered statements untouched
    }

    // ===============================
    // STANDARDIZE OPTIONS
    // ===============================

    line = line.replace(
      /^([A-D])[\.\):-]\s*/i,
      "$1) "
    );

    cleaned.push(line);

  }

  // ===============================
  // FINAL CLEANUP
  // ===============================

  text =
    cleaned.join("\n");

  // collapse excessive empty lines
  text = text.replace(/\n{3,}/g, "\n\n");

  // add spacing before questions
  text = text.replace(
    /\n(Q\d+\.)/g,
    "\n\n$1"
  );

  // trim
  text = text.trim();

  // ===============================
  // WRITE BACK
  // ===============================

  document.getElementById("input").value =
    text;

  console.log("✅ QCP CLEAN COMPLETE");

  alert("QCP cleaned successfully");

}

// ===============================
// PARSER v3
// PrepOS Structural Parser
// ===============================

function parseQuiz(text){

  // ===============================
  // NORMALIZE INPUT
  // ===============================

  text = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  // remove markdown separators
  text = text.replace(/^---+$/gm, "");

  // ===============================
  // REQUIRE QCP FORMAT
  // Parser ONLY splits on:
  //
  // Q1.
  // Q2.
  // Q3.
  //
  // This prevents corruption of:
  // - statement questions
  // - match list
  // - chronology
  // - assertion reason
  // ===============================

  const blocks = text
    .split(/\n(?=Q\d+[\.\)]\s)/gi)
    .map(b => b.trim())
    .filter(Boolean);

  console.log("📦 BLOCKS:", blocks);

  // ===============================
  // PARSE EACH BLOCK
  // ===============================

  return blocks.map(block => {

    // ===============================
    // SPLIT LINES
    // ===============================

    let lines = block
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    if(!lines.length){
      return null;
    }

    // ===============================
    // FIND ANSWER
    // ===============================

    const answerIndex =
      lines.findIndex(
        l => /^Answer\s*:/i.test(l)
      );

    if(answerIndex === -1){

      console.log(
        "❌ No answer found:",
        lines
      );

      return null;
    }

    // ===============================
    // EXTRACT ANSWER LETTER
    // ===============================

    const answerLine =
      lines[answerIndex];

    const answerMatch =
      answerLine.match(/Answer\s*:\s*([A-D])\b/i);

    const answer =
      answerMatch
        ? answerMatch[1].toUpperCase()
        : "A";

    // ===============================
    // FIND EXPLANATION
    // ===============================

    const explanationIndex =
      lines.findIndex(
        l => /^Explanation\s*:/i.test(l)
      );

    let explanation = "";

    if(explanationIndex !== -1){

      explanation =
        lines
          .slice(explanationIndex)
          .join("\n")
          .replace(/^Explanation\s*:/i, "")
          .trim();

    }

    // ===============================
    // OPTION DETECTION
    //
    // STRICT:
    // A)
    // B)
    // C)
    // D)
    //
    // Prevents corruption from:
    // A. in match lists
    // numbered statements
    // ===============================

    const optionRegex =
      /^[A-D][\)\.\:\-]\s+/i;

    const optionLines =
      lines.filter((line, idx) => {

        return (
          idx < answerIndex &&
          optionRegex.test(line)
        );

      });

    // ===============================
    // VALIDATE OPTIONS
    // ===============================

    if(optionLines.length !== 4){

      console.log(
        "❌ Invalid option count:",
        optionLines,
        lines
      );

      return null;
    }

    // ===============================
    // BUILD OPTIONS
    // ===============================

    const optionsArray =
      optionLines.map((line, idx) => ({

        id:
          ["A","B","C","D"][idx],

        text:
          line
            .replace(optionRegex, "")
            .trim()

      }));

    // ===============================
    // FIND QUESTION BODY
    // ===============================

    const firstOptionLine =
      optionLines[0];

    const firstOptionIndex =
      lines.indexOf(firstOptionLine);

    if(firstOptionIndex === -1){

      console.log(
        "❌ Option index failure",
        lines
      );

      return null;
    }

    // ===============================
    // QUESTION TEXT
    // Preserve ALL internal numbering
    // ===============================

    let questionText =
      lines
        .slice(0, firstOptionIndex)
        .join("\n");

    // remove Qx prefix ONLY
    questionText =
      questionText.replace(
        /^Q\d+[\.\)]\s*/i,
        ""
      ).trim();

    // ===============================
    // DEBUG
    // ===============================

    console.log(
      "✅ QUESTION:",
      questionText
    );

    // ===============================
    // RETURN PREPOS SCHEMA
    // ===============================

    return {

      id:
        crypto.randomUUID(),

      question_id:
        null,

      text:
        questionText,

      options:
        optionsArray,

      correct:
        answer,

      explanation:
        explanation,

      topics: [],

      bank_status:
        "draft",

      primary_pattern:
        null,

      generator: {

        enabled:
          false,

        subject:
          "general",

        pattern:
          null,

        source:
          "parser",

        version:
          1,

        last_generated_at:
          null

      },

      difficulty: {

        cognitive_level:
          null,

        complexity_level:
          null,

        depth_level:
          null,

        score:
          null,

        label:
          null

      }

    };

  }).filter(Boolean);

}

// ==============================================
// GENERATE
// ==============================================

async function generate(){

  console.log(
    "🔥 GENERATE TRIGGERED"
  );

  const text =
    document.getElementById("input").value;

  const questions =
    parseQuiz(text);

  console.log(
    "🔥 PARSED QUESTIONS:",
    questions
  );

  if(!questions.length){

    alert(
      "No valid questions detected."
    );

    return;

  }

  // ============================================
  // DYNAMIC TITLE
  // ============================================

  function buildExamTitle(

    base = "PrepOS Quiz"

  ){

    const d = new Date();

    const date =
      d.toLocaleDateString(
        undefined,
        {
          day: "2-digit",
          month: "short"
        }
      );

    const time =
      d.toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      );

    return `${base} — ${date} ${time}`;

  }

  const title =
    buildExamTitle();

  const duration =

    parseInt(
      document.getElementById(
        "duration"
      ).value
    )

    || 10;

  // ============================================
  // STORE
  // ============================================

  sessionStorage.setItem(

    "parsedData",

    JSON.stringify({

      title,

      duration,

      questions

    })

  );

  // ============================================
  // REDIRECT
  // ============================================

  window.location.href =
    "parser-review.html";

}

window.createDraft = createDraft;
window.cleanQCP = cleanQCP;
window.generate = generate;

bootPage({
  roles: ["teacher", "admin"],
  nav: {
    title: "Paste Quiz",
    preset: "teacherCreate",
    back: "creator-mode.html",
  },
});