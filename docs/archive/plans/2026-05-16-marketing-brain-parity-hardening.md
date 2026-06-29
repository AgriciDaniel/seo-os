# Marketing Brain Parity Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SEO Office’s first client setup and Deep Brain sweep produce a genuinely filled Marketing Brain comparable to the standalone Marketing Brain workflow, not a shallow scaffold plus dated side reports.

**Architecture:** Introduce a strict parity contract between the Marketing Brain source repo, Claude SEO/Codex SEO skill coverage, and SEO Office runtime behavior. Build a deterministic fixture harness first, then expand the sweep, canonical brain population, evidence persistence, and UI readiness reporting until a fresh client cannot be marked ready without filled source, entity, keyword, decision, deliverable, report, and review layers.

**Tech Stack:** Next.js 16 App Router, TypeScript, SQLite, local Obsidian-style vault, vendored Marketing Brain Python scripts, vendored Claude SEO prompts/scripts, Codex SEO reference wrappers, Playwright e2e, Node test runner.

---

## Skeptical Review

I am **not** 100% certain the current implementation covers the full goal.

What is now verified:

- The scaffold can produce lint-clean client vaults.
- A deterministic e2e Build Brain run passes.
- Readiness now distinguishes `deep_ready`, `needs_data`, `draft`, and `blocked`.
- Keyword, competitor-pages, and BEAST planner now write some canonical Marketing Brain notes.
- The current Rankenstein vault lints clean and has enough folder coverage to look plausible.

What is not fully covered:

- Deep Brain still runs **12 specialists**, while the catalog has about **30 ready specialists** and Claude/Codex SEO expose around two dozen SEO domains.
- Most Marketing Brain Python scripts are not wired into SEO Office execution:
  - `build_keyword_xlsx.py`
  - `capture_visual_references.py`
  - `generate_editorial_assets.py`
  - `mine_paa_serps.py`
  - `pull_competitor_kw.py`
  - `render_beast_pdf.py`
  - `synthesize_beast_plan.py`
- The current readiness evaluator checks file/category shape and some managed sections, but does not yet prove that every strategic field is deeply filled with enough real data.
- Specialist evidence exists in return objects and reviews, but is not yet persisted in a first-class evidence ledger.
- “Needs review” is still overused. Human review is useful, but the app should still know whether data is complete, incomplete, or blocked.
- Claude SEO/Codex SEO parity is incomplete: Firecrawl, visual, performance, images, maps, Google Search Console, GA4, drift, backlinks, hreflang, local, programmatic, and ecommerce are not all part of default Deep Brain.

## Acceptance Criteria

- A fresh client with no integrations can complete only as `needs_data`, never `deep_ready`.
- A fresh client with deterministic mock live data must produce:
  - filled `wiki/overview.md`
  - filled `wiki/hot.md`
  - append-only `wiki/log.md`
  - source notes for competitor landscape, competitor keywords, DataForSEO exports, PAA mining, visual references, Google/Search Console/GA4 when available
  - entity notes for the client and primary competitors
  - keyword targets, keyword-to-URL decisions, cannibalization ledger, and XLSX/CSV workbook artifact
  - synthesized deliverables: BEAST plan, implementation roadmap, dual-surface scorecard, content briefs, comparison opportunities
  - final human-readable orchestrator review
  - suggestion cards inside chat
- No unresolved template placeholders, dead wikilinks, or seed-only managed sections.
- Each specialist output must record provenance: `live_api`, `cached`, `manual`, or `model_estimate`.
- Every report and evidence path opens inside the app.
- Playwright e2e must assert the above using deterministic fixtures.

---

### Task 1: Add a Parity Matrix Test

**Files:**
- Create: `src/lib/brain/__tests__/parity-matrix.test.ts`
- Create: `src/lib/brain/parity-contract.ts`

- [x] **Step 1: Create the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKETING_BRAIN_REQUIRED_ARTIFACTS,
  SEO_DOMAIN_COVERAGE,
} from "@/lib/brain/parity-contract.ts";

