# Deep Brain Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SEO Office produce a genuinely populated Marketing Brain, not just a lint-clean scaffold plus dated specialist reports.

**Architecture:** Treat Marketing Brain completeness as a first-class contract. Specialists must write structured evidence and update canonical vault notes; the orchestrator must gate each phase, synthesize source-backed outputs, and only call the brain complete when semantic gates pass.

**Tech Stack:** Next.js 16 App Router, TypeScript, SQLite index, local Obsidian-style vault, vendored Marketing Brain, vendored Claude SEO/Codex SEO references, Playwright, Vitest.

---

## Current Diagnosis

SEO Office is not failing because the template is missing. It is failing because the full Marketing Brain population pipeline is incomplete.

Evidence:

- `src/lib/brain/scaffold.ts` renders the vendored Marketing Brain template, overlays business type, writes manifest, repairs placeholders, rebuilds index, and lint-gates. This is a scaffold contract, not a completed brain contract.
- `src/lib/specialists/_lib/artifact.ts` writes new dated artifacts with `approval_status: needs-review` and does not update canonical seed notes such as `wiki/keywords/Keyword Targets and Page Map.md`, `wiki/sources/Competitor Landscape Cache.md`, or `wiki/entities/Primary Competitors.md`.
- `src/lib/brain/readiness.ts` scores file counts, report counts, and BEAST plan headings. It does not prove that canonical notes are source-backed, client-specific, and no longer seed-level.
- `src/lib/orchestrator/finalize-sweep.ts` fabricates manifest source rows from task paths and sets `cost_usd: 0`; it does not carry data provenance from specialists.
- `src/lib/orchestrator/task-templates.ts` runs 12 specialists, but omits parity-critical areas such as visual, performance, Firecrawl/full crawl, GSC/GA4 specialist ingestion, backlinks, local/maps, hreflang, images, drift, and DataForSEO source synthesis.
- `src/lib/orchestrator/dispatch.ts` correctly skips missing integration specialists, but finalization currently turns skipped integrations into sweep failure rather than a useful `needs_data` brain state.

## Acceptance Criteria

- A fresh client scaffold has zero unresolved `{{...}}` tokens, valid required frontmatter, a manifest, and linter score >= 95.
- A completed Deep Brain updates canonical notes, not only dated artifacts.
- Every major recommendation has evidence paths and a provenance label: `live_api`, `cached`, `manual`, or `model_estimate`.
- Missing Search Console, GA4, or DataForSEO cannot produce `deep_ready`; it must produce `needs_data`.
- `deep_ready` requires populated source notes, entity notes, keyword map, page map, decisions, flows, deliverables, reports, final review, and source-backed synthesis.
- `needs-review` is not treated as a launch blocker by itself, but unresolved seed notes and placeholder prose are blockers.
- The final chat summary tells a normal user what was found, what is missing, and what to do next.
- Playwright covers create client, run Deep Brain with deterministic fixture data, live agent states, terminal finalization, vault links, report opening, and suggestion cards.

---

### Task 1: Add Brain Population Contract Types

**Files:**
- Modify: `src/lib/brain/types.ts`
- Create: `src/lib/brain/population-contract.ts`
- Test: `src/lib/brain/__tests__/population-contract.test.ts`

- [x] **Step 1: Add failing tests for required provenance and canonical targets**

```ts
import { describe, expect, it } from "vitest";
import {
  CANONICAL_BRAIN_TARGETS,
  DataProvenanceZ,
  SpecialistEvidenceZ,
} from "@/lib/brain/population-contract";

describe("brain population contract", () => {
  it("requires canonical Marketing Brain targets", () => {
    expect(CANONICAL_BRAIN_TARGETS).toContain("wiki/keywords/Keyword Targets and Page Map.md");
    expect(CANONICAL_BRAIN_TARGETS).toContain("wiki/sources/Competitor Landscape Cache.md");
    expect(CANONICAL_BRAIN_TARGETS).toContain("wiki/entities/Primary Competitors.md");
    expect(CANONICAL_BRAIN_TARGETS).toContain("wiki/deliverables/ULTIMATE BEAST Plan.md");
  });

  it("accepts explicit data provenance only", () => {
    expect(DataProvenanceZ.parse("live_api")).toBe("live_api");
    expect(() => DataProvenanceZ.parse("guessed")).toThrow();
  });

  it("requires source paths for evidence-backed findings", () => {
    expect(() =>
      SpecialistEvidenceZ.parse({
        claim: "Keyword demand is strong.",
        provenance: "live_api",
        source_paths: [],
        confidence: "high",
      }),
    ).toThrow();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/brain/__tests__/population-contract.test.ts`

