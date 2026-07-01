# Contributing to prepOS-basic

## Two-machine workflow

Develop from office and home by syncing through Git. App data lives in Supabase; Git carries code and docs.

### Start of session

```powershell
git pull
```

Use the same branch on both machines (for example `Question-Bank`):

```powershell
git checkout Question-Bank
git pull origin Question-Bank
```

### End of session

```powershell
git status
git add .
git commit -m "Describe what you finished"
git push
```

**Rule:** If you need it on the other computer, it must be **committed and pushed**. Uncommitted files and Cursor chat history do not sync.

### First-time setup on a new machine

```powershell
git clone https://github.com/prabel-94/prepOS-basic.git
cd prepOS-basic
git checkout Question-Bank
```

- Open the folder in Cursor.
- Supabase client config: `js/config.js` (committed).
- Cursor project settings: `.cursor/settings.json`.
- No bundler — static HTML/JS; serve locally or via GitHub Pages.
- For migrations: install [Supabase CLI](https://supabase.com/docs/guides/cli) and `supabase link` (link state stays local).

### What does not sync via Git

| Item | Notes |
|------|--------|
| Uncommitted changes | Commit or push before switching machines |
| Cursor conversations | Summarize context in a new chat, or use `docs/development/SESSION_HANDOFF.md` |
| Browser `localStorage` | Per browser — sign in again as needed |
| `supabase link` state | Re-link on each machine if you use the CLI |

### Avoid conflicts

1. **Pull before you edit** on every session.
2. Do not edit the same branch on both machines without pushing/pulling between sessions.
3. If `git pull` reports conflicts, resolve in the files, then `git add` and `git commit`.

### Supabase migrations

New files under `supabase/migrations/` sync via Git. Applying them to the remote database is a separate step (`supabase db push` or your usual deploy flow).

### Session handoff

When switching machines mid-task, update `docs/development/SESSION_HANDOFF.md` with branch, recent commits, and next steps. On the other machine, paste into Cursor:

> Read `docs/development/SESSION_HANDOFF.md` and continue from where we left off.

## Documentation

All project markdown lives under `docs/`. See [docs/README.md](docs/README.md) for the folder index.

## Tests

Node built-in tests (no `package.json`):

```powershell
node --test js/core/question-parser.test.js
node --test js/notes/msmdf-v3-sample-exports.test.js
```

Run individual `*.test.js` files as needed; each file header documents the command. The MSMDF v3.1 sample export test reads fixtures in `docs/notes/Sample v3 Exports/` and should be run after parser or registry changes.