test("Marketing Brain parity contract includes required generated artifacts", () => {
  assert.ok(MARKETING_BRAIN_REQUIRED_ARTIFACTS.includes("keyword_workbook"));
  assert.ok(MARKETING_BRAIN_REQUIRED_ARTIFACTS.includes("competitor_landscape"));
  assert.ok(MARKETING_BRAIN_REQUIRED_ARTIFACTS.includes("paa_digest"));
  assert.ok(MARKETING_BRAIN_REQUIRED_ARTIFACTS.includes("visual_references"));
  assert.ok(MARKETING_BRAIN_REQUIRED_ARTIFACTS.includes("beast_pdf_or_html"));
});

test("SEO domain coverage includes Claude/Codex SEO domains", () => {
  for (const domain of [
    "technical",
    "content",
    "schema",
    "sitemap",
    "performance",
    "visual",
    "google",
    "dataforseo",
    "backlinks",
    "local",
    "maps",
    "geo",
    "images",
    "hreflang",
    "programmatic",
    "ecommerce",
    "drift",
  ]) {
    assert.ok(SEO_DOMAIN_COVERAGE.some((entry) => entry.domain === domain), domain);
  }
});
```

- [x] **Step 2: Run the test**

Run:

```bash
node --conditions=react-server --import ./scripts/test-resolve-hook.mjs --test src/lib/brain/__tests__/parity-matrix.test.ts
```

Expected: fail because `parity-contract.ts` does not exist.

- [x] **Step 3: Implement the parity contract**

Create `src/lib/brain/parity-contract.ts`:

```ts
export const MARKETING_BRAIN_REQUIRED_ARTIFACTS = [
  "keyword_workbook",
  "competitor_landscape",
  "competitor_keyword_summary",
  "paa_digest",
  "visual_references",
  "primary_competitor_entities",
  "keyword_to_url_map",
  "cannibalization_ledger",
  "implementation_roadmap",
  "ultimate_beast_plan",
  "beast_pdf_or_html",
  "final_orchestrator_review",
] as const;

export const SEO_DOMAIN_COVERAGE = [
  { domain: "technical", requiredForDeepBrain: true },
  { domain: "content", requiredForDeepBrain: true },
  { domain: "schema", requiredForDeepBrain: true },
  { domain: "sitemap", requiredForDeepBrain: true },
  { domain: "performance", requiredForDeepBrain: true },
  { domain: "visual", requiredForDeepBrain: true },
  { domain: "google", requiredForDeepBrain: false },
  { domain: "dataforseo", requiredForDeepBrain: false },
  { domain: "backlinks", requiredForDeepBrain: false },
  { domain: "local", requiredForDeepBrain: false },
  { domain: "maps", requiredForDeepBrain: false },
  { domain: "geo", requiredForDeepBrain: true },
  { domain: "images", requiredForDeepBrain: true },
  { domain: "hreflang", requiredForDeepBrain: false },
  { domain: "programmatic", requiredForDeepBrain: false },
  { domain: "ecommerce", requiredForDeepBrain: false },
  { domain: "drift", requiredForDeepBrain: true },
] as const;
```

- [x] **Step 4: Run the test again**

Expected: pass.

---

### Task 2: Persist Specialist Evidence as a Ledger

**Files:**
- Modify: `src/lib/orchestrator/job-queue.ts`
- Modify: `src/lib/orchestrator/review.ts`
- Create: `src/lib/brain/evidence-ledger.ts`
- Create: `src/lib/brain/__tests__/evidence-ledger.test.ts`

- [x] **Step 1: Create the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { appendEvidence, readEvidenceLedger } from "@/lib/brain/evidence-ledger.ts";
import { createTempClient } from "./test-helpers.ts";

test("evidence ledger records specialist provenance", async () => {
  const client = await createTempClient("evidence-ledger");
  await appendEvidence(client.slug, {
    job_id: "job-1",
    specialist_id: "keyword-researcher",
    claim: "Keyword map was generated with live SERP evidence.",
    provenance: "live_api",
    source_paths: ["wiki/sources/DataForSEO Keyword Exports.md"],
    confidence: "high",
    cost_usd: 0.12,
  });

  const ledger = await readEvidenceLedger(client.slug);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].specialist_id, "keyword-researcher");
  assert.equal(ledger[0].provenance, "live_api");
});
```

