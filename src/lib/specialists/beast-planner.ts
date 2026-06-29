/**
 * BEAST Planner — synthesises every existing audit + the manifest into a
 * single execution plan.
 *
 * Adapted (condensed) from marketing-brain's `vendored/marketing-brain/agents/beast-planner.md`.
 * The original 4000-word prompt is too heavy for a single LLM call when
 * combined with audit context; this version preserves the structural
 * invariants (FLOW: Find / Leverage / Optimize / Win) and the per-action
 * rigor (owner / verifier / acceptance / rollback) but trims the framework
 * exposition the agent doesn't need to re-derive each run.
 */
import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { vaultRoot } from "@/lib/brain/paths";
import {
  registerSpecialist,
  type Specialist,
  type SpecialistContext,
} from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { runMarketingBrainScript } from "@/lib/marketing-brain/scripts";
import { writeArtifact } from "./_lib/artifact";
import { updateCanonicalNote } from "@/lib/brain/canonical-writer";

const SYSTEM_PROMPT = `You are the BEAST Planner inside SEO Office.

You receive a bundle of prior audits + client metadata. Your job is to compose the ULTIMATE BEAST Plan — a 30/60/90-day execution plan grounded in the FLOW framework (Find / Leverage / Optimize / Win) that the marketing-brain skill defines.

## Output contract

Produce a Markdown report with exactly these sections, in this order:

1. **TL;DR** — 5 bullets, the most important moves regardless of stage.
2. **Find** — the 3 highest-confidence opportunities surfaced by the audits. Cite which audit each came from.
3. **Leverage** — what assets / authority signals / existing content can be reused or repurposed.
4. **Optimize** — the 5 highest impact-per-effort technical + content fixes from the audits, restated as one-line actions.
5. **Win** — the moves that compound (topic authority depth, internal linking patterns, ongoing measurement loops).
6. **30-day plan** — week 1, 2, 3, 4. Each week: 2-3 actions with owner / acceptance / rollback.
7. **60-day plan** — bullets only, what builds on day 30.
8. **90-day plan** — bullets only, what compounds from day 60.
9. **AI Overview tactics** — specific moves for AI search citation (Google AI Overviews, ChatGPT, Perplexity).
10. **Guardrails** — explicit list of what we will NOT do (mass AI content, link schemes, exact-match doorway pages, etc.).

## Voice and constraints

- Every numerical claim must trace to one of the audits in the payload. Cite the audit file (e.g. "per 2026-05-11-technical.md").
- No traffic promises, no "guaranteed ranking" language, no "in 30 days you'll…" claims.
- Every action in the 30-day plan must have: owner (default: "operator"), acceptance criteria (one sentence), rollback (one sentence).
- White-hat only. If a tactic is grey-area, label it and move on.
- End after the Guardrails section.`;

const InputSchema = z.object({});
type Input = z.infer<typeof InputSchema>;

