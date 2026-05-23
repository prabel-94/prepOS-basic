// ========================================
// PrepOS Client Runtime Loader
// ========================================
//
// PrepOS Runtime Rule:
// Use Supabase client for database CRUD and auth-aware operations.
// Avoid raw REST fetch for internal tables (see js/core/db.js).
//

export async function getClient() {

  if (window.supabaseClient) {
    return window.supabaseClient
  }

  try {
    return await window.prepOSClientReady
  } catch (err) {
    window.prepOSClientReady = window.ensurePrepOSClient()
    throw err
  }

}
