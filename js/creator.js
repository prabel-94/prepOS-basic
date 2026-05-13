// ==============================================
// PrepOS Creator System v2
// creator.js
// ==============================================

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

// ==============================================
// QCP CLEAN
// Question Canonicalization Protocol
// PrepOS Parser Architecture v3
// ==============================================

function cleanQCP(){

  let text =
    document.getElementById("input").value;

  // ============================================
  // BASIC NORMALIZATION
  // ============================================

  text = text

    // windows line breaks
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")

    // emoji cleanup
    .replace(/[✅✔️💡⭐✨🔥]/g, "")

    // normalize answer labels
    .replace(
      /\b(Ans|Correct option)\b\s*[:\-]?\s*/gi,
      "Answer: "
    )

    // normalize explanation labels
    .replace(
      /\bExplanation\b\s*[:\-]?\s*/gi,
      "Explanation: "
    )

    // remove separator lines
    .replace(/^---+$/gm, "")

    // collapse spaces
    .replace(/[ \t]+/g, " ")

    // remove trailing spaces
    .replace(/[ \t]+$/gm, "")

    .trim();

  // ============================================
  // SPLIT INTO LINES
  // ============================================

  let lines =
    text
      .split("\n")
      .map(l => l.trimEnd());

  // ============================================
  // REMOVE EVERYTHING BEFORE FIRST QUESTION
  // ============================================

  let firstQuestionIndex = -1;

  for(let i = 0; i < lines.length; i++){

    const line =
      lines[i].trim();

    // must begin with number
    if(
      !/^\d+[\.\)]\s+/.test(line)
    ){
      continue;
    }

    // look ahead block
    const block =
      lines
        .slice(i, i + 30)
        .join("\n");

    // must contain options
    const hasOptions =

      /A[\)\.]/.test(block) &&
      /B[\)\.]/.test(block) &&
      /C[\)\.]/.test(block) &&
      /D[\)\.]/.test(block);

    // must contain answer
    const hasAnswer =
      /Answer\s*:/i.test(block);

    // question-style syntax
    const looksLikeQuestion =

      /[:?]$/.test(line) ||

      /\bWhich\b/i.test(line) ||

      /\bWhat\b/i.test(line) ||

      /\bWho\b/i.test(line) ||

      /\bWhy\b/i.test(line) ||

      /\bHow\b/i.test(line) ||

      /\bConsider\b/i.test(line) ||

      /\bArrange\b/i.test(line) ||

      /\bMatch\b/i.test(line) ||

      /\bSelect\b/i.test(line) ||

      /\bChoose\b/i.test(line) ||

      /\bIdentify\b/i.test(line) ||

      /\bAssertion\b/i.test(line) ||

      /\bReason\b/i.test(line) ||

      /\bWith reference\b/i.test(line) ||

      /\bHow many\b/i.test(line);

    if(
      hasOptions &&
      hasAnswer &&
      looksLikeQuestion
    ){

      firstQuestionIndex = i;
      break;

    }

  }

  // remove intro/header text
  if(firstQuestionIndex > 0){

    lines =
      lines.slice(firstQuestionIndex);

  }

  // ============================================
  // CANONICALIZE QUESTIONS
  // Convert:
  // 1. Question...
  // ->
  // Q1. Question...
  // ============================================

  for(let i = 0; i < lines.length; i++){

    const line =
      lines[i].trim();

    // already canonical
    if(
      /^Q\d+[\.\)]/i.test(line)
    ){
      continue;
    }

    // must begin with number
    const numberMatch =
      line.match(
        /^(\d+)([\.\)])\s+(.*)$/
      );

    if(!numberMatch){
      continue;
    }

    const [
      ,
      num,
      sep,
      content
    ] = numberMatch;

    // ==========================================
    // LOOKAHEAD WINDOW
    // ==========================================

    const block =
      lines
        .slice(i, i + 30)
        .join("\n");

    const hasOptions =

      /A[\)\.]/.test(block) &&
      /B[\)\.]/.test(block) &&
      /C[\)\.]/.test(block) &&
      /D[\)\.]/.test(block);

    const hasAnswer =
      /Answer\s*:/i.test(block);

    // ==========================================
    // QUESTION STEM DETECTION
    // Prevent statement corruption
    // ==========================================

    const looksLikeQuestion =

      /[:?]$/.test(line) ||

      /\bWhich\b/i.test(line) ||

      /\bWhat\b/i.test(line) ||

      /\bWho\b/i.test(line) ||

      /\bWhy\b/i.test(line) ||

      /\bHow\b/i.test(line) ||

      /\bConsider\b/i.test(line) ||

      /\bArrange\b/i.test(line) ||

      /\bMatch\b/i.test(line) ||

      /\bSelect\b/i.test(line) ||

      /\bChoose\b/i.test(line) ||

      /\bIdentify\b/i.test(line) ||

      /\bAssertion\b/i.test(line) ||

      /\bReason\b/i.test(line) ||

      /\bWith reference\b/i.test(line) ||

      /\bHow many\b/i.test(line);

    // ==========================================
    // REAL QUESTION
    // ==========================================

    if(
      hasOptions &&
      hasAnswer &&
      looksLikeQuestion
    ){

      lines[i] =
        `Q${num}${sep} ${content}`;

    }

  }

  // ============================================
  // NORMALIZE QUESTION SPACING
  // ============================================

  let output =
    lines.join("\n");

  // spacing before questions
  output = output.replace(

    /\n(?=Q\d+[\.\)])/g,

    "\n\n"

  );

  // collapse huge gaps
  output = output.replace(
    /\n{3,}/g,
    "\n\n"
  );

  output = output.trim();

  // ============================================
  // WRITE BACK
  // ============================================

  document.getElementById("input").value =
    output;

  // ============================================
  // FEEDBACK
  // ============================================

  alert("QCP cleanup complete");

}

