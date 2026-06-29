import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReviewerReply } from "@/lib/specialists/_lib/review-parse.ts";

test("parses a clean fenced JSON reply with valid findings", () => {
  const reply = [
    "Here is my review:",
    "```json",
    JSON.stringify({
      summary: "Two issues found.",
      findings: [
        { severity: "high", category: "hallucination", note: "wiki/entities/Primary Competitors.md", message: "Competitor 'Acme Quantum' is unrelated to the niche." },
        { severity: "medium", category: "shallow", message: "Overview is generic boilerplate." },
      ],
    }),
    "```",
  ].join("\n");
  const { findings, summary } = parseReviewerReply(reply);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].severity, "high");
  assert.equal(findings[0].category, "hallucination");
  assert.equal(summary, "Two issues found.");
});

test("parses a bare JSON object with no fence and surrounding prose", () => {
  const reply = `I reviewed it. {"summary":"All good","findings":[]} Done.`;
  const { findings, summary } = parseReviewerReply(reply);
  assert.equal(findings.length, 0);
  assert.equal(summary, "All good");
});

test("drops findings that violate the contract, keeps valid ones", () => {
  const reply = JSON.stringify({
    summary: "Mixed.",
    findings: [
      { severity: "high", category: "evidence", message: "Unbacked claim about traffic." },
      { severity: "critical", category: "evidence", message: "bad severity" }, // invalid enum
      { category: "evidence", message: "missing severity" }, // missing field
      { severity: "low", category: "other", message: "" }, // empty message
    ],
  });
  const { findings } = parseReviewerReply(reply);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].message, "Unbacked claim about traffic.");
});

test("returns empty when the reply has no parseable JSON object", () => {
  const { findings, summary } = parseReviewerReply("The brain looks fine to me, no JSON here.");
  assert.equal(findings.length, 0);
  assert.equal(summary, "");
});

test("returns empty (never fabricates) on malformed JSON", () => {
  const { findings } = parseReviewerReply("```json\n{ findings: [ broken,, ] }\n```");
  assert.equal(findings.length, 0);
});