Expected: fails because `population-contract.ts` does not exist.

- [x] **Step 3: Implement the population contract**

Create `src/lib/brain/population-contract.ts`:

```ts
import { z } from "zod";

export const DataProvenanceZ = z.enum([
  "live_api",
  "cached",
  "manual",
  "model_estimate",
]);

export type DataProvenance = z.infer<typeof DataProvenanceZ>;

export const SpecialistEvidenceZ = z.object({
  claim: z.string().min(1),
  provenance: DataProvenanceZ,
  source_paths: z.array(z.string().min(1)).min(1),
  confidence: z.enum(["low", "medium", "high"]),
  cost_usd: z.number().min(0).default(0),
});

export type SpecialistEvidence = z.infer<typeof SpecialistEvidenceZ>;

export const CANONICAL_BRAIN_TARGETS = [
  "wiki/hot.md",
  "wiki/log.md",
  "wiki/index.md",
  "wiki/overview.md",
  "wiki/sources/Competitor Landscape Cache.md",
  "wiki/sources/Competitor Keyword Research Summary.md",
  "wiki/sources/DataForSEO Keyword Exports.md",
  "wiki/sources/PAA Mining Digest.md",
  "wiki/entities/Primary Competitors.md",
  "wiki/keywords/Keyword Targets and Page Map.md",
  "wiki/keywords/Keyword Cannibalization Ledger.md",
  "wiki/decisions/Keyword to URL Map.md",
  "wiki/deliverables/ULTIMATE BEAST Plan.md",
] as const;
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/brain/__tests__/population-contract.test.ts`

Expected: pass.

Verified 2026-05-17: `src/lib/brain/population-contract.ts` defines canonical targets, explicit provenance, evidence schema, and managed section markers. `src/lib/brain/__tests__/population-contract.test.ts` passes under the Node test runner.

---

### Task 2: Extend Specialist Result Contract

**Files:**
- Modify: `src/lib/orchestrator/registry.ts`
- Modify: `src/lib/orchestrator/task-runner.ts`
- Modify: `src/lib/specialists/_lib/artifact.ts`
- Test: `src/lib/orchestrator/__tests__/task-runner.test.ts` or create focused test if absent

- [x] **Step 1: Write failing test for evidence propagation**

Create or extend a task-runner unit test that runs a fake specialist returning:

```ts
{
  summary: "Keyword map generated.",
  resultPath: "wiki/keywords/2026-05-16-keywords.md",
  evidence: [
    {
      claim: "Top keyword has live volume evidence.",
      provenance: "live_api",
      source_paths: ["wiki/sources/DataForSEO Keyword Exports.md"],
      confidence: "high",
      cost_usd: 0.03,
    },
  ],
}
```

Assert the task row stores structured evidence or the finalizer can read it without fabricating `cost_usd: 0`.

- [x] **Step 2: Run the focused test**

Run: `pnpm vitest run src/lib/orchestrator/__tests__`

Expected: fail until `SpecialistResult` supports evidence.

- [x] **Step 3: Add fields to `SpecialistResult`**

Update `src/lib/orchestrator/registry.ts`:

```ts
import type { SpecialistEvidence } from "@/lib/brain/population-contract";

export interface SpecialistResult {
  summary: string;
  resultPath?: string;
  reportPath?: string;
  dataPath?: string;
  data?: unknown;
  evidence?: SpecialistEvidence[];
  degraded?: boolean;
  degradationReason?: string;
}
```

- [x] **Step 4: Persist evidence on task completion**

