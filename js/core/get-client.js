// ========================================
// PrepOS Client Runtime Loader
// ========================================

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
