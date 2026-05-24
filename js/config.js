/* ========================================
PrepOS Supabase Configuration
Singleton-safe for multi-page apps
v20260520 — never uses bare `supabase` global
======================================== */

/**
 * GitHub Pages project site base path (no trailing slash).
 * Auto-detected from js/config.js URL when null; set explicitly if needed.
 * Example: "/prepos-basic" for https://user.github.io/prepos-basic/
 */
window.PREPOS_BASE_PATH = window.PREPOS_BASE_PATH ?? null

const SUPABASE_URL = "https://bcqjfosxneuyoyuzhdiq.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcWpmb3N4bmV1eW95dXpoZGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDI2OTIsImV4cCI6MjA4NzUxODY5Mn0.mPvlN_JEov6cxCXjMlARrzd5zyFHPH131whlB1cQClA"

const SUPABASE_CDN =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"

window.SUPABASE_URL = SUPABASE_URL
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY

function createSupabaseClient() {

  const lib = window.supabase

  if (!lib?.createClient) {
    return null
  }

  return lib.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  )
}

function assignClient(client) {
  if (!client) return false
  window.supabaseClient = client
  return true
}

/**
 * Ensure Supabase client exists (loads CDN if needed).
 * Call from pages before any DB/auth work.
 */
window.ensurePrepOSClient = function ensurePrepOSClient() {

  if (window.supabaseClient) {
    return Promise.resolve(window.supabaseClient)
  }

  const existing = createSupabaseClient()
  if (assignClient(existing)) {
    return Promise.resolve(window.supabaseClient)
  }

  return new Promise((resolve, reject) => {

    const done = () => {
      const client = createSupabaseClient()
      if (assignClient(client)) {
        resolve(window.supabaseClient)
      } else {
        reject(
          new Error(
            "[PrepOS] Supabase JS failed to initialize. Check CDN/network."
          )
        )
      }
    }

    const pending = document.querySelector(
      'script[data-prepos-supabase="1"]'
    )

    if (pending) {
      pending.addEventListener("load", done)
      pending.addEventListener("error", () => {
        reject(new Error("[PrepOS] Supabase CDN failed to load."))
      })
      return
    }

    const script = document.createElement("script")
    script.src = SUPABASE_CDN
    script.dataset.preposSupabase = "1"
    script.async = false
    script.onload = done
    script.onerror = () => {
      reject(new Error("[PrepOS] Supabase CDN failed to load."))
    }
    document.head.appendChild(script)

  })

}

/* Sync init when CDN script already ran */
if (!window.supabaseClient) {
  assignClient(createSupabaseClient())
}

/**
 * Shared hydration promise — await from analytics, realtime, dashboards, preload.
 * Do not call ensurePrepOSClient() directly unless you need a fresh attempt after failure.
 */
window.prepOSClientReady = window.ensurePrepOSClient()
