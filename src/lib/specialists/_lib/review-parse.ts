/**
 * Pure parsing for the Brain Reviewer's LLM reply. Kept in its own leaf (no
 * provider / registry imports) so it is unit-testable in isolation and the
 * "never fabricate findings on a bad parse" guarantee can be pinned by tests.
 */
import {
  BrainReviewFindingZ,
  type BrainReviewFinding,
} from "@/lib/brain/brain-review";

/**
 * Tolerant parse of the model's reply into findings + a summary. Extracts the
 * first JSON object (fenced or bare), validates each finding against the
 * contract, and drops any that don't fit. A reply we can't parse yields zero
 * findings — a broken reviewer must never invent problems or trap the brain.
 */
export function parseReviewerReply(text: string): {
  findings: BrainReviewFinding[];
  summary: string;
} {
  const json = extractFirstJsonObject(text);
  if (!json) return { findings: [], summary: "" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { findings: [], summary: "" };
  }
  if (!parsed || typeof parsed !== "object") return { findings: [], summary: "" };
  const obj = parsed as { findings?: unknown; summary?: unknown };
  const rawFindings = Array.isArray(obj.findings) ? obj.findings : [];
  const findings: BrainReviewFinding[] = [];
  for (const raw of rawFindings) {
    const result = BrainReviewFindingZ.safeParse(raw);
    if (result.success) findings.push(result.data);
  }
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  return { findings, summary };
}

/** Find the first balanced top-level `{...}`, preferring a fenced block. */
export function extractFirstJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
  const haystack = fenced ? fenced[1] : text;
  const start = haystack.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < haystack.length; i++) {
    const ch = haystack[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return haystack.slice(start, i + 1);
    }
  }
  return null;
}
