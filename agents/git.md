# Feature: Per-context git

Each context is a stand-alone git repo. Commits are user-driven via
the navbar; pushes go to a configured `origin`.

## Storage

- The repo lives at `data/<ctx>/.git/`.
- Origin URL is stored in `settings.json#remote` and synced into
  `git remote set-url origin ...` whenever settings are saved.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/contexts/:id/commit` | Body `{message?}`. Adds and commits all changes. |
| POST | `/api/contexts/:id/push` | Push to origin. |
| GET | `/api/contexts/:id/git` | Status: dirty?, ahead/behind, last commit summary. |

## Backend helpers

- `gitInitIfNeeded(dir, displayName)` — creates the repo on first
  use, sets a default identity if global one is missing, makes an
  initial commit if empty.
- `gitIsRepo(dir)` — boolean.
- `git(dir, args)` — runs `git <args>` in `dir`, returns stdout. Uses
  `execSync` with `LANG=C` to keep output stable.
- `gitStatus(dir)` — porcelain status + ahead/behind counts.
- `formatGitStatus(c)` — renders the status block in the settings
  page master/detail UI.

## UI

- **Navbar commit button**: `ctxCommitBtn` in the context dropdown.
  Prompts for an optional message (Esc cancels), shows progress text,
  reports `Committet` / `Ingen endringer` / error.
- **Settings page**: per-context git status block + push button + the
  remote URL input.

## Conventions

- Don't `git push` automatically. Pushes are explicit user actions.
- Commit operations use `git add -A` then `git commit -m ...` — they
  capture all changes regardless of which feature touched them.
- Errors (e.g. authentication for SSH push) are surfaced in the JSON
  response and shown in the UI; don't swallow them.

## Gotchas

- The first commit is made by `gitInitIfNeeded`. If the user
  configures a remote later, the initial commit's tree is already in
  place — `push` should work but may fail on protected branches.
- Some environments lack a global git identity. The init helper sets
  one (`Week Notes <noreply@local>`) if needed; this is per-repo and
  doesn't pollute global config.
- `LANG=C` is important — git's porcelain output is stable across
  locales only when forced.

## Related

- `contexts.md` — settings shape and the master/detail UI.
- The **project repo itself** (this directory) is unrelated and uses
  its own git lifecycle. See `AGENTS.md` for project-level git rules
  (never push without user instruction, required co-author trailer).
