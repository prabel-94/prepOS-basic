import { bootPage } from "./core/page-boot.js";

function goParser() {
  window.location.href = "exam-creator.html";
}

function goManual() {
  window.location.href = "draft.html?mode=new";
}

async function initCreatorMode() {
  const runtime = await bootPage({
    roles: ["teacher", "admin"],
    nav: {
      title: "Create Exam",
      preset: "teacherCreate",
      back: "index.html",
    },
  });

  if (!runtime) return;

  document.querySelector("[data-action='parser']")
    ?.addEventListener("click", goParser);

  document.querySelector("[data-action='manual']")
    ?.addEventListener("click", goManual);
}

window.goParser = goParser;
window.goManual = goManual;

initCreatorMode();
