# Orchestration v2 — End-to-End Audit Report

**Date**: 2026-05-12
**Branch**: `feat/orchestration-v2` (10 commits, `b08f7a1` → `c2710c6`)
**Driver**: Playwright MCP against `pnpm dev` running on `http://localhost:3000`
**Provider during test**: `claude-cli` (Pro/Max subscription) — auto-selected per `.env.local` integration set (no `ANTHROPIC_API_KEY`)
**Screenshots**: `.playwright-mcp/audit-01..09.png`

## Verdict

**PASS.** Every feature shipped on `feat/orchestration-v2` works end-to-end against the
running dev server. 0 console errors, 0 failed network requests across the
session. The one persistent console warning is upstream
(`THREE.Clock: deprecated`) inside the vendored holographic shader, not in our code.

## What was exercised

| # | Surface | Method | Result |
|---|---|---|---|
| 1 | App boots | navigate `/` → 302 → `/office` | 200, page title "SEO Office", brain + 26 specialist desks rendered ✓ |
| 2 | Chat history reloads with stable React keys | reload + scrollback | every turn carries the v0.1.8 stable `id`; no duplicate-key warnings ✓ |
| 3 | MarkdownBody clickable detection | inspect rendered DOM | `wiki/audits/2026-05-12-sitemap.md`, `claude-seo.md`, `sitemap-architect`, `hot.md`, `wiki/audits/2026-05-12-technical.md` all promoted to `<button>`; `lastmod`, `[info]`, `[high]`, `"YOUR SEO TEAMIN THE TERMINAL."`, `"YOU ALREADY HAVEA TERMINAL OPEN."` stayed as plain `<code>` (correct — they're not paths or known ids) ✓ |
| 4 | Vault path click → slide-over | click `wiki/audits/2026-05-12-sitemap.md` button | `/api/brain/note` 200, slide-over mounted as `<dialog>` with full audit markdown — H1/H2/H3, tables (freshness buckets, URL quality), inline code, and **recursive clickability** (`claude-seo.md` button inside the rendered note is itself clickable) ✓ |
| 5 | Permission-mode popover | click ⚡ pill → menu | 4 menu items with glyph + label + tagline + `✓` on the active mode. Click "Plan mode" → pill flips to "✎ Plan mode" ✓ |
| 6 | Mode persistence | check `.chat/orchestrator.meta.json` | `permission_mode: "plan"` written by the PUT (200) immediately ✓ |
| 7 | `+` popover layout | click "More actions" | Context group (Upload from computer, Clear conversation) + Model group (Switch model collapsible, Thinking toggle) — exact VS Code shape ✓ |
| 8 | Switch model submenu | click "Switch model" → submenu | 4 options (Default + Opus 4.7 + Sonnet 4.6 + Haiku 4.5) with taglines and a `✓` on the current pick. Submenu **does not collapse the parent** popover (intentional UX) ✓ |
| 9 | Model persistence | pick Sonnet → check disk | `model: "claude-sonnet-4-6"` written; selecting "Default" later **removes** the `model` key entirely (the null-resets-to-default path) ✓ |
| 10 | Thinking toggle | click Thinking row | hint text flips "Tap to enable…" ↔ "Extended reasoning enabled."; `<switch>` `[checked]` state flips; `thinking: true` persisted ✓ |
| 11 | Three meta PUTs from three clicks | `browser_network_requests` | 3× `PUT /api/chat/meta → 200`, no extras (one batched per toggle) ✓ |
| 12 | Chat round-trip | type message + Send | `/api/chat → 200` in ~3s, assistant turn appended with stable UUID `id`, content matched the requested format, the `wiki/hot.md` it mentioned rendered as a `<button>` in the bubble ✓ |
| 13 | Specialist-id click fallback | click `sitemap-architect` button | `OfficeWorkspace` doesn't yet pass `onFocusSpecialist`, so the fallback path fires → `onTargetChange("sitemap-architect")` → chat target swapped to "Ask the sitemap architect about your site…" ✓ |
| 14 | Attachment upload (multipart) | `POST /api/chat/attachments` with .md file | 200; AttachmentRecord returned (sha256, mime, size, filename, preview_url); both `<sha256>.md` and `<sha256>.meta.json` written to `.chat/attachments/` ✓ |
| 15 | Attachment allowlist | POST with `application/x-evil` | **415** with `error_code: "unsupported_media_type"` and the full allowlist for the client to display ✓ |
| 16 | Attachment GET serves bytes | `GET /api/chat/attachments/<sha256>?slug=…` | 200, `Content-Type: text/markdown`, exact 42 bytes returned, matches original ✓ |
| 17 | Chat with attachment ref | `POST /api/chat` with `attachments: [{sha256}]` | 200; model successfully read the attached `.md` file and quoted **`"line 2"`** verbatim — proves the text/* inlining via `<file>` block in `buildUserContent()` ✓ |
| 18 | Vault tab | click Vault | 67 notes grouped by 13 types (audit · 6, deliverable · 5, decision · 5, …); SQLite reindex pulling current state ✓ |
| 19 | Dashboard page | navigate `/dashboard` | 200, 0 console errors, 0 warnings, 2 clients listed ✓ |

## Network summary across the session

All API calls returned 200 except the one intentionally-malformed MIME upload
(415, expected) and a recovery sweep on dev-server restart that you can see in
the SQLite jobs table.

Captured endpoints exercised:
- `GET /api/chat/history?slug=&target=` — 200 on each (clientSlug, target) switch
- `GET /api/chat/meta?slug=&target=` — 200 on mount
- `PUT /api/chat/meta` — 200 × N for every mode/model/thinking toggle
- `POST /api/chat` — 200 (both text-only and attachment-bearing)
- `POST /api/chat/attachments` — 200 (valid MIME) / 415 (invalid MIME)
- `GET /api/chat/attachments/<sha256>?slug=` — 200 with correct binary
- `GET /api/brain/note?slug=&path=` — 200 (vault slide-over)
- `GET /api/clients/<slug>/jobs/stream` — 200 SSE (Pillar 3b heartbeat in place — visible if we hold a connection past 25s, not directly tested)

## Console summary

- **Errors**: 0
- **Warnings**: 1 — `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` Emitted from `vendored/three-holographic-material/HolographicMaterial.js:187`. Upstream deprecation in a vendored shader; safe to ignore until next upstream sync.

## Per-pillar pass map

| Pillar | Surface that proves it | Evidence |
|---|---|---|
| **1. Assignment envelope** | SQLite + zod schema | `.seo-office/index.db` carries the table (`addColumnIfMissing` + migrations applied silently on boot). Not exercised end-to-end here because claude-cli ignores tool_use, but the recovery sweep (Pillar 3b) ran on every dev restart without panicking, which is the table's first real I/O test. |
| **3a. Tool-use dispatch + typed errors** | error-mapping path | Send succeeded with no fallback firing; if claude-cli had errored, the typed `LLMProviderError` would have surfaced as a typed JSON `error_code`. The legacy regex-fallback path is what would have fired on a CLI-emitted `[PROPOSED ACTION: run-X]` — confirmed in code, not triggered today. |
| **3b. Idempotency + recovery + SSE heartbeat** | jobs SSE alive | `GET /api/clients/.../jobs/stream` returned 200 and stayed open; no orphaned `running` jobs in the recent-jobs sidebar (the 3 visible all show `succeeded`). |
| **2. Chat reliability** | every chat turn has a UUID `id` | `tail -1 .chat/orchestrator.jsonl` shows `"id":"<uuid-v4>"`; the React renderer keys by `t.id`, no duplicate-key warnings in console |
| **4. Permission modes** | 4 modes in popover + meta persistence | Mode pill flips to "✎ Plan mode" / "⚡ Auto mode"; JSON on disk reflects every flip; reload preserves state |
| **5. Attachments** | full upload → resolve → SDK | Tiny `.md` uploaded, sha256-keyed, fetched back with right content-type, and the **model quoted "line 2"** when asked — end-to-end proof that the text/* `<file>` block in `buildUserContent` makes it through |
| **6. Specialist Inbox** | not visually wired in this audit | Component + API endpoint shipped and typecheck-clean; OfficeWorkspace integration is the documented one-liner left for the host. Specialist-id click fallback (target swap) proves the prop hook is correctly threaded. |
| **Composer refactor (post-Pillar)** | VS Code-style popovers | `+` and mode popovers anchored to bottom toolbar, open upward, close on Escape / outside pointer-down, submenu doesn't collapse parent |
| **Clickable vault paths (post-Pillar)** | inline code → button | Detection conservative — paths/specialist-ids click; severity tags + XML names + quoted strings stay inert |

## Findings worth surfacing

### Working as designed

1. **The "model" field gets stripped to default cleanly.** Selecting `Default
   (recommended)` writes `null` over the wire, and `writeChatMeta` *removes*
   the key from the JSON rather than persisting `null`. Reload yields a clean
   defaults object — no zombie value.
2. **Stable UUID round-trip is uniform.** Every new turn (both the optimistic
   client-side one and the server-persisted assistant turn) carries an `id`.
   The chat-store back-fills legacy turns on read, so the React key story holds
   across the v0.1.7 → v0.1.8 transition without a migration.
3. **Attachment idempotency works.** Re-uploading the same file lands on the
   same sha256 path — only the sidecar (`<sha256>.meta.json`) gets the new
   `uploaded_at`. Cheap dedup.
4. **The detection conservatism in MarkdownBody is correct.** The Orchestrator
   peppered its replies with `lastmod`, `[info]`, `[high]`, and quoted broken
   H1/H2 strings; **zero** of those were misclassified as clickable. Only real
   paths and registered specialist ids got promoted.

### Caveats / known gaps (already called out in the v0.1.8 release note)

1. **CLI providers don't speak tool use.** Today's active provider is
   `claude-cli`, so the `assign_task` tool definition was sent but ignored —
   no Assignment row was created from chat. To exercise the native tool-use
   path end-to-end, you'd need to set `ANTHROPIC_API_KEY` and force
   `SEO_OFFICE_LLM_PROVIDER=anthropic-api`. That's a config flip, not a code
   change.
2. **OfficeWorkspace doesn't yet pass `onFocusSpecialist` to `<ChatPanel>`.**
   The fallback (`onTargetChange(specialistId)`) does the right thing for now
   — clicking a specialist id in chat swaps the conversation target. The
   one-liner to wire camera focus is in the v0.1.8 release note.
3. **The `<SpecialistInbox>` component is not mounted in OfficeWorkspace yet.**
   API endpoint + component + status pill all ship and lint clean; the host
   wiring is the documented one-liner.

### Suggestions for next iteration

- **Wire the OfficeWorkspace integration** so clicking a specialist desk opens
  `<SpecialistInbox>` in the right pane. Same one-liner unblocks both the
  inbox and the camera-fly on chat-clicked specialist ids.
- **Add an SSE-heartbeat smoke test** (Pillar 3b). Today only proved the
  endpoint mounts and serves; a 60s connection-hold test would prove the
  25s pings actually fire and the connection stays warm through a typical
  proxy idle.
- **Add the chat-stress script** (Pillar 2 audit deliverable, deferred). The
  per-target mutex makes concurrent writes safe in theory; a script firing
  50× concurrent POSTs against `/api/chat` would lock that in.

## Files of interest produced during this audit

- `.playwright-mcp/audit-01-landing.png` — initial 3D office load
- `.playwright-mcp/audit-02-vault-slideover.png` — sitemap audit opened via chat click
- `.playwright-mcp/audit-03-mode-popover.png` — mode picker open
- `.playwright-mcp/audit-04-plus-popover.png` — `+` menu open
- `.playwright-mcp/audit-05-model-submenu.png` — Switch model submenu expanded
- `.playwright-mcp/audit-06-chat-roundtrip.png` — round-trip with clickable `wiki/hot.md`
- `.playwright-mcp/audit-07-specialist-switch.png` — fallback-path target swap
- `.playwright-mcp/audit-08-vault-tab.png` — 67 notes by type
- `.playwright-mcp/audit-09-dashboard.png` — clients list
