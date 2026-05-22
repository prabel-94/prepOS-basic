// =========================
// STUDENT DASHBOARD
// =========================

import { getClient } from "./core/get-client.js";

let sb;

function escapeHTML(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}


async function requireStudentAccess(){

  const { data: userData } = await sb.auth.getUser()
  const user = userData?.user

  if(!user){
    window.location.href = "login.html"
    return
  }

  const { data, error } = await sb
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  if(error || !data){
    window.location.href = "login.html"
    return
  }

  const role = data.role

  if(role !== "student" && role !== "admin"){
    window.location.href = "login.html"
  }
}
/* =========================
START EXAM
========================= */

function startExam(){
  const id = document.getElementById("examId").value.trim()

  if(!id){
    alert("Enter exam id")
    return
  }

  location.href = `exam.html?id=${id}`
}

function startExamById(id){
  location.href = `exam.html?id=${id}`
}

function goToPractice(){
  location.href = "practice.html"
}

/* =========================
AVAILABLE EXAMS
========================= */

async function loadAvailableExams(){

  const container = document.getElementById("availableExams")
  if (!container) {
  console.error("availableExams container missing");
  return;
}

  try{

    const { data: userData } = await sb.auth.getUser()
    const user = userData?.user

    if(!user){
      throw new Error("User not authenticated")
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/exam_assignments?select=exam_sessions(id,title,created_at)&student_id=eq.${encodeURIComponent(user.id)}`,
      {
        headers:{
          apikey: SUPABASE_ANON_KEY,
          Authorization:`Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    )

    if(!res.ok){
      throw new Error("Failed to load exams")
    }

    const data = await res.json()
    const exams = data
      .map(assignment => assignment.exam_sessions)
      .filter(Boolean)

    container.innerHTML = ""

    if(!exams.length){
      container.innerHTML = "<div class='empty-state'>No exams available</div>"
      return
    }

    exams.forEach(exam => {

      const div = document.createElement("div")
      div.className = "recent-item mt-10"

      div.innerHTML = `
        <b>${escapeHTML(exam.title || "Untitled Exam")}</b><br>
        <div class="text-muted mt-5">
          ${new Date(exam.created_at).toLocaleString()}
        </div>
        <button 
          class="primary-btn mt-10"
          onclick="startExamById('${exam.id}')"
        >
          Start
        </button>
      `

      container.appendChild(div)

    })

  }catch(err){
    console.error(err)
    container.innerHTML = "<div class='empty-state'>Unable to load exams</div>"
  }
}

/* =========================
RECENT ATTEMPTS
========================= */

async function loadRecentAttempts(){

  const container = document.getElementById("recentAttempts")

  try{

    const { data: userData } = await sb.auth.getUser()
    const user = userData.user

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/exam_attempts?select=id,score,exam_id,submitted_at&student_id=eq.${user.id}&order=submitted_at.desc&limit=5`,
      {
        headers:{
          apikey: SUPABASE_ANON_KEY,
          Authorization:`Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    )

    const data = await res.json()

    container.innerHTML=""

    if(!data.length){
      container.innerHTML="<div class='empty-state'>No attempts yet</div>"
      return
    }

    data.forEach(a=>{

      const div=document.createElement("div")
      div.className="recent-item mt-10"

      div.innerHTML=`
        <b>Exam ID: ${a.exam_id}</b><br>
        Score: ${a.score}<br>
        <div class="text-muted mt-5">
          ${new Date(a.submitted_at).toLocaleString()}
        </div>
      `

      container.appendChild(div)

    })

  }catch(err){
    console.error(err)
    container.innerHTML="<div class='empty-state'>Unable to load attempts</div>"
  }
}

/* =========================
PERFORMANCE
========================= */

async function loadPerformance(){

  const container = document.getElementById("performanceBox")

  try{

    const { data: userData } = await sb.auth.getUser()
    const user = userData.user

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/exam_attempts?select=score&student_id=eq.${user.id}`,
      {
        headers:{
          apikey: SUPABASE_ANON_KEY,
          Authorization:`Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    )

    const data = await res.json()

    if(!data.length){
      container.innerHTML="No data yet"
      return
    }

    const scores = data.map(x=>x.score)
    const avg = Math.round(scores.reduce((a,b)=>a+b,0)/scores.length)

    container.innerHTML = `
      Average Score: <b>${avg}%</b><br>
      Attempts: ${scores.length}
    `

  }catch(err){
    console.error(err)
    container.innerHTML="Unable to load performance"
  }
}

/* =========================
INIT
========================= */

async function initStudent(){

  sb = await getClient();

  await requireAuth()
  await requireStudentAccess()

  await loadAvailableExams()
  await loadRecentAttempts()
  await loadPerformance()

}

/* =========================
EXPORT TO WINDOW
========================= */

window.startExam = startExam
window.startExamById = startExamById
window.goToPractice = goToPractice
window.initStudent = initStudent
