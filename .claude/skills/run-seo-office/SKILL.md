---
name: run-seo-office
description: Use when asked to run, boot, start, dev-serve, smoke-test, or drive the SEO Office app, or to confirm a change works end-to-end in the real running app (UI → orchestrator → brain → specialist). Covers launching the Next.js dev server and exercising the client/job/SSE API.
---

# Run SEO Office

Boot the local Next.js 16 app and drive a real client → specialist → artifact flow.
This recipe was verified live; follow it verbatim before improvising.

## Launch

`pnpm` is **not on the non-interactive PATH** — `pnpm`/`next`/`tsc` resolve only
through `corepack`, which ships next to the nvm-managed node. Prefix every command:

```bash
export PATH="$(ls -d ~/.nvm/versions/node/*/bin | tail -1):$PATH"
cd "/home/agricidaniel/Desktop/SEO Office"
corepack pnpm exec next dev --turbopack -p 3100   # 3000 is often a stale instance
```

Server reports `✓ Ready` in ~160ms, but the **first request to any route compiles
it** (use a generous curl timeout). Confirm it serves and the registry loaded:

```bash
curl -s http://localhost:3100/api/specialists | head -c 200   # → 31 specialists
```

- LLM provider is `SEO_OFFICE_LLM_PROVIDER=claude-cli` → the `claude` CLI must be on
  PATH. **No `ANTHROPIC_API_KEY` is needed.**
- gcloud application-default creds expire → `google-analytics`/`google-search-console`
  specialists fail with `invalid_grant`. Fix: `gcloud auth application-default login`.

## The same-origin write rule

`POST`/`DELETE` routes call `sameOriginWriteAllowed`. If the `Origin` header is
**absent** the request passes (server-to-server) — so plain `curl` works. A browser
passes when same-origin. A forged cross-origin `Origin` gets `403`. Don't send an
`Origin` header from curl.

## End-to-end smoke flow (verified)

Specialists take an **empty payload** and read the target from the client manifest.
Use a clearly-named throwaway slug — `.seo-office/vaults/` holds REAL user vaults.

```bash
SLUG=e2e-smoke-example
# 1. scaffold (~97 files written)
curl -s -X POST localhost:3100/api/clients -H 'Content-Type: application/json' \
  -d '{"siteUrl":"https://example.com","clientName":"E2E Smoke Example","owner":"e2e-smoke"}'

# 2. enqueue — vault-linter is deterministic (~67ms, no network/LLM/cost)
JOB=$(curl -s -X POST localhost:3100/api/clients/$SLUG/jobs \
  -H 'Content-Type: application/json' -d '{"specialist":"vault-linter"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["job"]["id"])')

# 3. stream SSE — the ?slug= param is REQUIRED (else "slug query param is required")
curl -sN "localhost:3100/api/jobs/$JOB/events?slug=$SLUG"   # log → progress → done

# 4. read the artifact off disk
cat ".seo-office/vaults/$SLUG/wiki/deliverables/"*vault-lint.md

# 5. delete — ?confirm=1 REQUIRED; backs up to .seo-office/backups/ then cascades
curl -s -X DELETE "localhost:3100/api/clients/$SLUG?confirm=1"
rm -rf ".seo-office/backups/clients/$SLUG-"*   # throwaway backup, optional
```

For a **real deliverable** (fetch + LLM), use `technical-auditor` instead of
`vault-linter` at step 2. Expect ~130s and real cost (~$0.61 on Opus 4.7 via the
claude CLI). It writes `wiki/audits/<date>-technical.md` + `.data.json` + an HTML
report under `reports/`, and the orchestrator review layer writes `wiki/reviews/`.

## Verify the UI layer

```bash
# headless Chromium usually can't init WebGL, so the 3D canvas stays "Loading the
# 3D workspace" — that's an environment limit, not a bug. The shell, nav, vault
# panel, task feed, and status bar still render against live brain/orchestrator
# state. Capture the accessibility snapshot (browser_snapshot) over a screenshot.
```

## Common mistakes

| Mistake | Fix |
|---|---|
| `pnpm: command not found` (exit 127) | Prefix with `corepack` after adding nvm bin to PATH. |
| Wrapping `pnpm x; echo EXIT=$?` and trusting the harness exit code | The wrapper exits with the `echo`'s code, masking failure. Read the `EXIT=` line **inside** the log. |
| SSE returns `{"ok":false,"error":"slug query param is required"}` | Add `?slug=<slug>` to `/api/jobs/<id>/events`. |
| `DELETE` returns 400 "destructive" | Add `?confirm=1`. |
| Deleting a vault directly off disk | Use `DELETE /api/clients/<slug>?confirm=1` so the SQLite index cascades and a backup is made. Never touch real vaults. |
| Port 3000 hangs (HTTP 000) | A stale `next-server` is squatting it. Launch on a different port. |