// ==============================================
// PARSER
// ==============================================

function parseQuiz(text){

  // ============================================
  // NORMALIZE
  // ============================================

  text = text

    .replace(/\r\n/g, "\n")

    .replace(/\r/g, "\n")

    .replace(/^---$/gm, "")

    .trim();

  // ============================================
  // SPLIT QUESTIONS
  // ONLY SPLIT ON:
  // Q1.
  // Q2)
  // ============================================

  const blocks = text

    .split(
      /\n(?=Q\d+[\.\)])/g
    )

    .map(b => b.trim())

    .filter(Boolean);

  // ============================================
  // PARSE EACH BLOCK
  // ============================================

  return blocks.map(block => {

    // ==========================================
    // CLEAN LINES
    // ==========================================

    let lines = block

      .split(/\n+/)

      .map(l => l.trim())

      .filter(Boolean);

    // ==========================================
    // FIND ANSWER
    // ==========================================

    const answerIndex =
      lines.findIndex(l =>

        /^Answer\s*:/i.test(l)

      );

    if(answerIndex === -1){

      console.log(
        "❌ No answer found",
        lines
      );

      return null;

    }

    // ==========================================
    // ANSWER LETTER
    // ==========================================

    let answerRaw =

      (
        lines[answerIndex]
        .split(":")[1] || ""
      )

      .trim();

    const answerMatch =
      answerRaw.match(/[A-D]/i);

    const answer =

      answerMatch

      ? answerMatch[0].toUpperCase()

      : "A";

    // ==========================================
    // EXPLANATION
    // ==========================================

    const explanationIndex =
      lines.findIndex(l =>

        /^Explanation\s*:/i.test(l)

      );

    let explanation = "";

    if(explanationIndex !== -1){

      explanation = lines

        .slice(explanationIndex)

        .join("\n")

        .replace(
          /^Explanation\s*:/i,
          ""
        )

        .trim();

    }

    // ==========================================
    // OPTIONS
    // ==========================================

    const optionRegex =
      /^[A-Da-d][\.\)\:\-]\s*/;

    const optionLines =
      lines.filter((l, idx) => {

        return (

          idx < answerIndex &&

          optionRegex.test(l)

        );

      });

    // ==========================================
    // VALIDATE OPTIONS
    // ==========================================

    if(optionLines.length !== 4){

      console.log(
        "❌ Invalid options",
        optionLines,
        lines
      );

      return null;

    }

    // ==========================================
    // OPTIONS ARRAY
    // ==========================================

    const optionsArray =
      optionLines.map((o, idx) => ({

        id:
          ["A","B","C","D"][idx],

        text:
          o
            .replace(optionRegex, "")
            .trim()

      }));

    // ==========================================
    // QUESTION TEXT
    // ==========================================

    const firstOptionLine =
      optionLines[0];

    const firstOptionIndex =
      lines.indexOf(
        firstOptionLine
      );

    if(firstOptionIndex === -1){

      console.log(
        "❌ Option index issue"
      );

      return null;

    }

    const rawQuestion =

      lines
        .slice(0, firstOptionIndex)
        .join("\n");

    const question =
      cleanQuestionText(
        rawQuestion
      );

    console.log(
      "✅ FINAL QUESTION:",
      question
    );

    // ==========================================
    // RETURN PREPOS QUESTION
    // ==========================================

    return {

      id:
        crypto.randomUUID(),

      question_id:
        null,

      text:
        question,

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