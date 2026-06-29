import { test } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runMarketingBrainScriptSmoke } from "@/lib/marketing-brain/script-smoke.ts";

test("Marketing Brain script smoke exercises offline vendored script outputs", async () => {
  const dataRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "mb-script-smoke-test-"));
  try {
    const report = await runMarketingBrainScriptSmoke({
      dataRoot,
      keywordRows: 48,
      timeoutMs: 30_000,
    });

    assert.equal(report.ok, true);
    assert.equal(report.cleanedUp, false);
    assert.deepEqual(
      report.steps
        .filter((step) => step.id !== "fixtures")
        .map((step) => [step.id, step.status]),
      [
        ["build-keyword-xlsx", "passed"],
        ["capture-visual-references", "passed"],
        ["synthesize-beast-plan", "passed"],
        ["render-beast-pdf", "passed"],
      ],
    );

    assert.ok(report.outputs.keywordCsv);
    assert.ok(report.outputs.keywordXlsx);
    assert.ok(report.outputs.beastPlan);
    assert.ok(report.outputs.beastHtml);
    assert.ok(report.outputs.visualManifest);
    assert.ok(report.outputs.visualNote);

    const [csv, plan, html, visualManifest] = await Promise.all([
      fsp.readFile(report.outputs.keywordCsv, "utf8"),
      fsp.readFile(report.outputs.beastPlan, "utf8"),
      fsp.readFile(report.outputs.beastHtml, "utf8"),
      fsp.readFile(report.outputs.visualManifest, "utf8"),
    ]);

    assert.ok(csv.split(/\r?\n/).length > 40);
    assert.match(plan, /brain_schema: marketing-brain\.v1/);
    assert.match(plan, /## Executive Summary/);
    assert.match(html, /Marketing Brain Script Smoke/);
    assert.equal(JSON.parse(visualManifest).project_images[0].status, "copied");
  } finally {
    await fsp.rm(dataRoot, { recursive: true, force: true });
  }
});