- [x] **Step 2: Implement `evidence-ledger.ts`**

Write JSONL to `wiki/meta/evidence-ledger.jsonl`, one claim per line. Validate with `SpecialistEvidenceZ` before writing. Use append-only writes.

- [x] **Step 3: Wire job queue**

After a specialist returns, append each `result.evidence[]` item with `job_id` and `specialist_id`. The orchestrator review should link to `wiki/meta/evidence-ledger.jsonl`.

- [x] **Step 4: Run targeted tests**

```bash
node --conditions=react-server --import ./scripts/test-resolve-hook.mjs --test src/lib/brain/__tests__/evidence-ledger.test.ts src/lib/orchestrator/__tests__/finalize-sweep.test.ts
```

Expected: pass.

---

### Task 3: Add Marketing Brain Python Script Bridges

**Files:**
- Create: `src/lib/marketing-brain/scripts.ts`
- Create: `src/lib/marketing-brain/__tests__/scripts.test.ts`
- Modify: `src/lib/specialists/keyword-researcher.ts`
- Modify: `src/lib/specialists/competitor-pages.ts`
- Modify: `src/lib/specialists/beast-planner.ts`

- [x] **Step 1: Create a script registry test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { MARKETING_BRAIN_SCRIPTS } from "@/lib/marketing-brain/scripts.ts";

test("Marketing Brain script registry includes production brain generators", () => {
  for (const script of [
    "build_keyword_xlsx.py",
    "capture_visual_references.py",
    "find_competitors.py",
    "mine_paa_serps.py",
    "pull_competitor_kw.py",
    "render_beast_pdf.py",
    "synthesize_beast_plan.py",
  ]) {
    assert.ok(MARKETING_BRAIN_SCRIPTS.some((entry) => entry.file === script), script);
  }
});
```

- [x] **Step 2: Implement registry and runner**

Use existing `runPython()` and expose typed helpers:

```ts
export const MARKETING_BRAIN_SCRIPTS = [
  { id: "build-keyword-xlsx", file: "build_keyword_xlsx.py" },
  { id: "capture-visual-references", file: "capture_visual_references.py" },
  { id: "find-competitors", file: "find_competitors.py" },
  { id: "mine-paa-serps", file: "mine_paa_serps.py" },
  { id: "pull-competitor-kw", file: "pull_competitor_kw.py" },
  { id: "render-beast-pdf", file: "render_beast_pdf.py" },
  { id: "synthesize-beast-plan", file: "synthesize_beast_plan.py" },
] as const;
```

- [x] **Step 3: Wire scripts into specialists**

Use these rules:

- Keyword researcher writes CSV/XLSX workbook via `build_keyword_xlsx.py` when keyword data exists.
- Competitor pages uses `find_competitors.py`, `pull_competitor_kw.py`, and writes raw JSON under `.raw/sources/dataforseo/`.
- PAA/source ingestion uses `mine_paa_serps.py` and updates `wiki/sources/PAA Mining Digest.md`.
- BEAST planner uses `synthesize_beast_plan.py` where possible and `render_beast_pdf.py` for in-app report HTML/PDF.

- [x] **Step 4: Test missing credentials**

Run helper with credentials removed in a temp env. Expected: helper returns structured `needs_data` with no vault mutation except a safe gap note.

---

### Task 4: Expand Default Deep Brain Sweep

**Files:**
- Modify: `src/lib/orchestrator/task-templates.ts`
- Modify: `src/lib/orchestrator/dispatch.ts`
- Modify: `src/lib/brain/readiness.ts`
- Test: `src/lib/orchestrator/__tests__/build-brain-template.test.ts`

- [x] **Step 1: Add template coverage test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { BUILD_BRAIN_SWEEP } from "@/lib/orchestrator/task-templates.ts";

test("Deep Brain sweep includes core parity specialists", () => {
  const ids = new Set(BUILD_BRAIN_SWEEP.children.map((child) => child.specialist_id));
  for (const id of [
    "technical-auditor",
    "schema-validator",
    "page-analyzer",
    "sitemap-architect",
    "keyword-researcher",
    "content-strategist",
    "topic-clusterer",
    "content-brief-generator",
    "competitor-pages",
    "geo-specialist",
    "image-auditor",
    "backlink-analyst",
    "google-search-console",
    "google-analytics",
    "beast-planner",
    "vault-linter",
  ]) {
    assert.ok(ids.has(id), id);
  }
});
```

