// ===============================
// PrepOS Auth Guard
// ===============================

async function requireAuth() {

  const {
    data: { user },
    error
  } = await sb.auth.getUser();

  if (error || !user) {
    window.location.href = "login.html";
    return false;
  }

  return true;
}

async function getCurrentUser(){

  const { data } = await sb.auth.getUser()
  return data.user

}

async function getUserRole(){

  const user = await getCurrentUser()

  if(!user) return null

  const { data, error } = await sb
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  if(error) return null

  return data.role

}