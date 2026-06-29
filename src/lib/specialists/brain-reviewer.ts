/**
 * Brain Reviewer — the Secretary's semantic double-check.
 *
 * Every other quality gate in the system is STRUCTURAL: does the file exist,
 * is the frontmatter valid, is the word count high enough, how many evidence
 * entries are there. None of them read what the brain actually SAYS. This
 * specialist does: it reads the canonical brain notes, the evidence ledger,
 * and the manifest, then runs one LLM pass to look for the failure modes
 * structure can't catch —
 *
 *   - a claim with no backing source, or one its source contradicts;
 *   - two notes that disagree (business_type vs the competitor set, a keyword
 *     mapped to an implausible URL);
 *   - hallucinations (a fabricated competitor, an impossible metric);
 *   - prose that clears the lint word-count gate but says nothing concrete;
 *   - a confidence label the provenance doesn't justify.
 *
 * It NEVER hard-blocks. It writes a machine-readable summary
 * (`wiki/meta/brain-review.json`) that the readiness evaluator reads to
 * DOWNGRADE a brain with unresolved high-severity findings, plus a human
 * markdown report. A false positive can lower a score; it can never trap the
 * brain. Runs two ways: automatically at the end of a build-brain sweep
 * (via `finalizeBrainSweep`), and on demand when the user asks to review.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
// Explicit `/index`: this module is transitively imported by the
// finalize-sweep test chain, and the node test resolver doesn't resolve bare
// directory imports to their index. tsc + the bundler accept either form.
import { selectProvider } from "@/lib/integrations/providers/index";
import { readNote } from "@/lib/brain/vault-fs";
import { CANONICAL_BRAIN_TARGETS } from "@/lib/brain/population-contract";
import { readEvidenceLedger } from "@/lib/brain/evidence-ledger";
import {
  summarizeFindings,
  writeBrainReview,
  type BrainReviewSummary,
} from "@/lib/brain/brain-review";
import { parseReviewerReply } from "./_lib/review-parse";
import { writeArtifact } from "./_lib/artifact";

const MAX_NOTE_CHARS = 1800; // per-note excerpt cap — bounds the token budget
const MAX_EVIDENCE_ROWS = 40;

const SYSTEM_PROMPT = `You are the Brain Reviewer inside SEO Office — a meticulous, skeptical editor whose only job is to find what is WRONG with a marketing brain before a human trusts it.

You receive the brain's canonical notes, its evidence ledger, and its manifest. Audit for these failure modes, in priority order:

1. **Hallucination** — a competitor, statistic, product, or fact that looks fabricated or impossible (e.g. a competitor unrelated to the niche, a metric like "412% conversion rate", a named source that cannot exist).
2. **Evidence gap** — a confident claim with no backing source, or a claim its cited source would not actually support.
3. **Consistency** — two notes that contradict each other: business_type vs the competitor set, a keyword mapped to an implausible/irrelevant URL, a positioning claim that fights the stated niche.
4. **Shallow** — a note long enough to pass a word-count gate but empty of concrete, specific, client-particular content (generic boilerplate that would read identically for any business).
5. **Confidence mismatch** — a "high" confidence label on a claim whose provenance is only a model estimate or visible-page guess.

## Output contract

Return ONLY a single JSON object, no prose around it:

{
  "summary": "<one paragraph: the brain's overall trustworthiness and the single most important thing to fix, in plain language>",
  "findings": [
    {
      "severity": "high" | "medium" | "low",
      "category": "hallucination" | "evidence" | "consistency" | "shallow" | "confidence" | "other",
      "note": "<vault-relative path of the note this is about, or omit>",
      "message": "<one concrete sentence: what is wrong and why it matters>"
    }
  ]
}

Rules:
- "high" severity = a human would be misled or embarrassed if they acted on it (hallucinations, contradicted claims). Use it sparingly and only when you are confident.
- If the brain is genuinely clean, return "findings": []. Do NOT invent problems to look thorough — a false alarm wastes the user's trust as much as a miss.
- Quote the offending text in the message when you can. Be specific, never vague.`;

interface LoadedNote {
  path: string;
  confidence?: string;
  businessType?: string;
  excerpt: string;
  truncated: boolean;
}

/** Read the canonical brain notes that exist, capped per note. */
async function loadCanonicalNotes(clientSlug: string): Promise<LoadedNote[]> {
  const loaded: LoadedNote[] = [];
  for (const path of CANONICAL_BRAIN_TARGETS) {
    const note = await readNote(clientSlug, path).catch(() => null);
    if (!note) continue;
    const body = note.body ?? "";
    loaded.push({
      path,
      confidence: typeof note.frontmatter?.confidence === "string"
        ? note.frontmatter.confidence
        : undefined,
      businessType: typeof note.frontmatter?.business_type === "string"
        ? note.frontmatter.business_type
        : undefined,
      excerpt: body.slice(0, MAX_NOTE_CHARS),
      truncated: body.length > MAX_NOTE_CHARS,
    });
  }
  return loaded;
}

