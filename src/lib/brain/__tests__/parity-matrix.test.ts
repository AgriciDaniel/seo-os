import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKETING_BRAIN_REQUIRED_ARTIFACTS,
  SEO_DOMAIN_COVERAGE,
  SOURCE_CRITICAL_AREAS,
} from "@/lib/brain/parity-contract.ts";
import { BUILD_BRAIN_SWEEP } from "@/lib/orchestrator/task-templates.ts";
import { SPECIALISTS } from "@/lib/specialists/catalog.ts";

test("Marketing Brain parity contract includes required generated artifacts", () => {
  assert.ok(MARKETING_BRAIN_REQUIRED_ARTIFACTS.includes("keyword_workbook"));
  assert.ok(MARKETING_BRAIN_REQUIRED_ARTIFACTS.includes("competitor_landscape"));
  assert.ok(
    MARKETING_BRAIN_REQUIRED_ARTIFACTS.includes("competitor_keyword_summary"),
  );
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
    assert.ok(
      SEO_DOMAIN_COVERAGE.some((entry) => entry.domain === domain),
      domain,
    );
  }
});

test("source-critical areas have runnable Deep Brain coverage or explicit deferral", () => {
  const readySpecialists = new Set(
    SPECIALISTS.filter((entry) => entry.status === "ready").map((entry) => entry.id),
  );
  const sweepSpecialists = new Set(
    BUILD_BRAIN_SWEEP.children.map((child) => child.specialist_id),
  );

  for (const area of SOURCE_CRITICAL_AREAS) {
    assert.ok(
      area.specialistIds.length > 0 || "deferredReason" in area,
      `${area.area} must name runnable specialists or a deferred reason`,
    );
    for (const id of area.specialistIds) {
      assert.ok(readySpecialists.has(id), `${area.area} specialist is not ready: ${id}`);
    }
    assert.ok(
      area.specialistIds.some((id) => sweepSpecialists.has(id)) ||
        "deferredReason" in area,
      `${area.area} is not covered by the Deep Brain sweep`,
    );
  }
});
