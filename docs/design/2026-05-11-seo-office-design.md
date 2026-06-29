---
title: SEO Office — Architecture Design
version: v0.1 (foundation)
date: 2026-05-11
status: living document
owners: [agricidaniel]
brain_schema: marketing-brain.v1
---

# SEO Office — Architecture Design

## Context

SEO Office is a **local-first SEO agency operating system**, open source under AGPL-3.0 and aimed at a non-technical community. Each user clones the repo, runs `pnpm dev`, and gets a 3D virtual office where AI specialists run audits, research keywords, write briefs, and surface "what to do next" — all on their own machine with their own API keys.

The project fuses three open repositories into one product through a deliberate **metamorphosis**:

- **[claw3d](https://github.com/iamlukethedev/claw3d)** — Next.js + React Three Fiber 3D virtual office. UI shell.
- **[claude-seo](https://github.com/AgriciDaniel/claude-seo)** — 25-skill / 18-subagent technical SEO toolkit. Execution layer.
- **[marketing-brain](https://github.com/AgriciDaniel/marketing-brain)** — Strategy + state brain. Obsidian-vault working-memory pattern (`hot.md` + `log.md` + frontmatter state machine). Orchestrator + brain pattern.
- **[codex-seo](https://github.com/AgriciDaniel/codex-seo)** — Prompt portability reference. Not a runtime dependency; consulted when porting prompts between providers.

"One brain. One orchestrator. One UI." None of the three source repos are consumed as plugins — their logic is **vendored and ported** into a unified codebase.

## Why local-first

The audience is a **community of non-technical SEO operators**. They will not stand up a SaaS account. They will not configure a Vercel project. They will run a thing on their machine that "just works."

- **No gatekeeping.** The code is public (AGPL-3.0); the [AI Marketing Hub Pro](https://www.skool.com/ai-marketing-hub-pro) community adds guided setup and support on top.
- **Data sovereignty.** Each user's brain lives on their disk. Nothing is uploaded.
- **API costs = user's bill.** Each member sets their own `ANTHROPIC_API_KEY`, `DATAFORSEO_LOGIN`, etc. We never see those keys.
- **No auth, no billing, no queues, no cloud.** The simplest possible deployment.

## The four layers

```
┌──────────────────────────────────────────────────────────────┐
│ UI    Next.js 16 App Router + React Three Fiber 3D office +  │  ← claw3d (adapted)
│       dashboard + chat panels + Tailwind v4                  │
├──────────────────────────────────────────────────────────────┤
│ ORCH  Specialist registry + in-process job queue + state     │  ← marketing-brain
│       machine (next-action.ts) + SSE event bus               │     (ported to TS)
├──────────────────────────────────────────────────────────────┤
│ BRAIN Obsidian-style vault on disk (`./.seo-office/vaults/`) │  ← marketing-brain
│       + SQLite index (`./.seo-office/index.db`) — single     │     schema (extended)
│       source of truth                                        │
├──────────────────────────────────────────────────────────────┤
│ SPEC  Anthropic SDK (TS) + vendored claude-seo Python        │  ← claude-seo +
│       scripts (child_process) + DataForSEO/Bing/Google clients│    codex-seo refs
└──────────────────────────────────────────────────────────────┘
```

## Repository → layer mapping

| Source repo       | Becomes                          | Strategy                                                                                          |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `claw3d`          | UI shell                         | Vendor the 3D scene into `src/app/(office)/`. Replace gateway adapter with our orchestrator's SSE event stream. Adapt camera + lighting for SEO-office aesthetic. |
| `claude-seo`      | Specialist execution backbone    | Vendor `scripts/*.py` into `vendored/claude-seo/scripts/`. Invoke via `child_process.spawn`. Port `skills/*/SKILL.md` prompt logic into TS specialist modules under `src/lib/specialists/`. Vendor `agents/*.md` as subagent prompt templates. |
| `marketing-brain` | Brain schema + state machine     | Port `assets/template-brain/wiki/` to a TS factory in `src/lib/brain/scaffold.ts`. Port `guide_next_action.py` to `src/lib/orchestrator/next-action.ts`. Re-implement vault-synthesizer / beast-planner / keyword-curator subagents in `src/lib/specialists/`. |
| `codex-seo`       | Prompt portability reference     | When porting a claude-seo skill prompt into a TS specialist, cross-reference codex-seo's version for cleaner wording. Not bundled at runtime. |

## Data model: the brain

Lives at **`./.seo-office/`** (gitignored — user data, never committed). Per-client layout:

```
.seo-office/
├── index.db                           SQLite — fast queries over the vault
├── vaults/
│   ├── <client-slug>/
│   │   ├── .manifest.json             canonical client metadata (site, owner, business type)
│   │   ├── hot.md                     working memory (~500 words, overwritten each session)
│   │   ├── log.md                     append-only audit trail (every decision + rationale)
│   │   ├── index.md                   navigation hub
│   │   ├── overview.md                strategic stance
│   │   ├── audits/<date>-<slug>.md    claude-seo report outputs
│   │   ├── keywords/<date>.xlsx       marketing-brain keyword workbook (4 sheets)
│   │   ├── sources/dataforseo/*.json  raw API responses (cached)
│   │   ├── entities/*.md              competitors, PAA topics
│   │   ├── decisions/*.md             frontmatter: confidence, owner, risk, rollback
│   │   └── deliverables/*.md          BEAST plans, briefs, client reports
│   └── _office/                       cross-client global brain (calendar, tasks)
└── cache/                             API response cache (SQLite + JSON blobs)
```

**Every note's frontmatter follows `brain_schema: marketing-brain.v1`** — fields: `owner`, `confidence` (0-1), `approval_status`, `rollback_note`, `risk_level`, `created`, `updated`. The SQLite index mirrors this schema for query speed.

`hot.md` is the working-memory cache, overwritten in place each session. `log.md` is append-only. This is the marketing-brain invariant, preserved verbatim.

## Orchestrator

Three responsibilities:

### 1. Specialist registry

A table of specialists. Each entry:

```ts
{
  id: 'technical-audit',
  desk: 'desk.technical-auditor',   // 3D office location
  inputSchema: ZodSchema,
  execute: (input, ctx) => AsyncIterable<ProgressEvent>,
}
```

A specialist is the unified abstraction over a claude-seo skill, a marketing-brain agent, or a custom hybrid. The UI calls specialists; it never knows whether the work happens in TypeScript, in a Python child process, or via a remote API.

### 2. In-process job queue

When a user clicks "Run technical audit," we enqueue a job. The specialist's `execute()` runs in-process, yielding `ProgressEvent`s that stream to the UI via Server-Sent Events. No Redis, no BullMQ — Node's event loop is sufficient for a single-user desktop app.

Long Python jobs (a 500-page crawl can take 10–30 min) spawn detached `child_process` calls. Output streams back through Node and into the SSE channel as progress events.

### 3. State machine: `next-action.ts`

Port of `guide_next_action.py`. Given a client vault's state (`.manifest.json` + presence of files + `log.md` entries), returns the next recommended action. Powers the dashboard's "what to do next" card.

### 4. Assignment envelope (v0.1.8+)

An **Assignment** is the v2 wire-protocol contract between the conversational orchestrator (`src/lib/agents/`) and the specialist execution layer (`src/lib/specialists/`). It exists for one reason: the LLM-driven orchestrator emits structured tool calls (`assign_task`, `plan_tree`) that must be durably serialized somewhere before a specialist actually runs, so the user can see what was proposed, approve/reject it in the Specialist Inbox, and audit the trail later.

Lifecycle:

```
proposed  →  queued  →  running  →  succeeded | failed
   │           │           │              │
   │           │           │              └── final state; result mirrored to vault
   │           │           └── job-queue has picked it up, SSE channel open
   │           └── user (or auto-approve policy) accepted the proposal
   └── orchestrator LLM emitted assign_task; not yet running
```

Schema (`src/lib/orchestrator/assignment.ts`):

```ts
{
  id: string,                       // ULID
  client_slug: string,              // multi-tenant scope
  specialist_id: string,            // matches registry entry
  status: 'proposed' | 'queued' | 'running' | 'succeeded' | 'failed',
  request_id: string,               // job correlation
  input: unknown,                   // Zod-validated against specialist.inputSchema
  result_artifact_path?: string,    // vault-relative; populated on success
  proposed_at, started_at, finished_at, error_message?: string,
}
```

An Assignment is mirrored to the vault as a markdown note under `vaults/<client>/assignments/<id>.md` with marketing-brain.v1 frontmatter, so the brain stays self-describing on disk even if `index.db` is rebuilt from scratch.

A **Task** (`src/lib/orchestrator/task.ts`) is a higher-level node in a planning tree — it may have child tasks and may or may not be linked to an Assignment (group tasks have none). When a leaf Task is dispatched, it produces an Assignment; the Task's `assignment_id` field captures the link. The `plan_tree` tool emits Task trees; `assign_task` emits a single Assignment directly.

Why both: the LLM thinks in plans (Tasks), the worker pool thinks in atomic units (Assignments). Keeping them as distinct types lets the planner re-arrange the tree without touching the wire-protocol contract, and lets the worker pool stay ignorant of planning concerns.

## UI: three panes

A top bar switches between three views; the user can also keep them as resizable tabs.

- **Office (3D, default).** R3F scene rendering the office floor with specialist desks. Each desk = a specialist character. Clicking a character opens a chat panel docked to the side. Visual presence indicators show when a specialist is currently running a job (subtle particle effect / desk glow).
- **Dashboard.** List-style "what's due today." Pulls from `index.db`: overdue audits, pending decisions, stale `hot.md` entries, low-confidence claims to review. Each row opens the relevant specialist chat.
- **Vault.** Obsidian-like markdown browser. Power users (you) can read/edit notes directly. Non-tech users mostly stay in Office and Dashboard.

**First-run wizard.** The 3D office on first boot has empty desks with glowing "+" icons. User clicks → form to paste an API key → live validation (`POST /api/setup/validate-key`) → key written to `.env.local` → desk lights up. The user never sees the dotfile.

## Open Design workflow layer

SEO Office uses the `nexu-io/open-design` pattern as a workflow reference, not
as a runtime dependency. The relevant local skills are `design-md`,
`platform-design`, and `frontend-skill`. They inform every user-facing agent
surface:

- progress is visible while specialists spawn, work, review, and finish
- chat summaries use plain operator language first, with paths as supporting
  evidence
- next actions are rendered as compact cards with confidence, impact, effort,
  and a direct CTA
- clickable vault/report/specialist references stay inside the app
- UI changes must preserve keyboard/focus behavior and avoid overlapping panels

## Inference

Default provider: **Anthropic SDK** (`@anthropic-ai/sdk`) with **prompt caching** enabled on the system prompt + tool definitions, per the claude-api skill standard. Model selection:

- `claude-opus-4-7` — complex synthesis (BEAST plan composition, audit synthesis)
- `claude-haiku-4-5-20251001` — routing, classification, simple summarization

Optional v2 swap: **Vercel AI Gateway** as a swap-in provider, fronted by the same client interface so users can fall back to other providers (OpenAI, Gemini) without code changes. Not in v0.1.

## Distribution

- **v0.1–v0.5 — git clone + bash installer.** Community member receives repo access. Runs `curl -fsSL <repo-raw>/install.sh | bash` which: detects OS, installs Node 24 via nvm if missing, clones the repo, runs `pnpm install`, scaffolds `.env.local` from `.env.example`, opens `localhost:3000` in their default browser, and triggers the first-run wizard.
- **v1.0+ — Tauri desktop installer.** Native `.dmg` / `.exe` / `.AppImage`. Same Next.js codebase inside a Tauri webview. Signed binaries distributed through the community gate.

## Roadmap

| Milestone | Scope                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------- |
| **v0.0.1**| Foundation: scaffolding, design doc, this file, AGENTS.md, README, install.sh, .env.example.       |
| **v0.1**  | Brain skeleton: TS types, scaffold factory (port of marketing-brain template), SQLite index.       |
| **v0.2**  | First specialist: technical SEO audit. Anthropic SDK client with prompt caching. SSE plumbing.     |
| **v0.3**  | Vendored claude-seo Python scripts + Node `child_process` bridge + cache layer.                    |
| **v0.4**  | Three more specialists: keyword research, content strategist, schema generator. Dashboard view.    |
| **v0.5**  | 3D office shell (claw3d adaptation) + chat panels + first-run wizard.                              |
| **v0.6**  | Bash installer hardened + onboarding tested with a non-tech community member end-to-end.           |
| **v1.0**  | Tauri packaging, signed releases, distribution playbook for the community.                         |

## What we are explicitly NOT building

- A SaaS product, multi-tenant or otherwise.
- Authentication, billing, payment integration, or subscription tiers.
- Cloud hosting (no Vercel deploy, no AWS, no Fly).
- Real-time multi-user collaboration on a shared brain.
- A Claude Code plugin. (Those already exist as `claude-seo` and `marketing-brain` — SEO Office is a separate, complementary product.)

## Open decisions (revisit before v0.2)

- **Bundling the Python runtime.** Do we require users to have Python installed (with a friendly check + install hint), or bundle a portable Python via `pyenv` in the installer? Leaning toward: require Python 3.11+, install script verifies and prompts.
- **Anthropic API key validation UX.** Live-validate against a cheap haiku call on key save? Or just regex + first-job failure? Leaning toward: live validation with a 1-token classify call (~$0.0001 per check).
- **Vault sync between machines.** Out of scope for v1, but the schema must not preclude future sync (e.g., via the user's own Dropbox/iCloud folder, or git). The brain folder is portable — that's enough for now.