Update the task completion path in `src/lib/orchestrator/task-runner.ts` so evidence is serialized into a task result metadata field or sidecar file. If the task table does not have a metadata column, create a vault sidecar under `wiki/meta/task-evidence/<task-id>.json` and store its path on the task.

- [x] **Step 5: Run tests**

Run: `pnpm typecheck && pnpm vitest run src/lib/orchestrator/__tests__`

Expected: pass.

Verified 2026-05-17: `SpecialistResult` carries `evidence`, `degraded`, and `degradationReason`; `job-queue` appends specialist evidence to `wiki/meta/evidence-ledger.jsonl`; orchestrator review links the ledger. `finalizeBrainSweep` now reads ledger costs when creating manifest source rows instead of hard-coding paid evidence as `$0`; `src/lib/orchestrator/__tests__/finalize-sweep.test.ts` covers skipped integrations and cost propagation.

---

### Task 3: Populate Canonical Brain Notes

**Files:**
- Create: `src/lib/brain/canonical-writer.ts`
- Modify: `src/lib/specialists/keyword-researcher.ts`
- Modify: `src/lib/specialists/competitor-pages.ts`
- Modify: `src/lib/specialists/beast-planner.ts`
- Test: `src/lib/brain/__tests__/canonical-writer.test.ts`

- [x] **Step 1: Write failing test for canonical note update**

```ts
import { describe, expect, it } from "vitest";
import { mergeCanonicalSection } from "@/lib/brain/canonical-writer";

describe("canonical writer", () => {
  it("replaces managed sections without deleting human content", () => {
    const before = [
      "# Keyword Targets and Page Map",
      "",
      "Human note stays.",
      "",
      "<!-- seo-office:keyword-map:start -->",
      "Old generated content.",
      "<!-- seo-office:keyword-map:end -->",
    ].join("\n");

    const after = mergeCanonicalSection(before, "keyword-map", "| Keyword | URL |\n| --- | --- |");

    expect(after).toContain("Human note stays.");
    expect(after).toContain("| Keyword | URL |");
    expect(after).not.toContain("Old generated content.");
  });
});
```

- [x] **Step 2: Implement canonical section writer**

Create `src/lib/brain/canonical-writer.ts`:

```ts
export function mergeCanonicalSection(
  body: string,
  sectionId: string,
  generatedMarkdown: string,
): string {
  const start = `<!-- seo-office:${sectionId}:start -->`;
  const end = `<!-- seo-office:${sectionId}:end -->`;
  const block = `${start}\n${generatedMarkdown.trim()}\n${end}`;
  if (body.includes(start) && body.includes(end)) {
    return body.replace(new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`), block);
  }
  return `${body.trim()}\n\n${block}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [x] **Step 3: Add `updateCanonicalNote()` helper**

Same file:

```ts
import { readRaw, writeRaw } from "@/lib/brain/vault-fs";