- [x] **Step 2: Expand phases**

Use phases:

1. Intake and source access: `vault-linter`, `google-search-console`, `google-analytics`
2. Diagnostics: `technical-auditor`, `technical-deep-auditor`, `schema-validator`, `page-analyzer`, `sitemap-architect`, `google-suite`
3. Discovery: `keyword-researcher`, `competitor-pages`, `backlink-analyst`, `geo-specialist`, `image-auditor`, `local-seo` when business type/local fields warrant it
4. Synthesis: `topic-clusterer`, `content-brief-generator`, `content-strategist`, `brand-strategist`, `beast-planner`
5. Final gate: `vault-linter`, orchestrator final review

- [x] **Step 3: Gate optional specialists by context**

Local/maps/ecommerce/hreflang/programmatic should be context-triggered, not always default. Missing required integrations should create `needs_data` gaps, not failed sweeps.

- [x] **Step 4: Run template tests**

Expected: pass and no dependency deadlocks.

---

### Task 5: Make Readiness Semantic, Not Just Structural

**Files:**
- Modify: `src/lib/brain/readiness.ts`
- Modify: `src/lib/brain/readiness-types.ts`
- Test: `src/lib/brain/__tests__/readiness.test.ts`

- [x] **Step 1: Add failing tests**

Add tests for:

- canonical note exists but has fewer than 150 client-specific words -> `draft`
- missing evidence ledger -> `draft`
- no live data -> `needs_data`
- only dated reports, no canonical note updates -> `draft`
- all required categories plus evidence ledger plus final review -> `deep_ready`

- [x] **Step 2: Add semantic scoring dimensions**

Add:

- `evidence_quality`
- `canonical_note_depth`
- `source_specificity`
- `actionability`
- `integration_completeness`

- [x] **Step 3: Enforce deep-ready minimums**

`deep_ready` requires:

- no blockers
- no unresolved seed debt
- evidence ledger >= 10 entries
- at least 4 live or cached source families when integrations exist
- canonical target notes above minimum useful length
- final review has top opportunities, blockers, first action, acceptance criteria, rollback notes

- [x] **Step 4: Run tests**

Expected: pass.

---

### Task 6: Backfill Existing Client Brains

**Files:**
- Create: `src/lib/brain/backfill-canonical.ts`
- Create: `src/lib/brain/__tests__/backfill-canonical.test.ts`
- Add route or script: `scripts/backfill-client-brain.mjs`

- [x] **Step 1: Test dated artifact to canonical merge**

Create a temp vault with dated keyword, competitor, and BEAST artifacts. Run backfill. Assert canonical notes receive managed sections and existing human text remains.

- [x] **Step 2: Implement backfill**

Backfill reads most recent dated artifacts by type and updates:

- `wiki/keywords/Keyword Targets and Page Map.md`
- `wiki/decisions/Keyword to URL Map.md`
- `wiki/sources/Competitor Landscape Cache.md`
- `wiki/sources/Competitor Keyword Research Summary.md`
- `wiki/entities/Primary Competitors.md`
- `wiki/deliverables/ULTIMATE BEAST Plan.md`

