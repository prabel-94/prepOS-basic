function cleanQuestionText(text) {
  return text
    .trim()
    // remove Q1. / Q 1. / Q1) / 1. / 1)
    .replace(/^Q?\s*\d+[\.\)]\s*/i, "")
    // remove (1)
    .replace(/^\(\d+\)\s*/, "")
    .trim();
}

// ===============================
// CREATE DRAFT (Edge Function)
// ===============================
async function createDraft(title, questions, duration){

try{

  const session = await sb.auth.getSession();
  const accessToken = session?.data?.session?.access_token;
  const headers = {
    "Content-Type":"application/json",
    apikey: SUPABASE_ANON_KEY
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else {
    alert("Please sign in to create an exam draft.");
    return null;
  }

  const res = await fetch(
    "https://bcqjfosxneuyoyuzhdiq.supabase.co/functions/v1/create-exam",
    {
      method:"POST",
      headers,
      body:JSON.stringify({title,questions,duration})
    }
  );

if(!res.ok){
const errorText = await res.text();
console.error("Create exam failed", res.status, errorText);
alert(`Failed to create exam draft (${res.status})`);
return null;
}

const data = await res.json();

console.log("CREATE EXAM RESPONSE:", data);

if(data.error){
  console.error("Create exam failed", data.error);
  alert(data.error);
  return null;
}

const draftId =
  data.draft_id ||
  data.draft?.id;

if(!draftId){

  console.error("Missing draft id", data);

  alert("Draft created but ID missing");

  return null;
}

const draftLink =
  `${window.location.origin}/draft.html?id=${draftId}`;

return draftLink;

}catch(e){
console.error(e);
alert("Failed to create draft");
return null;
}
}


// ===============================
// PARSER
// ===============================
function parseQuiz(text){

  // ===============================
  // NORMALIZE INPUT
  // ===============================

  text = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^---$/gm, "")
    .trim();

  // ===============================
  // SPLIT INTO QUESTION BLOCKS
  // Supports:
  // 1.
  // 1)
  // Q1.
  // Q1)
  // Q 1.
  // ===============================

  const blocks = text
    .split(/\n(?=(?:Q\s*)?\d+[\.\)])/gi)
    .map(b => b.trim())
    .filter(Boolean);

  return blocks.map(block => {

    // ===============================
    // CLEAN LINES
    // ===============================

    let lines = block
      .split(/\n+/)
      .map(l => l.trim())
      .filter(Boolean);

    // ===============================
    // MERGE ORPHAN NUMBERING
    // Example:
    // Q15
    // Which...
    // ===============================

    if (/^Q?\s*\d+\s*$/i.test(lines[0]) && lines[1]) {
      lines[1] = lines[0] + " " + lines[1];
      lines.shift();
    }

    // ===============================
    // FIND ANSWER
    // ===============================

    const answerIndex = lines.findIndex(
      l => /^Answer\s*:/i.test(l)
    );

    if (answerIndex === -1) {
      console.log("❌ No answer found", lines);
      return null;
    }

    // ===============================
    // EXTRACT ANSWER LETTER
    // Supports:
    // Answer: A
    // Answer: A)
    // Answer: Option A
    // ===============================

    let answerRaw =
      (lines[answerIndex].split(":")[1] || "")
        .trim();

    const answerMatch =
      answerRaw.match(/[A-D]/i);

    const answer =
      answerMatch
        ? answerMatch[0].toUpperCase()
        : "A";

    // ===============================
    // EXPLANATION
    // ===============================

    const explanationIndex = lines.findIndex(
      l => /^Explanation\s*:/i.test(l)
    );

    let explanation = "";

    if (explanationIndex !== -1) {

      explanation = lines
        .slice(explanationIndex)
        .join("\n")
        .replace(/^Explanation\s*:/i, "")
        .trim();
    }

    // ===============================
    // DETECT OPTIONS
    // Supports:
    // A.
    // A)
    // A:
    // A-
    // ===============================

    const optionRegex =
      /^[A-Da-d][\.\)\:\-]\s*/;

    const optionLines = lines.filter((l, idx) => {

      return (
        idx < answerIndex &&
        optionRegex.test(l) &&
        !/^\d+\.\s*/.test(l) // exclude numbered statements
      );

    });

    // ===============================
    // VALIDATE OPTIONS
    // ===============================

    if (optionLines.length !== 4) {

      console.log(
        "❌ Options issue:",
        optionLines,
        lines
      );

      return null;
    }

    // ===============================
    // BUILD OPTIONS ARRAY
    // ===============================

    const optionsArray = optionLines.map((o, idx) => ({
      id: ["A", "B", "C", "D"][idx],

      text: o
        .replace(optionRegex, "")
        .trim()
    }));

    // ===============================
    // FIND QUESTION TEXT
    // ===============================

    const firstOptionLine =
      optionLines[0];

    const firstOptionIndex =
      lines.indexOf(firstOptionLine);

    if (firstOptionIndex === -1) {

      console.log(
        "❌ Option index issue",
        lines
      );

      return null;
    }

    const rawQuestion = lines
      .slice(0, firstOptionIndex)
      .join("\n");

    const question =
      cleanQuestionText(rawQuestion);

    console.log(
      "✅ FINAL QUESTION:",
      question
    );

    // ===============================
    // RETURN UNIFIED SCHEMA
    // ===============================

    return {

      id: crypto.randomUUID(),

      question_id: null,

      text: question,

      options: optionsArray,

      // ✅ FIXED
      // entire PrepOS system expects:
      // "A" | "B" | "C" | "D"

      correct: answer,

      explanation: explanation,

      topics: [],

      bank_status: "draft",

      primary_pattern: null,

      generator: {
        enabled: false,
        subject: "general",
        pattern: null,
        source: "parser",
        version: 1,
        last_generated_at: null
      },

      difficulty: {
        cognitive_level: null,
        complexity_level: null,
        depth_level: null,
        score: null,
        label: null
      }

    };

  }).filter(Boolean);
}


