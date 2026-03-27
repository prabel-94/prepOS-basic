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

const res = await fetch(
"https://bcqjfosxneuyoyuzhdiq.supabase.co/functions/v1/create-exam",
{
method:"POST",
headers:{
"Content-Type":"application/json",
"apikey":SUPABASE_ANON_KEY,
"Authorization":`Bearer ${SUPABASE_ANON_KEY}`
},
body:JSON.stringify({title,questions,duration})
});

if(!res.ok){
alert("Failed to create exam draft")
console.error("Create exam failed",res.status)
return null
}

const data = await res.json();

if(data.error){
alert(data.error);
return null;
}

return data.draftLink;

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

const blocks = text
  .split(/\n(?=Q?\s*\d+\s*[\.\)]?)/g)
  .map(b => b.trim())
  .filter(b => b.length > 10);

return blocks.map(block=>{

let lines = block
  .split("\n")
  .map(l => l.trim())
  .filter(Boolean);

// 🔥 Merge orphan numbering lines (Q15. → next line)
if (/^Q?\s*\d+\s*$/.test(lines[0]) && lines[1]) {
  lines[1] = lines[0] + " " + lines[1];
  lines.shift();
}

const answerIndex = lines.findIndex(l=>/^Answer\s*:/i.test(l));
if(answerIndex===-1){
  console.log("❌ No answer found", lines);
  return null;
}

let answer = (lines[answerIndex].split(":")[1] || "").trim().toUpperCase();

// normalize formats like "Option D"
const match = answer.match(/[A-D]/);
answer = match ? match[0] : "A";

const explanationIndex = lines.findIndex(l=>/^Explanation\s*:/i.test(l));

let explanation="";
if(explanationIndex!==-1){
explanation = lines
.slice(explanationIndex)
.join("\n")
.replace(/^Explanation\s*:/i,"")
.trim();
}

// 🔍 detect options (A. B. C. D.)
const optionRegex = /^[A-Da-d][\.\)\:\-]\s*/;

const optionLines = lines.filter((l, idx) =>
  idx < answerIndex &&
  optionRegex.test(l) &&
  !/^\d+\.\s*/.test(l) // ❌ exclude numbered statements
);

if(optionLines.length !== 4){
  console.log("❌ Options issue:", optionLines, lines);
  return null;
}

const options = optionLines.map(o =>
  o.replace(optionRegex, "")
);

const firstOptionLine = optionLines[0];
const firstOptionIndex = lines.indexOf(firstOptionLine);

// 🔒 SAFETY GUARD
if(firstOptionIndex === -1){
  console.log("❌ Option index issue", lines);
  return null;
}

const rawQuestion = lines.slice(0, firstOptionIndex).join("\n");
const question = cleanQuestionText(rawQuestion);

console.log("FINAL QUESTION:", question);
return{
question:question,
options: options,
correct:answer,
explanation:explanation
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
console.log("🔥 AFTER PARSE", questions);

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