export interface RunBrainReviewResult {
  summary: BrainReviewSummary;
  /** Vault-relative path of the human markdown report. */
  reportPath: string;
  /** Native execution envelope from the artifact write. */
  executionResult: Awaited<ReturnType<typeof writeArtifact>>["executionResult"];
}

/**
 * Core review pass. Reusable by both the registered specialist and the
 * post-sweep finalizer. Throws only on a missing manifest or a hard provider
 * failure — callers that must not break (finalize) wrap it in try/catch.
 */
export async function runBrainReview(
  clientSlug: string,
  opts: {
    jobId?: string;
    signal?: AbortSignal;
    emit?: (kind: "log" | "progress", message: string, extra?: { progress?: number }) => void;
  } = {},
): Promise<RunBrainReviewResult> {
  const emit = opts.emit ?? (() => undefined);
  const manifest = await readManifest(clientSlug);
  if (!manifest) throw new Error(`no manifest for client "${clientSlug}"`);

  emit("progress", "Reading the brain…", { progress: 0.15 });
  const notes = await loadCanonicalNotes(clientSlug);
  const ledger = await readEvidenceLedger(clientSlug).catch(() => []);

  const payload = {
    site: manifest.site_under_audit,
    business_type: manifest.business_type,
    declared_competitors: manifest.primary_competitors ?? [],
    notes: notes.map((n) => ({
      path: n.path,
      confidence: n.confidence,
      business_type: n.businessType,
      content: n.excerpt + (n.truncated ? "\n…[truncated]" : ""),
    })),
    evidence_ledger: ledger.slice(0, MAX_EVIDENCE_ROWS).map((e) => ({
      claim: e.claim,
      provenance: e.provenance,
      confidence: e.confidence,
      sources: e.source_paths,
    })),
  };

  const provider = await selectProvider();
  emit("progress", `Reviewing with ${provider.name}…`, { progress: 0.4 });
  const result = await provider.chat({
    tier: "synthesis",
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 3000,
    temperature: 0.2,
    signal: opts.signal,
    messages: [
      {
        role: "user",
        content: `Review this marketing brain for the failure modes in your instructions. Brain follows.\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
      },
    ],
  });

  const { findings, summary } = parseReviewerReply(result.text);
  const counts = summarizeFindings(findings);
  emit(
    "log",
    `Review: ${findings.length} finding(s) — ${counts.high_severity} high, ${counts.medium_severity} medium, ${counts.low_severity} low.`,
  );

  const reviewSummary: BrainReviewSummary = {
    generated_at: new Date().toISOString(),
    ...(opts.jobId ? { job_id: opts.jobId } : {}),
    ...(result.model ? { model: result.model } : {}),
    verdict: counts.verdict,
    high_severity: counts.high_severity,
    medium_severity: counts.medium_severity,
    low_severity: counts.low_severity,
    findings,
    summary: summary || verdictBlurb(counts.verdict, counts.high_severity),
  };

  emit("progress", "Writing the review…", { progress: 0.85 });
  const { relativePath, executionResult } = await writeArtifact(
    clientSlug,
    manifest,
    {
      dir: "audits",
      type: "brain-review",
      frontmatterType: "audit",
      title: `Brain Review — ${manifest.site_under_audit}`,
      body: renderReport(reviewSummary, notes.length, ledger.length),
      tags: ["audit", "brain-review", "verification", `verdict:${counts.verdict}`],
      confidence:
        counts.verdict === "needs_attention"
          ? "low"
          : counts.verdict === "minor_issues"
            ? "medium"
            : "high",
      risk: counts.high_severity > 0 ? "high" : "low",
      costUsd: result.costUsd ?? 0,
    },
    {
      facts: [
        `Brain Review ran on ${manifest.site_under_audit}: ${counts.high_severity} high, ${counts.medium_severity} medium, ${counts.low_severity} low-severity finding(s).`,
      ],
      threadTitle: "Brain Review",
      threadRationale:
        counts.high_severity > 0
          ? "resolve high-severity review findings before trusting the brain"
          : "review the brain's verification findings",
      statusNote:
        counts.high_severity > 0
          ? `Brain Review flagged ${counts.high_severity} high-severity issue(s) — see the report.`
          : "Brain Review passed with no high-severity findings.",
    },
  );

  // The markdown report is now on disk; record its path in the stable JSON
  // summary the readiness evaluator keys on.
  reviewSummary.report_path = relativePath;
  await writeBrainReview(clientSlug, reviewSummary);

  return { summary: reviewSummary, reportPath: relativePath, executionResult };
}

function verdictBlurb(verdict: BrainReviewSummary["verdict"], high: number): string {
  if (verdict === "needs_attention") {
    return `The brain has ${high} high-severity issue(s) that should be resolved before it is trusted for client work.`;
  }
  if (verdict === "minor_issues") {
    return "The brain is broadly sound with a few minor issues worth tightening.";
  }
  return "The brain passed the semantic review with no actionable issues found.";
}

function renderReport(
  review: BrainReviewSummary,
  notesReviewed: number,
  evidenceRows: number,
): string {
  const lines: string[] = [
    "## Verdict",
    "",
    `**${review.verdict.replace(/_/g, " ")}** — ${review.summary}`,
    "",
    `Reviewed ${notesReviewed} canonical note(s) and ${evidenceRows} evidence claim(s). ` +
      `Findings: ${review.high_severity} high, ${review.medium_severity} medium, ${review.low_severity} low.`,
    "",
    "## Findings",
    "",
  ];
  if (review.findings.length === 0) {
    lines.push("No semantic issues found. The brain's claims, sources, and cross-note consistency held up.");
  } else {
    const order = { high: 0, medium: 1, low: 2 } as const;
    const sorted = [...review.findings].sort(
      (a, b) => order[a.severity] - order[b.severity],
    );
    for (const f of sorted) {
      const where = f.note ? ` \`${f.note}\`` : "";
      lines.push(`- **${f.severity.toUpperCase()}** · ${f.category}${where} — ${f.message}`);
    }
  }
  lines.push(
    "",
    "## How to read this",
    "",
    "This is a semantic double-check, not a structural lint. It flags content problems a word-count or schema gate cannot see. High-severity findings downgrade the brain's readiness score; they do not block it — you decide what to fix.",
  );
  return lines.join("\n");
}

const InputSchema = z.object({}).passthrough();
type Input = z.infer<typeof InputSchema>;

const brainReviewer: Specialist<Input> = {
  id: "brain-reviewer",
  name: "Brain Reviewer",
  description:
    "Semantic double-check of the marketing brain: hunts hallucinations, unbacked claims, cross-note contradictions, shallow prose, and unjustified confidence. Flags, never blocks.",
  desk: "desk.brain-reviewer",
  inputSchema: InputSchema,
  async execute(ctx) {
    const { summary, reportPath, executionResult } = await runBrainReview(ctx.clientSlug, {
      jobId: ctx.jobId,
      signal: ctx.signal,
      emit: (kind, message, extra) => ctx.emit(kind, message, extra),
    });
    return {
      summary: `Brain Review: ${summary.verdict.replace(/_/g, " ")} — ${summary.high_severity} high, ${summary.medium_severity} medium, ${summary.low_severity} low finding(s).`,
      resultPath: reportPath,
      executionResult,
      data: {
        verdict: summary.verdict,
        high_severity: summary.high_severity,
        medium_severity: summary.medium_severity,
        low_severity: summary.low_severity,
      },
      evidence: [
        {
          claim: `Brain Review verdict: ${summary.verdict} (${summary.high_severity} high-severity finding(s)).`,
          provenance: "model_estimate",
          source_paths: [reportPath],
          confidence: "medium",
          cost_usd: 0,
        },
      ],
    };
  },
};

registerSpecialist(brainReviewer);

export default brainReviewer;
