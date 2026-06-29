# AGENTS.md

## Cursor Cloud specific instructions

PrepOS is a **no-build static frontend** (plain HTML/CSS/vanilla JS in the repo root) backed by a **hosted Supabase** project. There is no package manager, no build step, and no lint/test tooling (see `.github/copilot-instructions.md`).

### Running the app (dev)
- Serve the repo root with any static server, e.g. `python3 -m http.server 3000` (run from `/workspace`), then open `http://127.0.0.1:3000/index.html`.
- Entry pages: `index.html` (teacher console), `exam-creator.html` (create), `draft.html` (edit/publish), `exam.html?id=<id>` (student), `teacher-results.html` / `results.html` (results).
- Frontend libs (`@supabase/supabase-js`, `html2pdf.js`, `eruda`) load from public CDNs, so internet access is required at runtime.

### Backend
- The frontend targets a hosted Supabase project; the URL + anon key live in `js/config.js`. The same Supabase URL (and the edge-function URLs) are **also hardcoded** in `js/creator.js`, `js/draft.js`, and `results.html` — repoint all of them if you ever switch backends.

### Known runtime gotchas (app/data divergence, not environment)
- **Reads work** with the committed anon key: the home page "Recent Exams" list populates from `exam_sessions`, and `exam.html` fetches an exam by id.
- **Writes are gated by the live backend.** Anon inserts into `exam_attempts` are rejected by RLS (`42501`), and the deployed `create-exam` function returns `Unauthorized` (the deployed function has auth logic not present in `supabase/functions/create-exam/index.ts`). So the create → publish → submit flows cannot be exercised end-to-end with only the committed anon key.
- **Existing published exams use a legacy schema** (question text under `text`, `options` as `{id,text}` objects, `correct` as a letter like `"C"`). The current `js/exam.js` / `js/creator.js` expect the "unified" schema (`question` string, `options` as plain strings, `correct` as a numeric index). As a result, opening an existing exam renders questions as `undefined` and options as `[object Object]`. This is a code/data mismatch, not an environment problem.
- `publish-draft` requires `q.question` to exist, which only gets populated after editing a question in the draft editor (`saveDraft` writes the `question` field) — a freshly parsed/created draft will fail publish validation until edited.

### Running Supabase locally (optional, not set up here)
- `supabase/config.toml` exists but there are **no migrations and no `seed.sql`** in the repo (despite `config.toml` referencing `./seed.sql`). A local `supabase start` requires Docker (not preinstalled in this VM) and you would have to create the `draft_exams`, `exam_sessions`, `exam_attempts` tables and the `logos` storage bucket manually, set function secrets (`PROJECT_URL`, `SERVICE_ROLE_KEY`, `SITE_URL`), and repoint the hardcoded URLs above.