export async function updateCanonicalNote(
  clientSlug: string,
  relativePath: string,
  sectionId: string,
  generatedMarkdown: string,
): Promise<void> {
  const current = await readRaw(clientSlug, relativePath);
  await writeRaw(clientSlug, relativePath, mergeCanonicalSection(current, sectionId, generatedMarkdown));
}
```

- [x] **Step 4: Wire keyword researcher to canonical keyword notes**

After writing its dated artifact, `keyword-researcher.ts` must also update:

- `wiki/keywords/Keyword Targets and Page Map.md`
- `wiki/decisions/Keyword to URL Map.md`
- `wiki/sources/DataForSEO Keyword Exports.md`

Generated sections must include provenance labels for each row.

- [x] **Step 5: Wire competitor and BEAST specialists**

`competitor-pages.ts` must update competitor source/entity notes. `beast-planner.ts` must update `wiki/deliverables/ULTIMATE BEAST Plan.md` instead of only writing a dated plan.

- [x] **Step 6: Run tests**

Run: `pnpm vitest run src/lib/brain/__tests__/canonical-writer.test.ts && pnpm typecheck`

Expected: pass.

Verified 2026-05-17: `canonical-writer.ts` preserves human text while replacing managed SEO Office sections. Keyword, competitor, and BEAST specialists update canonical keyword/source/entity/deliverable notes. Focused canonical writer coverage and full unit coverage pass.

---

### Task 4: Strengthen Readiness From Shape To Substance

**Files:**
- Modify: `src/lib/brain/readiness.ts`
- Modify: `src/lib/brain/readiness-types.ts`
- Test: `src/lib/brain/__tests__/readiness.test.ts`

- [x] **Step 1: Add failing fixture tests**

Add tests for:

- lint-clean but generic seed vault returns `draft`
- missing DataForSEO/GSC/GA4 returns `needs_data`
- seed notes with `confidence: seed` and `approval_status: needs-review` prevent `deep_ready`
- shallow BEAST plan with headings but no client-specific facts prevents `deep_ready`

- [x] **Step 2: Add seed debt detector**

In `readiness.ts`, scan notes for:

```ts
const SEED_DEBT_PATTERNS = [
  /skill fills/i,
  /pending source/i,
  /tbd pending/i,
  /example only/i,
  /replace this/i,
  /\{\{[^}]+\}\}/,
];
```

Count seed debt and include it as a dimension.

- [x] **Step 3: Add canonical note completeness checks**

Require managed sections in canonical notes from `CANONICAL_BRAIN_TARGETS`. Missing generated sections are gaps.

- [x] **Step 4: Raise `deep_ready` gate**

Require:

- no blockers
- data access present
- score >= 92
- synthesis score >= 85
- seed debt count = 0 for canonical targets
- minimum evidence count >= 10

- [x] **Step 5: Run focused readiness tests**

Run: `pnpm vitest run src/lib/brain/__tests__/readiness.test.ts`

Expected: pass.

Verified 2026-05-17: readiness now scores evidence quality, canonical note depth, source specificity, actionability, and integration completeness. `deep_ready` requires data access, source-backed evidence, managed canonical sections, no seed debt, and a complete final review. `src/lib/brain/__tests__/readiness.test.ts` covers missing data, missing ledger, shallow canonical notes, dated-only reports, and deep-ready fixtures.

---

### Task 5: Make Missing Integrations Graceful

**Files:**
- Modify: `src/lib/orchestrator/finalize-sweep.ts`
- Modify: `src/lib/orchestrator/task-runner.ts`
- Test: `src/lib/orchestrator/__tests__/finalize-sweep.test.ts`

- [x] **Step 1: Add failing test**

Test a sweep with one cancelled child whose summary starts `skipped: requires DataForSEO`. Expected final root state is terminal with readiness `needs_data`, not failed.

- [x] **Step 2: Change finalization behavior**

In `finalizeBrainSweep()`, do not throw for skipped integration children if readiness is `needs_data`. Throw only when:

- child failed
- child cancelled without skip reason
- readiness status is `blocked`
- lint has errors

- [x] **Step 3: Surface partial status**

Ensure final chat says:

```text
The brain is useful but incomplete because DataForSEO/Search Console/GA4 is missing.
```

- [x] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/orchestrator/__tests__/finalize-sweep.test.ts`

Expected: pass.

Verified 2026-05-17: skipped integration children resolve to terminal `needs_data` instead of failed sweeps, while hard child failures still block readiness. Final chat/readiness narration tells the user the brain is useful but incomplete when required measurement sources are missing.

---

### Task 6: Add Phase Gates

**Files:**
- Modify: `src/lib/orchestrator/task-templates.ts`
- Modify: `src/lib/orchestrator/task-runner.ts`
- Create: `src/lib/specialists/phase-gate.ts`
- Test: `src/lib/orchestrator/__tests__/phase-gate.test.ts`

- [x] **Step 1: Add a phase gate specialist**

Create `phase-gate.ts` as a read-only specialist that runs:

- `lintVault()`
- `evaluateBrainReadiness()` with phase mode
- canonical note debt checks

It returns failure if the phase has blocking errors.

- [x] **Step 2: Insert gates in template**

Update `BUILD_BRAIN_SWEEP`:

- diagnostic specialists → `diagnostic-gate`
- discovery specialists depend on `diagnostic-gate`
- synthesis specialists depend on `discovery-gate`
- final review depends on synthesis outputs

- [x] **Step 3: Test dependency order**

