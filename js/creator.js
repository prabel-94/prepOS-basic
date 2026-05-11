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
.split(/\n(?=Q\d+\.)/g)
.map(b=>b.trim())
.filter(Boolean);

return blocks.map(block=>{

const lines = block.split("\n").map(l=>l.trim()).filter(Boolean);

const answerIndex = lines.findIndex(l=>/^Answer\s*:/i.test(l));
if(answerIndex===-1) return null;

const answer = (lines[answerIndex].split(":")[1]||"").trim();

const explanationIndex = lines.findIndex(l=>/^Explanation\s*:/i.test(l));

let explanation="";
if(explanationIndex!==-1){
explanation = lines
.slice(explanationIndex)
.join("\n")
.replace(/^Explanation\s*:/i,"")
.trim();
}

const optionLines = lines.slice(answerIndex-4,answerIndex);
if(optionLines.length!==4) return null;

const questionText = lines.slice(0,answerIndex-4).join("\n");

// ⭐ UNIFIED SCHEMA TRANSFORMATION
const optionsArray = optionLines.map((o, i) => ({
  id: ["A", "B", "C", "D"][i],
  text: o.replace(/^[A-D]\.\s*/, "")
}));

// Map answer letter to correct index
const correctIndex = answer.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3

return {
  id: crypto.randomUUID(),
  question_id: null,
  text: questionText,
  options: optionsArray,
  correct: correctIndex, // ⭐ Store as index, not letter
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
text = text.replace(/\n(?=Q\d+\.)/g,"\n\n");
text = text.trim();

document.getElementById("input").value = text;

alert("Cleaned with QCP");
}


// ===============================
// GENERATE → REDIRECT TO DRAFT
// ===============================
async function generate(){

const text = document.getElementById("input").value;
const questions = parseQuiz(text);

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

const title = buildExamTitle();   // ✅ changed
const duration =
parseInt(document.getElementById("duration").value)||10;

const draftLink = await createDraft(title,questions,duration);

if(draftLink){
window.location.href = draftLink;
}

}
