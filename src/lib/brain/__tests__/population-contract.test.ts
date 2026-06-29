import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CANONICAL_BRAIN_TARGETS,
  DataProvenanceZ,
  SpecialistEvidenceZ,
} from "@/lib/brain/population-contract.ts";

test("population contract names canonical Marketing Brain targets", () => {
  assert.ok(
    CANONICAL_BRAIN_TARGETS.includes(
      "wiki/keywords/Keyword Targets and Page Map.md",
    ),
  );
  assert.ok(
    CANONICAL_BRAIN_TARGETS.includes(
      "wiki/sources/Competitor Landscape Cache.md",
    ),
  );
  assert.ok(CANONICAL_BRAIN_TARGETS.includes("wiki/entities/Primary Competitors.md"));
  assert.ok(
    CANONICAL_BRAIN_TARGETS.includes("wiki/deliverables/ULTIMATE BEAST Plan.md"),
  );
});

test("data provenance is explicit", () => {
  assert.equal(DataProvenanceZ.parse("live_api"), "live_api");
  assert.throws(() => DataProvenanceZ.parse("guessed"));
});

test("evidence-backed claims require source paths", () => {
  assert.throws(() =>
    SpecialistEvidenceZ.parse({
      claim: "Keyword demand is strong.",
      provenance: "live_api",
      source_paths: [],
      confidence: "high",
    }),
  );
});
