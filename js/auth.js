// ===============================
// Simple Dev Password Gate
// ===============================

const DEV_PASSWORD = "Bonda007"; // change this

function checkAccess() {
  const allowed = localStorage.getItem("prepos_access");

  if (allowed === "granted") return;

  const entered = prompt("Enter access password:");

  if (entered === DEV_PASSWORD) {
    localStorage.setItem("prepos_access", "granted");
  } else {
    alert("Access denied");
    document.body.innerHTML = "<h2 style='text-align:center;margin-top:50px;'>Access Denied</h2>";
  }
}

// Run immediately
checkAccess();