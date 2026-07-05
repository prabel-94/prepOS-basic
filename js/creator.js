// ==============================================
// PrepOS Creator System v2
// creator.js
// ==============================================

import { bootPage } from "./core/page-boot.js";
import { createDraft } from "./creator-draft.js";
import { parseQuiz, cleanQcpText } from "./core/question-parser.js?v=20260705";

function cleanQCP() {
  const input = document.getElementById("input");
  input.value = cleanQcpText(input.value);
  alert("QCP cleaned successfully");
}

async function generate() {
  const text = document.getElementById("input").value;
  const questions = parseQuiz(text);

  if (!questions.length) {
    alert("No valid questions detected.");
    return;
  }

  function buildExamTitle(base = "PrepOS Quiz") {
    const d = new Date();
    const date = d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
    });
    const time = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${base} — ${date} ${time}`;
  }

  const title = buildExamTitle();
  const secondsPerQuestion =
    parseInt(document.getElementById("secondsPerQuestion")?.value, 10) || 45;

  sessionStorage.setItem(
    "parsedData",
    JSON.stringify({
      title,
      duration: secondsPerQuestion,
      questions,
    })
  );

  window.location.href = "parser-review.html";
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
