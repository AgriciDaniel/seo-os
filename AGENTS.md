<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# SEO Office — Agent Context

You are working on **SEO Office**: a local-first SEO agency operating system, open source under AGPL-3.0. Every user clones the repo, sets API keys in `.env.local`, and runs `pnpm dev` on their own machine.

**Read the design doc first:** [`docs/design/2026-05-11-seo-office-design.md`](docs/design/2026-05-11-seo-office-design.md). It is the source of truth for architecture decisions.

## The metamorphosis

Three source repos fuse into one codebase. None are consumed as plugins — their logic is vendored and ported:

- **[claw3d](https://github.com/iamlukethedev/claw3d)** → UI shell (3D office, R3F)
- **[claude-seo](https://github.com/AgriciDaniel/claude-seo)** → specialist execution backbone (Python scripts + skill prompts)
- **[marketing-brain](https://github.com/AgriciDaniel/marketing-brain)** → brain schema + orchestrator state machine
- **[codex-seo](https://github.com/AgriciDaniel/codex-seo)** → prompt portability reference (not bundled)

The four-layer model: **UI → Orchestrator → Brain → Specialists**. See the design doc for layer responsibilities.

## Repo layout (target)

```
/                              project root
├── src/
│   ├── app/                   Next.js App Router routes
│   │   ├── (office)/          3D office views (claw3d-adapted)
│   │   ├── (dashboard)/       list-style "what's due" views
│   │   ├── (vault)/           markdown browser
│   │   └── api/               route handlers (SSE, brain CRUD, specialist exec)
│   ├── components/            React components (shared UI)
│   └── lib/
│       ├── brain/             vault + SQLite index (marketing-brain pattern)
│       ├── orchestrator/      specialist registry, job queue, next-action SM
│       ├── specialists/       TS-implemented specialists (claude-seo skill ports)
│       └── integrations/      Anthropic, DataForSEO, Google, Bing, etc. clients
├── vendored/
│   ├── claude-seo/scripts/    vendored Python scripts (invoked via child_process)
│   └── marketing-brain/       reference templates (template-brain/, references/)
├── scripts/
│   └── install.sh             bash installer for community distribution
├── docs/
│   └── design/                living architecture docs
└── .seo-office/               USER DATA (gitignored) — vaults + index.db + cache
```

## Hard rules

1. **`.seo-office/` is sacred user data.** Never check it in. Never delete user vaults without explicit confirmation. The `.gitignore` already excludes it.
2. **API keys live ONLY in `.env.local`.** Never log them, never echo them, never write them to any other file.
3. **The brain schema is `marketing-brain.v1`.** Every vault note's frontmatter must include `brain_schema: marketing-brain.v1` and the standard fields (`owner`, `confidence`, `approval_status`, `rollback_note`, `risk_level`). The shared TypeScript types will live in `src/lib/brain/types.ts` once that module is built in v0.1.
4. **`hot.md` is overwritten in place every session.** `log.md` is append-only — corrections are new entries, never edits.
5. **Long jobs stream progress via SSE.** Do not block the UI thread on Python child processes. Pipe stdout into SSE events.
6. **Prompt caching is mandatory on the system prompt + tool definitions** for every Anthropic SDK call. See the `claude-api` skill if available.
7. **No build-time secrets, no telemetry, no analytics.** This app runs on the user's machine. We see nothing.
8. **Multi-tenant data model from day one.** Every brain entity has a `(client_slug)` scope. Even though phase 1 is single-user, the schema must already accommodate "one user, many clients."

## When in doubt

- Architecture question → [`docs/design/2026-05-11-seo-office-design.md`](docs/design/2026-05-11-seo-office-design.md)
- Brain schema → marketing-brain's `assets/template-brain/wiki/*.md` frontmatter (vendored under `vendored/marketing-brain/`)
- A specific SEO concern (audit, schema, backlinks, etc.) → the corresponding `claude-seo` skill in `vendored/claude-seo/`
- "How does Next.js 16 do X?" → `node_modules/next/dist/docs/` (per the warning at top of this file)