- [x] **Step 3: Add dry-run mode**

The script prints planned changes and refuses to mutate without `--write`.

- [x] **Step 4: Run against temp fixture**

Expected: no `.seo-office` user data mutation during tests.

---

### Task 7: Full Fixture E2E Against Rituária-Style Brain

**Files:**
- Add: `e2e/deep-brain-parity.spec.ts`
- Add fixture data under `e2e/fixtures/deep-brain/`

- [x] **Step 1: Add deterministic fixture**

Fixture should include:

- HTML crawl samples
- SERP samples
- competitor JSON
- PAA JSON
- keyword rows
- GSC/GA4 mock summaries
- visual reference metadata

- [x] **Step 2: Write Playwright assertions**

Assert:

- create client
- run Deep Brain
- live agent states appear immediately
- terminal status is `deep_ready` only when fixture data is present
- final chat summary is human-readable
- suggestion cards render
- vault canonical notes open
- report opens in-app
- no `(empty)` thinking duplicate
- no raw path-only final summary

- [x] **Step 3: Run e2e**

```bash
pnpm test:e2e
```

Expected: pass.

---

## Execution Order

1. Parity contract and tests.
2. Evidence ledger.
3. Marketing Brain Python bridges.
4. Expanded Deep Brain sweep.
5. Stricter semantic readiness.
6. Existing vault backfill.
7. Full fixture e2e.

## Launch Blockers

Resolved in this plan slice:

- First-class evidence ledger added at `wiki/meta/evidence-ledger.jsonl`.
- Default Deep Brain expanded to the core parity specialists and phase model.
- Marketing Brain Python generators now have a registry/runner and are wired into keyword, competitor, and BEAST synthesis/report paths.
- Existing client brain backfill exists with dry-run mode.
- Deterministic Rituária-style fixture e2e exists and passes.

Remaining broader launch risk outside this plan file:

- No unresolved script-bridge blocker remains from this slice. Broader launch risk is now in end-user workflow smoke and any additional real-provider edge cases beyond the verified smoke set.

Resolved after this plan slice:

- The direct fire-and-forget sweep path no longer requires a UI refresh for the final chat summary. `/sweeps/current` carries the terminal `final_summary`, and the mounted chat panel renders it live.
- Deterministic fixture data is now scoped to the client manifest's declared `measurement_access`; a no-integration client stays `needs_data` and cannot be reported as `deep_ready`.
- Live provider smoke coverage now exists and passed for the Deep Brain-required provider set. Command: `pnpm smoke:providers -- --live --strict`. Verified providers: DataForSEO, Search Console, GA4.
- Vendored Marketing Brain Python paths now have an offline temp-vault smoke gate. Command: `pnpm smoke:marketing-brain`. It creates realistic DataForSEO-shaped keyword, competitor, PAA, and visual fixtures, then validates workbook CSV/XLSX, visual manifest/source note, BEAST plan markdown, and HTML report output without mutating `.seo-office/`.
- Python subprocess timeout handling now reports a non-zero timeout result instead of treating signal-killed children as success; focused tests cover preflight, cancellation, timeout, and script-output validation.
- Deep Brain now has explicit phase-gate checkpoints between intake, diagnostic, discovery, synthesis, and final readiness. Hard lint/readiness blockers stop the phase, while missing integrations remain `needs_data` instead of false completion.
- Source-critical specialist parity is now covered by a contract test. The default Deep Brain sweep is 32 child tasks and includes ready coverage for performance, visual/images, GSC, GA4, backlinks, local, maps, hreflang, ecommerce, programmatic, FLOW, drift, and DataForSEO synthesis; Firecrawl-specific crawling is explicitly deferred until a bundled crawler is added.

## Non-Blocker Polish

- Better report typography.
- More visual office states.
- More refined chat card design.
- PDF export improvements.