Verified 2026-05-17: `BUILD_BRAIN_SWEEP` now includes `phase-gate` checkpoints after intake, diagnostic, discovery, and synthesis phases. Unit coverage asserts dependency order, and the specialist fails on hard lint/readiness blockers while remaining advisory for incomplete `needs_data` states.

- [x] **Step 4: Run tests**

Run:

```bash
node --conditions=react-server --import ./scripts/test-resolve-hook.mjs --test src/lib/orchestrator/__tests__/build-brain-template.test.ts src/lib/specialists/__tests__/phase-gate.test.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

Verified 2026-05-17: focused phase-gate/template tests passed, full unit suite passed 101/101, and Playwright passed 4/4 with the then-expanded 25-child Deep Brain sweep. A later specialist parity slice expanded it again to 32 child tasks.

---

### Task 7: Specialist Parity Upgrade Slice

**Files:**
- Modify: `src/lib/specialists/catalog.ts`
- Modify: selected specialists under `src/lib/specialists/`
- Test: `src/lib/specialists/__tests__/`

- [x] **Step 1: Add parity matrix test**

Create a test asserting every source-critical area has either a runnable specialist or an explicit deferred reason:

- full crawl / Firecrawl
- visual
- performance
- DataForSEO synthesis
- GSC
- GA4
- backlinks
- local/maps
- hreflang
- images
- drift

- [x] **Step 2: Promote missing critical specialists**

Implemented 2026-05-17 with the ready specialist equivalents already present in the codebase, plus an explicit deferred reason for Firecrawl-specific crawling:

- visual/image coverage: `page-analyzer`, `image-auditor`
- performance coverage: `google-suite`, `technical-auditor`
- crawl/index coverage: `technical-deep-auditor`, `sitemap-architect`; Firecrawl-backed crawling remains explicitly deferred until bundled
- DataForSEO synthesis: `keyword-researcher`, `competitor-pages`, `topic-clusterer`
- newly added to Deep Brain default sweep: `hreflang-auditor`, `drift-monitor`, `local-seo`, `maps-intelligence`, `ecommerce-analyst`, `programmatic-strategist`, `flow-framework`

The Deep Brain sweep now has 32 child tasks and the source-critical parity test requires every area to have a ready specialist in the default sweep or a named deferred reason.

- [x] **Step 3: Run specialist tests**

Run:

```bash
node --conditions=react-server --import ./scripts/test-resolve-hook.mjs --test src/lib/brain/__tests__/parity-matrix.test.ts src/lib/orchestrator/__tests__/build-brain-template.test.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm smoke:marketing-brain
pnpm smoke:providers
```

Verified 2026-05-17: focused parity/template tests passed, full unit suite passed 103/103, Playwright passed 4/4 with the expanded 32-child Deep Brain sweep, Marketing Brain script smoke passed, and provider smoke dry-run reported the required providers configured.

---

### Task 8: Human-Readable Final Review And Chat Suggestions

**Files:**
- Modify: `src/lib/orchestrator/finalize-sweep.ts`
- Modify: `src/lib/orchestrator/readiness-narration.ts`
- Modify: `src/components/ChatPanel.tsx`
- Test: `src/lib/orchestrator/__tests__/finalize-sweep.test.ts`
- E2E: `e2e/build-brain.spec.ts`

- [x] **Step 1: Test final summary text**

Assert final chat contains:

- plain-language status
- opportunities found
- missing data sources
- top next action
- links as supporting evidence, not the whole message

- [x] **Step 2: Render suggestion cards from readiness**

Suggestion cards must include:

- title
- why it matters
- confidence
- effort
- impact
- CTA

- [x] **Step 3: Ensure Next Step opens top suggestion**

Update `Next Step` behavior to open the top suggestion detail or CTA, not just switch to the orchestrator.

- [x] **Step 4: Run E2E**

Run: `pnpm test:e2e`

Expected: build-brain spec passes and asserts suggestion card behavior.

Verified 2026-05-17: final summaries render plain-language readiness, top action, review/evidence support, and `seo-suggestions` payloads. Suggestion cards render title, why it matters, confidence, effort, impact, and CTA. The office sweep card's `Review suggestions` action now activates the latest top suggestion CTA: missing-data runs navigate to `/setup#integrations`, while deep-ready fixture runs open the brain review slide-over. Focused Playwright coverage was added to `e2e/build-brain.spec.ts` and `e2e/deep-brain-parity.spec.ts`.

