# 📅 Ukenotater (Week Notes)

Self-hosted weekly notes, tasks, meetings, people and results. Plain files,
with a separate git repository for each context. Totally vibe-coded.

## 🚀 Quick start

Requires **Node.js** (24 recommended) and **git**. [Ollama](https://ollama.com/)
is optional for local weekly summaries.

```bash
git clone git@github.com:petterek/week-notes.git
cd week-notes
npm install
./run.sh
```

Open <http://localhost:3001/> and create a context.
`./run.sh -p 8080` selects another port; later starts reuse the saved port.
Stop with `./stop.sh`. Running `run.sh` twice does not start a second server.

## ✨ Features

| Area | Highlights |
|------|------------|
| Notes | Markdown, autosave, mentions, tags, pinned notes and slide presentations |
| Tasks | Due dates, participants, notes, timestamped comments, completion and merging |
| Calendar | Week view, working hours, meeting types and `.ics`/`.vcs` import with Teams links |
| Meeting series | Persistent agenda, decisions, follow-up tasks, meeting windows and PDF minutes |
| People | People, companies, places and teams; person details open without leaving the page |
| Goals & results | Weekly outcomes and long-term goals linked to tasks and results |
| Search | `Ctrl+K` keyword search with phrase/boolean operators; optional Ollama summaries |
| Contexts | Isolated workspaces with their own data, settings and git remotes |

Help and keyboard shortcuts are available in the app and in [help.md](help.md).
For summaries, install a model with `ollama pull qwen3.5:9b`, then enable it
in Settings → Oppsummer. The app does not download AI models.

## 📁 Data & git

Notes live in `data/<context>/YYYY-WNN/*.md`; tasks, people and meetings
use per-record JSON files. Set `DATA_DIR` to use another data root.
Context data is excluded from the application repository.

Switching contexts commits pending changes and pulls the destination
remote with `--ff-only`. **Push is manual**, using the host's git credentials.
Contexts can be switched without restarting the server.

## 🔌 API

See [openapi.json](openapi.json) for the complete OpenAPI 3.1 contract.
The running app serves it at `/openapi.json` and provides a local Swagger UI
at `/api-explorer`.

**The explorer operates on real data.** It confirms mutations before execution;
use a disposable context for experiments. The `wn_ctx` cookie selects a context,
not an identity. There is no built-in authentication: run on a trusted host/network.

## 🛠️ Development

Vanilla Node.js HTTP handlers, browser ES modules and Web Components;
Markdown via [marked](https://marked.js.org/) and slides via
[reveal.js](https://revealjs.com/). No framework, bundler or build step.

```bash
npm test
```

Playwright uses a separate server and disposable data, never the normal server
on port 3001. See [test guidance](agents/tests.md), [API documentation](agents/api-docs.md)
and [AGENTS.md](AGENTS.md) for the code map and contributor conventions.

## 📜 Changelog

**v5.13 · 2026-11-19:** Tasks grouped by source type and source, with
derived origins, automatic backlinks, and separate note preview/edit links.
189 Playwright tests passing.

[Complete release history](CHANGELOG.md).

## 📜 License

MIT — see [LICENSE](LICENSE).