// ===============================
// QCP CLEAN
// ===============================
function cleanQCP(){

let text = document.getElementById("input").value;

text = text.replace(/[✅✔️💡⭐✨🔥]/g,"");
text = text.replace(/-+/g,"");
text = text.replace(/\b(Ans|Correct option)\b\s*[:\-]?\s*/gi,"Answer: ");
text = text.replace(/\bExplanation\b\s*[:\-]?\s*/gi,"Explanation: ");
text = text.replace(/[ \t]+/g," ");
text = text.replace(/\n(?=Q?\s*\d+[\.\)])/g, "\n\n");
text = text.trim();

document.getElementById("input").value = text;

alert("Cleaned with QCP");
}


// ===============================
// GENERATE → REDIRECT TO DRAFT
// ===============================
async function generate(){
  console.log("🔥 GENERATE TRIGGERED");

const text = document.getElementById("input").value;
console.log("🔥 BEFORE PARSE");
const questions = parseQuiz(text);
console.log("🔥 AFTER PARSE", JSON.stringify(questions, null, 2));

if(!questions.length){
  alert("No valid questions detected.");
  return;
}

/* ⭐ build dynamic title */
function buildExamTitle(base="PrepOS Quiz"){
  const d = new Date();

  const date =
  d.toLocaleDateString(undefined,{
    day:"2-digit",
    month:"short"
  });

  const time =
  d.toLocaleTimeString([],{
    hour:"2-digit",
    minute:"2-digit"
  });

  return `${base} — ${date} ${time}`;
}

const title = buildExamTitle();
const duration =
parseInt(document.getElementById("duration").value)||10;

/* 🔥 NEW: Store instead of creating draft */
sessionStorage.setItem("parsedData", JSON.stringify({
  title,
  duration,
  questions
}));

/* 🔥 Redirect to review */
window.location.href = "parser-review.html";

}