---

### Task 9: Fixture-Based Deep Brain E2E

**Files:**
- Create: `e2e/fixtures/deep-brain/`
- Modify: `e2e/build-brain.spec.ts`
- Modify: `scripts/e2e/`

- [x] **Step 1: Add deterministic fixture data**

Fixture must include:

- DataForSEO keyword rows
- competitor domains
- PAA questions
- one GSC-like query/page payload
- one GA4-like landing-page payload
- crawl/page inventory

- [x] **Step 2: Run Deep Brain with fixture integrations**

The e2e should create a client, run Deep Brain, wait for terminal finalization, and assert:

- status is `deep_ready`
- canonical keyword map exists and is populated
- competitor source note is populated
- final review is human-readable
- no unresolved seed debt in canonical targets
- reports open in app
- suggestion cards are clickable

- [x] **Step 3: Add negative E2E**

Run the same client without fixture integrations and assert:

- status is `needs_data`
- UI does not say complete
- suggestions prioritize connecting integrations

- [x] **Step 4: Run E2E**

Run: `pnpm test:e2e`

Verified 2026-05-17: both positive and negative Deep Brain flows pass.

Verified again 2026-05-17 after manifest provenance hardening: `pnpm test:e2e e2e/deep-brain-parity.spec.ts` passed 2/2 after a fresh `pnpm build`.

---

## Verification Gate

Before calling this done, run:

```bash
pnpm smoke:marketing-brain
pnpm smoke:providers -- --live --strict
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Verified 2026-05-17 against the current worktree:

- `pnpm smoke:marketing-brain` passed and removed its temp data root.
- `pnpm smoke:providers -- --live --strict` passed for DataForSEO, Search Console, and GA4.
- `pnpm typecheck` passed.
- `pnpm lint` passed with the existing vendored `three-holographic-material` hook warning only.
- `pnpm test` passed 109/109.
- `pnpm test:e2e` passed 6/6 with 1 expected skip for the explicit fault-injection phase-gate spec.
- `pnpm build` passed.
- `pnpm test:e2e e2e/deep-brain-parity.spec.ts` passed 2/2 after adding explicit canonical keyword-map open coverage.

Manual smoke:

- Create a fresh client.
- Run Deep Brain.
- Open Vault.
- Open final review.
- Open canonical keyword map.
- Open BEAST plan.
- Open a report.
- Confirm final chat summary is understandable without reading file paths.
- Confirm missing integrations produce `needs_data`, not `deep_ready`.

## Launch Blockers

Resolved in this plan slice:

- Canonical notes are populated through managed SEO Office sections and guarded by readiness tests.
- Specialist evidence is persisted in an append-only ledger with explicit provenance and source paths.
- Manifest source rows now carry matching evidence-ledger cost when a task output path is backed by paid/live evidence.
- Missing integrations produce `needs_data`, not false `deep_ready` or failed sweeps.
- BEAST plan depth is part of canonical note/readiness checks.
- Readiness uses semantic dimensions instead of file counts alone.
- E2E verifies brain completeness, report opening, suggestion cards, live finalization, and positive/negative fixture readiness.

Remaining broader launch risk:

- Firecrawl-specific crawling remains explicitly deferred until a bundled crawler is added.
- Manual end-user workflow smoke is now covered by automated Playwright flows for fresh client creation, Deep Brain run, Vault open, final review open, canonical keyword map open, BEAST plan open, in-app report open, readable final chat summary, and `needs_data` negative readiness. Firecrawl-specific crawling remains the only explicit parity deferral.

## Non-Goals For This Slice

- SaaS auth, billing, telemetry, cloud sync.
- Mutating a client website or GitHub repo.
- Perfect parity with every Claude SEO/Codex SEO skill in one patch.
- Removing `needs-review` entirely. Generated analysis should remain reviewable; the app must distinguish “machine-valid” from “human-approved.”
