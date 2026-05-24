import { bootPage } from "./core/page-boot.js";
import { getClient } from "./core/get-client.js";

let currentUser = null;
let currentRole = null;
let currentResponses = [];
let currentSort = "latest";
let resultsListenersAttached = false;

function normalizeAnswer(answer, index) {
  return {
    index: answer.q ?? answer.index ?? index,
    chosen: answer.chosen ?? "-",
    correct: answer.correct ?? null,
    is_correct: answer.is_correct ?? null,
    question_id: answer.question_id ?? null,
  };
}

function normalizeResponse(response) {
  return {
    ...response,
    student_name: response.student_name || "Unknown",
    answers: Array.isArray(response.answers)
      ? response.answers.map(normalizeAnswer)
      : [],
  };
}

function getPreselectedExamId(exams) {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("examId");
  const fromStorage = localStorage.getItem("results_exam");

  if (fromQuery) {
    return fromQuery;
  }

  if (fromStorage) {
    localStorage.removeItem("results_exam");
    return fromStorage;
  }

  return exams[0]?.id ?? null;
}

async function loadExams() {
  const sb = await getClient();
  const resultsEl = document.getElementById("results");
  const select = document.getElementById("examSelect");

  try {
    let query = sb
      .from("exam_sessions")
      .select("id,title,created_at")
      .order("created_at", { ascending: false });

    if (currentRole !== "admin") {
      query = query.eq("created_by", currentUser.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const exams = data || [];
    select.innerHTML = "";

    if (!exams.length) {
      if (resultsEl) {
        resultsEl.innerHTML =
          "<div class='empty-state'>No published exams found for your account</div>";
      }
      return;
    }

    exams.forEach((exam) => {
      const option = document.createElement("option");
      option.value = exam.id;
      option.textContent = exam.title || "Untitled Exam";
      select.appendChild(option);
    });

    const preselected = getPreselectedExamId(exams);
    if (preselected && exams.some((exam) => exam.id === preselected)) {
      select.value = preselected;
    }

    await loadResponses(select.value);

    if (!resultsListenersAttached) {
      select.addEventListener("change", (event) => {
        loadResponses(event.target.value);
      });

      document.getElementById("sortSelect")?.addEventListener("change", (event) => {
        currentSort = event.target.value;
        render(currentResponses);
      });

      resultsListenersAttached = true;
    }
  } catch (error) {
    console.error("Failed to load exams:", error);
    if (resultsEl) {
      resultsEl.innerHTML =
        "<div class='empty-state'>Failed to load exams. Sign in as the teacher who published this exam.</div>";
    }
  }
}

async function loadResponses(examId) {
  const sb = await getClient();
  const resultsEl = document.getElementById("results");

  if (!examId) {
    if (resultsEl) {
      resultsEl.innerHTML = "<div class='empty-state'>Select an exam</div>";
    }
    return;
  }

  if (resultsEl) {
    resultsEl.innerHTML = "Loading…";
  }

  try {
    const { data, error } = await sb
      .from("exam_attempts")
      .select("*")
      .eq("exam_id", examId)
      .order("submitted_at", { ascending: false });

    if (error) throw error;

    currentResponses = Array.isArray(data) ? data.map(normalizeResponse) : [];
    render(currentResponses);
  } catch (error) {
    console.error("Failed to load responses:", error);
    if (resultsEl) {
      resultsEl.innerHTML =
        "<div class='empty-state'>Failed to load attempts for this exam</div>";
    }
  }
}

function sortResponses(list) {
  const sorted = [...list];

  if (currentSort === "high") {
    sorted.sort((a, b) => (b.score || 0) - (a.score || 0));
  } else if (currentSort === "low") {
    sorted.sort((a, b) => (a.score || 0) - (b.score || 0));
  } else {
    sorted.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  }

  return sorted;
}

function render(list) {
  const container = document.getElementById("results");
  container.innerHTML = "";

  if (!list.length) {
    container.innerHTML = "<div class='empty-state'>No submissions yet</div>";
    return;
  }

  const sorted = sortResponses(list);
  const countMap = {};
  sorted.forEach((response) => {
    countMap[response.student_name] = (countMap[response.student_name] || 0) + 1;
  });

  const maxScore = Math.max(...sorted.map((response) => response.score || 0));

  sorted.forEach((response) => {
    const name = response.student_name;
    const attempts = countMap[name] || 1;
    const submitted = response.submitted_at
      ? new Date(response.submitted_at).toLocaleString()
      : "-";
    const answers = response.answers;
    const isTop = (response.score || 0) === maxScore && maxScore > 0;

    const card = document.createElement("div");
    card.className = "attempt-card";
    card.innerHTML = `
      <div class="attempt-header">
        <div class="student-name">
          ${name} ${attempts > 1 ? `(${attempts} attempts)` : ""}
          ${isTop ? " 🏆" : ""}
        </div>
        <div class="score-badge">${response.score ?? "-"}</div>
      </div>
      <div class="attempt-meta">${submitted}</div>
      <div class="attempt-actions">
        <button class="primary-btn view-btn">View Answers</button>
        <button class="secondary-btn history-btn">History</button>
      </div>
      <div class="answer-box hidden"></div>
    `;

    const viewBtn = card.querySelector(".view-btn");
    const answerBox = card.querySelector(".answer-box");

    viewBtn.onclick = () => {
      answerBox.classList.toggle("hidden");

      if (!answerBox.classList.contains("hidden")) {
        answerBox.innerHTML = answers.length
          ? answers.map((answer) => `
              <div class="answer-row">
                Q${answer.index + 1}:
                <b>${answer.chosen}</b>
                ${answer.correct ? `(Correct: ${answer.correct})` : ""}
                ${answer.is_correct === false ? " ❌" : ""}
                ${answer.is_correct === true ? " ✔" : ""}
              </div>
            `).join("")
          : "<div class='small'>No answers recorded</div>";
      }

      viewBtn.innerText = answerBox.classList.contains("hidden")
        ? "View Answers"
        : "Hide Answers";
    };

    card.querySelector(".history-btn").onclick = () => showHistory(name);
    container.appendChild(card);
  });
}

function showHistory(name) {
  const list = currentResponses
    .filter((response) => response.student_name === name)
    .sort((a, b) => (a.version || 0) - (b.version || 0));

  let text = `${name}\n\n`;
  list.forEach((response) => {
    text += `Attempt ${response.version ?? "-"} — Score ${response.score ?? "-"} — ${response.submitted_at}\n`;
  });

  alert(text);
}

function exportCSV() {
  if (!currentResponses.length) return;

  const rows = [["name", "score", "version", "submitted"]];
  currentResponses.forEach((response) => {
    rows.push([
      response.student_name,
      response.score,
      response.version,
      response.submitted_at,
    ]);
  });

  const csv = rows.map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "results.csv";
  anchor.click();
}

async function initResultsViewer() {
  try {
    const runtime = await bootPage({
      roles: ["teacher", "admin"],
      nav: {
        title: "Results Viewer",
        preset: "teacherExam",
      },
    });

    if (!runtime) return;

    currentUser = runtime.user;
    currentRole = runtime.role;
    await loadExams();
  } catch (error) {
    console.error(error);
    document.getElementById("results").innerHTML =
      "<div class='empty-state'>PrepOS could not load Supabase. Hard refresh (Ctrl+Shift+R) and try again.</div>";
  }
}

window.exportCSV = exportCSV;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initResultsViewer);
} else {
  initResultsViewer();
}
