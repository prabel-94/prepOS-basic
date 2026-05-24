import { bootPage } from "./core/page-boot.js";
import { getClient } from "./core/get-client.js";

function goToStudent() {
  location.href = "student-dashboard.html";
}

function goToCreatorMode() {
  location.href = "creator-mode.html";
}

function openExam() {
  const id = document.getElementById("examId2")?.value.trim();
  if (!id) {
    alert("Enter exam id");
    return;
  }
  location.href = `exam.html?id=${id}`;
}

function viewResults(examId) {
  localStorage.setItem("results_exam", examId);
  location.href = `teacher-results.html?examId=${encodeURIComponent(examId)}`;
}

async function loadRecentExams() {
  const container = document.getElementById("recentExams");
  if (!container) return;

  try {
    const sb = await getClient();
    const { data, error } = await sb
      .from("exam_sessions")
      .select("id, title, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) throw error;

    container.innerHTML = "";

    if (!data?.length) {
      container.innerHTML = "<div class='empty-state'>No exams yet</div>";
      return;
    }

    data.forEach((exam) => {
      const div = document.createElement("div");
      div.className = "recent-item mt-10";
      div.innerHTML = `
        <b>${exam.title}</b><br>
        <div class="mt-5">
          <button onclick="location.href='exam.html?id=${exam.id}'">Open</button>
          <button onclick="viewResults('${exam.id}')">Results</button>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (error) {
    console.error(error);
    container.innerHTML = "<div class='empty-state'>Unable to load exams</div>";
  }
}

async function loadRecentDraft() {
  const container = document.getElementById("recentDraft");
  if (!container) return;

  try {
    const sb = await getClient();
    const { data, error } = await sb
      .from("draft_exams")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data?.length) {
      container.innerHTML = "<div class='empty-state'>No drafts yet</div>";
      return;
    }

    const draft = data[0];
    container.innerHTML = `
      <div class="recent-item">
        <b>${draft.title}</b><br>
        <button class="mt-5" onclick="location.href='draft.html?id=${draft.id}'">
          Resume Draft
        </button>
      </div>
    `;
  } catch (error) {
    container.innerHTML = "<div class='empty-state'>Unable to load draft</div>";
  }
}

async function initTeacherHome() {
  const runtime = await bootPage({
    roles: ["teacher", "admin"],
    nav: {
      variant: "home",
      title: "Teacher Console",
      subtitle: "Manage exams, question bank, and results",
      links: [
        { label: "Question Bank", href: "qb-manager.html" },
        { label: "Published", href: "published-exams.html" },
        { label: "Results", href: "teacher-results.html" },
      ],
    },
  });

  if (!runtime) return;

  await loadRecentExams();
  await loadRecentDraft();
}

window.goToStudent = goToStudent;
window.goToCreatorMode = goToCreatorMode;
window.openExam = openExam;
window.viewResults = viewResults;

initTeacherHome();