const beastPlanner: Specialist<Input> = {
  id: "beast-planner",
  name: "BEAST Planner",
  description:
    "Synthesises every prior audit into a 30/60/90-day FLOW-framework execution plan with owners + acceptance + rollback per action.",
  desk: "desk.beast-planner",
  inputSchema: InputSchema,
  async execute(ctx) {
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    ctx.emit("progress", "Gathering prior audits…", { progress: 0.1 });
    const auditsDir = path.join(vaultRoot(ctx.clientSlug), "wiki", "audits");
    const audits: Array<{ name: string; body: string }> = [];
    if (fs.existsSync(auditsDir)) {
      const entries = await fsp.readdir(auditsDir);
      for (const name of entries.sort()) {
        if (!name.endsWith(".md")) continue;
        // skip the marketing-brain template files (they're guidance docs,
        // not real audits) — we only want claude-generated outputs.
        if (!/^\d{4}-\d{2}-\d{2}-/.test(name)) continue;
        const body = await fsp.readFile(path.join(auditsDir, name), "utf8");
        // truncate each audit to keep total context manageable
        audits.push({ name, body: body.slice(0, 6000) });
      }
    }

    if (audits.length === 0) {
      throw new Error(
        "No claude-generated audits found. Run at least one audit (technical, content, or schema) before the BEAST Planner can synthesise.",
      );
    }

    ctx.emit("log", `Gathered ${audits.length} prior audit(s)`);
    const today = new Date().toISOString().slice(0, 10);
    const scriptSynthesis = await runBeastMarketingBrainBridge(
      ctx,
      manifest.business_type ?? "unknown",
      today,
    );

    const payload = {
      client: {
        name: manifest.vault.replace(/ marketing-brain$/, ""),
        site_url: manifest.site_under_audit,
        owner: manifest.manifest_owner,
      },
      audits,
      marketingBrainSynthesis: scriptSynthesis.planExcerpt,
    };

    let body: string;
    let fallbackReason: string | null = null;
    let llmCostUsd = 0;
    try {
      const provider = await selectProvider();
      ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.4 });

      const result = await provider.chat({
        tier: "synthesis",
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 8192,
        temperature: 0.5,
        timeoutMs: 8 * 60_000,
        messages: [
          {
            role: "user",
            content: `Compose the ULTIMATE BEAST Plan. Audits + client metadata follow.\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
          },
        ],
      });

      ctx.emit(
        "log",
        `${provider.id}${result.model ? " · " + result.model : ""}${result.durationMs ? " · " + (result.durationMs / 1000).toFixed(1) + "s" : ""}${result.costUsd != null ? " · $" + result.costUsd.toFixed(4) : ""}`,
      );
      llmCostUsd = result.costUsd ?? 0;
      body = result.text;
    } catch (err) {
      fallbackReason = err instanceof Error ? err.message : String(err);
      ctx.emit(
        "log",
        `LLM synthesis unavailable; writing deterministic BEAST fallback (${fallbackReason.slice(0, 180)})`,
      );
      body =
        scriptSynthesis.planBody ??
        renderFallbackPlan(payload.client, audits, fallbackReason);
    }
    ctx.emit("progress", "Writing BEAST plan to vault…", { progress: 0.85 });

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "deliverables",
        type: `beast-plan-${today}`,
        frontmatterType: "deliverable",
        title: `ULTIMATE BEAST Plan — ${today}`,
        body,
        tags: ["deliverable", "beast-plan", "flow-framework", "claude-generated"],
        confidence: "medium",
        costUsd: llmCostUsd,
      },
      {
        facts: [
          `BEAST plan synthesised from ${audits.length} prior audit(s).`,
          `Plan covers 30/60/90-day execution; first 30 days has per-week actions with owners.`,
        ],
        threadTitle: "BEAST plan review",
        threadRationale: "approve actions, assign owners, schedule week 1",
        statusNote: "BEAST plan ready — review with stakeholders, then begin week 1.",
      },
    );

    const renderedReportPath = await renderBeastMarketingBrainReport(
      ctx,
      relativePath,
      today,
      manifest.site_under_audit,
    );

    await updateCanonicalNote(
      ctx.clientSlug,
      "wiki/deliverables/ULTIMATE BEAST Plan.md",
      "beast-plan",
      [
        `Latest BEAST synthesis generated from ${audits.length} prior audit(s).`,
        fallbackReason
          ? `This run used ${scriptSynthesis.planBody ? "the Marketing Brain deterministic synthesis" : "the deterministic fallback"} because provider synthesis failed: ${fallbackReason}`
          : "This run used the configured synthesis provider, with Marketing Brain script context when available.",
        scriptSynthesis.artifactPaths.length
          ? `Marketing Brain script artifacts: ${scriptSynthesis.artifactPaths.map((artifact) => `\`${artifact}\``).join(", ")}.`
          : `Marketing Brain script synthesis unavailable: ${scriptSynthesis.message ?? "no script output"}.`,
        renderedReportPath
          ? `Rendered in-app BEAST report: \`${renderedReportPath}\`.`
          : "Rendered in-app BEAST report pending.",
        "",
        body,
        "",
        `Evidence: [[${relativePath.replace(/^wiki\//, "").replace(/\.md$/, "")}]].`,
      ].join("\n"),
    );

    return {
      summary: `BEAST plan written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      ...(renderedReportPath ? { reportPath: renderedReportPath } : {}),
      data: {
        auditCount: audits.length,
        fallback: Boolean(fallbackReason),
        fallbackReason,
        marketingBrainBridge: scriptSynthesis,
        renderedReportPath,
      },
      evidence: [
        {
          claim: scriptSynthesis.completed
            ? `BEAST plan synthesized ${audits.length} prior audit artifact(s) with the Marketing Brain synthesis script.`
            : `BEAST plan synthesized ${audits.length} prior audit artifact(s) into a 30/60/90 execution plan.`,
          provenance: "cached",
          source_paths: [
            relativePath,
            "wiki/deliverables/ULTIMATE BEAST Plan.md",
            ...scriptSynthesis.artifactPaths,
            ...(renderedReportPath ? [renderedReportPath] : []),
            ...audits.map((audit) => `wiki/audits/${audit.name}`),
          ],
          confidence: scriptSynthesis.completed && !fallbackReason ? "high" : "medium",
          cost_usd: 0,
        },
      ],
      degraded: Boolean(fallbackReason) || !scriptSynthesis.completed || !renderedReportPath,
      ...(fallbackReason || !scriptSynthesis.completed || !renderedReportPath
        ? {
            degradationReason:
              fallbackReason ??
              scriptSynthesis.message ??
              "Marketing Brain BEAST rendering did not complete.",
          }
        : {}),
    };
  },
};

registerSpecialist(beastPlanner);

export default beastPlanner;

async function runBeastMarketingBrainBridge(
  ctx: SpecialistContext<Input>,
  businessType: string,
  today: string,
): Promise<{
  completed: boolean;
  artifactPaths: string[];
  planBody?: string;
  planExcerpt?: string;
  message?: string;
}> {
  const root = vaultRoot(ctx.clientSlug);
  const outDir = path.join(root, ".raw", "sources", "marketing-brain");
  await fsp.mkdir(outDir, { recursive: true });
  const bundlePath = path.join(outDir, `beast-plan-context-${today}.md`);
  const planPath = path.join(outDir, `beast-plan-synthesis-${today}.md`);
  try {
    ctx.emit("progress", "Running Marketing Brain BEAST synthesis script…", {
      progress: 0.22,
    });
    const result = await runMarketingBrainScript(ctx.clientSlug, "synthesize-beast-plan", {
      signal: ctx.signal,
      timeoutMs: 120_000,
      args: [
        "--out",
        bundlePath,
        "--plan-out",
        planPath,
        "--business-type",
        businessType,
      ],
      onLine: (line, stream) => ctx.emit("log", `[marketing-brain:${stream}] ${line}`),
    });
    if (result.status === "needs_data") {
      return { completed: false, artifactPaths: [], message: result.message };
    }
    const planBody = await fsp.readFile(planPath, "utf8").catch(() => undefined);
    const artifacts = [
      toVaultRelative(root, bundlePath),
      toVaultRelative(root, planPath),
    ].filter(Boolean) as string[];
    return {
      completed: Boolean(planBody),
      artifactPaths: artifacts,
      planBody,
      planExcerpt: planBody?.slice(0, 5000),
    };
  } catch (err) {
    return {
      completed: false,
      artifactPaths: [],
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function renderBeastMarketingBrainReport(
  ctx: SpecialistContext<Input>,
  relativePath: string,
  today: string,
  siteUrl: string,
): Promise<string | undefined> {
  const root = vaultRoot(ctx.clientSlug);
  const outPdf = path.join(root, "reports", `${today}-beast-plan.pdf`);
  try {
    const result = await runMarketingBrainScript(ctx.clientSlug, "render-beast-pdf", {
      signal: ctx.signal,
      timeoutMs: 120_000,
      args: [
        "--plan-md",
        path.join(root, relativePath),
        "--out",
        outPdf,
        "--html-only",
        "--site-url",
        siteUrl,
      ],
      onLine: (line, stream) => ctx.emit("log", `[marketing-brain:${stream}] ${line}`),
    });
    if (result.status !== "succeeded") return undefined;
    const htmlRel = toVaultRelative(root, outPdf.replace(/\.pdf$/, ".html"));
    return htmlRel && fs.existsSync(path.join(root, htmlRel)) ? htmlRel : undefined;
  } catch (err) {
    ctx.emit(
      "log",
      `Marketing Brain BEAST HTML render skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}

function toVaultRelative(root: string, abs: string): string | undefined {
  const rel = path.relative(root, abs).split(path.sep).join("/");
  return rel && !rel.startsWith("..") ? rel : undefined;
}

function renderFallbackPlan(
  client: { name: string; site_url: string; owner: string },
  audits: Array<{ name: string; body: string }>,
  reason: string,
): string {
  const auditList = audits.map((a) => a.name).join(", ");
  const cite = (kind: string) =>
    audits.find((a) => a.name.includes(kind))?.name ?? audits[0]?.name ?? "generated audits";
  return [
    "## TL;DR",
    `- Deterministic fallback plan generated because the configured LLM provider failed: ${reason}`,
    `- Treat this as the launchable operating plan for ${client.name}; refine after human review.`,
    `- Start with crawl/indexation and measurement foundations from ${cite("technical")}.`,
    `- Use the keyword and content outputs from ${cite("keywords")} and ${cite("content")} to pick the first editorial sprint.`,
    `- Keep every implementation reversible with explicit rollback notes before publishing.`,
    "",
    "## Find",
    `- Confirm indexability, sitemap coverage, and page health from ${cite("technical")} and ${cite("sitemap")}.`,
    `- Prioritize keyword targets and SERP intent gaps from ${cite("keywords")}.`,
    `- Validate schema and search-experience alignment using ${cite("schema")} and ${cite("sxo")}.`,
    "",
    "## Leverage",
    `- Reuse existing brand, product, docs, integration, and comparison assets already surfaced across ${auditList}.`,
    "- Convert high-trust implementation knowledge into citeable sections, FAQs, and comparison blocks.",
    "- Route every new action through the vault so later specialists can see what was already decided.",
    "",
    "## Optimize",
    `- Fix critical crawl/indexation defects identified in ${cite("technical")}.`,
    `- Improve structured data from ${cite("schema")} before scaling new pages.`,
    `- Align homepage and core conversion paths to search intent using ${cite("page")} and ${cite("sxo")}.`,
    `- Turn keyword opportunities from ${cite("keywords")} into mapped URL/page decisions.`,
    `- Refresh internal links after every new brief or cluster from ${cite("content")}.`,
    "",
    "## Win",
    "- Build topic authority around the highest-confidence clusters first.",
    "- Create comparison and alternative pages only where the competitor-page plan shows a clear user need.",
    "- Maintain a weekly measurement loop: rankings, indexed pages, conversion path health, and stale-content review.",
    "",
    "## 30-day plan",
    "### Week 1",
    "- Action: repair crawl, sitemap, schema, and page-health blockers. Owner: operator. Acceptance: critical technical findings are either fixed or documented with a blocked reason. Rollback: revert the specific site changes and keep the vault decision note.",
    "- Action: lock the first keyword-to-URL map. Owner: operator. Acceptance: each selected target has one primary URL and one next action. Rollback: move disputed mappings back to needs-review.",
    "### Week 2",
    "- Action: publish or refresh the first cluster's anchor page and support pages. Owner: operator. Acceptance: pages match intent, include internal links, and cite source notes. Rollback: unpublish or revert to the previous version.",
    "- Action: add schema and FAQ improvements to the highest-impact pages. Owner: operator. Acceptance: validation passes and no invalid structured data ships. Rollback: remove the changed schema block.",
    "### Week 3",
    "- Action: ship comparison/alternative content only for approved competitor opportunities. Owner: operator. Acceptance: pages are fair, useful, and internally linked. Rollback: noindex or revert pages with weak evidence.",
    "- Action: refresh internal linking based on the cluster map. Owner: operator. Acceptance: target pages have contextual links from relevant existing assets. Rollback: remove links that reduce usefulness.",
    "### Week 4",
    "- Action: review performance, indexation, and ranking movement. Owner: operator. Acceptance: a weekly measurement note is written in the vault. Rollback: mark inconclusive data as low confidence.",
    "- Action: plan the next 30-day content and technical sprint. Owner: operator. Acceptance: next actions are assigned with owners and acceptance criteria. Rollback: return actions to needs-review.",
    "",
    "## 60-day plan",
    "- Expand the winning cluster into deeper support content.",
    "- Refresh competitor and integration pages using verified search demand.",
    "- Improve conversion paths on pages with qualified traffic but weak engagement.",
    "- Re-run technical, schema, sitemap, and content audits after major releases.",
    "",
    "## 90-day plan",
    "- Consolidate low-value or overlapping pages based on measured performance.",
    "- Build repeatable briefs for new clusters and integrations.",
    "- Turn validated content patterns into a monthly SEO operating cadence.",
    "- Keep the vault clean: no dead links, no unresolved placeholders, no unreviewed critical decisions.",
    "",
    "## AI Overview tactics",
    "- Add concise definitions, step-by-step explanations, comparison tables, and source-backed FAQs.",
    "- Keep brand/entity pages consistent across schema, headings, and internal links.",
    "- Make expert review and update cadence visible on important pages.",
    "- Avoid unsupported claims; cite the relevant audit or source note inside the vault before shipping.",
    "",
    "## Guardrails",
    "- No mass AI content.",
    "- No link schemes.",
    "- No doorway pages or thin exact-match pages.",
    "- No traffic or ranking guarantees.",
    "- No publishing from low-confidence notes without human review.",
  ].join("\n");
}
