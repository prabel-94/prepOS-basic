/* ========================================
PrepOS Supabase Configuration
Safe for multi-page applications
======================================== */

/* Supabase project credentials */

const SUPABASE_URL = "https://bcqjfosxneuyoyuzhdiq.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcWpmb3N4bmV1eW95dXpoZGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDI2OTIsImV4cCI6MjA4NzUxODY5Mn0.mPvlN_JEov6cxCXjMlARrzd5zyFHPH131whlB1cQClA"

/* ========================================
Create Supabase client safely
======================================== */

/*
We only create the client if it does not
already exist. This prevents duplicate
client creation when pages reload scripts.
*/

if(!window.supabaseClient){

window.supabaseClient = window.supabase.createClient(
SUPABASE_URL,
SUPABASE_ANON_KEY
)

}

/* ========================================
Expose credentials if needed
======================================== */

window.SUPABASE_URL = SUPABASE_URL
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY




