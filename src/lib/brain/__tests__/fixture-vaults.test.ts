import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cloneFixtureToTmp,
  FIXTURE_NAMES,
  loadFixture,
  type FixtureName,
} from "../../../../tests/helpers/makeFixture.ts";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "fixture-vaults-"));
  originalEnv = process.env.SEO_OFFICE_DATA_DIR;
  process.env.SEO_OFFICE_DATA_DIR = tmpRoot;
});

after(async () => {
  const { closeDb } = await import("../index-db.ts");
  closeDb();
  if (originalEnv !== undefined) {
    process.env.SEO_OFFICE_DATA_DIR = originalEnv;
  } else {
    delete process.env.SEO_OFFICE_DATA_DIR;
  }
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

test("R21 fixture vaults exist with required vault roots", async () => {
  for (const name of FIXTURE_NAMES) {
    const fixture = loadFixture(name);
    for (const rel of [
      "CODEX.md",
      "README.md",
      "shipping-rules.md",
      "wiki/hot.md",
      "wiki/index.md",
      "wiki/overview.md",
      "wiki/log.md",
      "wiki/meta/Start Here.md",
      ".raw/.manifest.json",
    ]) {
      assert.equal(
        fs.existsSync(path.join(fixture.root, rel)),
        true,
        `${name} missing ${rel}`,
      );
    }
  }
});

test("R21 helper clones fixtures without mutating the source snapshot", async () => {
  const fixture = loadFixture("clean-scaffolded");
  const original = await fsp.readFile(path.join(fixture.wiki, "hot.md"), "utf8");
  const cloneRoot = cloneFixtureToTmp("clean-scaffolded", {
    tmpRoot,
    slug: "clone-target",
  });
  await fsp.appendFile(path.join(cloneRoot, "wiki", "hot.md"), "\nmutated clone\n");
  const after = await fsp.readFile(path.join(fixture.wiki, "hot.md"), "utf8");
  assert.equal(after, original);
});

test("R21 linter fixtures encode the expected health states", async () => {
  const { lintVault } = await import("@/lib/specialists/vault-linter.ts");

  const expected: Record<FixtureName, { clean?: boolean; rules?: string[] }> = {
    "clean-scaffolded": { clean: true },
    "clean-post-sweep": { clean: true },
    "partial-placeholders": { rules: ["unresolved-placeholder-body"] },
    "dead-wikilinks": { rules: ["dead-wikilink"] },
    "missing-source-note": { rules: ["dead-source-wikilink"] },
    "degraded-keywords": { clean: true },
    "expired-artifacts": { clean: true },
    "partial-sweep-failure": { clean: true },
  };

  for (const name of FIXTURE_NAMES) {
    cloneFixtureToTmp(name, { tmpRoot, slug: name });
    const report = await lintVault(name);
    const assertion = expected[name];
    if (assertion.clean !== undefined) {
      assert.equal(
        report.clean,
        assertion.clean,
        `${name} expected clean=${assertion.clean}: ${JSON.stringify(
          report.findings,
          null,
          2,
        )}`,
      );
    }
    for (const rule of assertion.rules ?? []) {
      assert.equal(
        report.findings.some((finding) => finding.rule === rule),
        true,
        `${name} missing lint rule ${rule}: ${JSON.stringify(report.findings, null, 2)}`,
      );
    }
  }
});

test("R21 semantic fixtures expose degraded, expired, and partial-sweep markers", async () => {
  const degraded = loadFixture("degraded-keywords");
  const degradedKeyword = await fsp.readFile(
    path.join(degraded.wiki, "keywords", "2026-05-18-keyword-strategy.md"),
    "utf8",
  );
  assert.match(degradedKeyword, /confidence: low/);
  assert.match(degradedKeyword, /data_sources: \[model_estimate\]/);

  const expired = loadFixture("expired-artifacts");
  const expiredAudit = await fsp.readFile(
    path.join(expired.wiki, "audits", "2024-01-01-technical-audit.md"),
    "utf8",
  );
  assert.match(expiredAudit, /expires_on: 2024-01-01/);

  const partial = loadFixture("partial-sweep-failure");
  const partialReview = await fsp.readFile(
    path.join(partial.wiki, "reviews", "2026-05-18-partial-brain.md"),
    "utf8",
  );
  assert.match(partialReview, /readiness:partial_brain/);
  assert.match(partialReview, /approval_status: needs-review/);
});

test("R21 remaining scaffoldClient test usage is intentional coverage", async () => {
  const allowed: Record<string, { count: number; reason: string }> = {
    "src/lib/brain/__tests__/backfill-canonical.test.ts": {
      count: 1,
      reason: "canonical backfill needs production scaffolded canonical notes before writing dated artifacts",
    },
    "src/lib/brain/__tests__/evidence-ledger.test.ts": {
      count: 1,
      reason: "evidence ledger appends against a production-created client row and vault root",
    },
    "src/lib/brain/__tests__/scaffold-smoke.test.ts": {
      count: 3,
      reason: "primary production scaffold validator and post-condition smoke coverage",
    },
    "src/lib/orchestrator/__tests__/assignment-hot.test.ts": {
      count: 2,
      reason: "assignment mirroring exercises production client/vault lifecycle around queued jobs",
    },
    "src/lib/orchestrator/__tests__/build-brain-template.test.ts": {
      count: 2,
      reason: "dispatch and sweep read-model tests need production client rows/manifests",
    },
    "src/lib/orchestrator/__tests__/completion.test.ts": {
      count: 1,
      reason: "Secretary freshness gate needs a production client row to insert jobs/notes against",
    },
    "src/lib/orchestrator/__tests__/cost-preflight.test.ts": {
      count: 1,
      reason: "cost preflight dispatch coverage needs a production client row/manifest",
    },
    "src/lib/orchestrator/__tests__/specialist-context.test.ts": {
      count: 1,
      reason: "job queue context contract needs a production client row/manifest",
    },
    "src/lib/orchestrator/__tests__/specialist-result.test.ts": {
      count: 1,
      reason: "job queue result-envelope persistence needs a production client row/manifest",
    },
    "src/lib/specialists/__tests__/phase-gate.test.ts": {
      count: 2,
      reason: "direct phase-gate specialist execution needs production manifest/vault state",
    },
  };

  const discovered = new Map<string, number>();
  for (const file of listTestFiles(path.join(process.cwd(), "src", "lib"))) {
    const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
    if (rel === "src/lib/brain/__tests__/fixture-vaults.test.ts") continue;
    const lines = (await fsp.readFile(file, "utf8")).split("\n");
    const count = lines.filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.includes("scaffoldClient(") &&
        !trimmed.startsWith("*") &&
        !trimmed.startsWith("//")
      );
    }).length;
    if (count > 0) discovered.set(rel, count);
  }

  assert.deepEqual(
    [...discovered.entries()].sort(),
    Object.entries(allowed)
      .map(([file, meta]) => [file, meta.count] as [string, number])
      .sort(),
    `Unreviewed scaffoldClient() use in tests. Allowed reasons:\n${Object.entries(
      allowed,
    )
      .map(([file, meta]) => `- ${file}: ${meta.reason}`)
      .join("\n")}`,
  );
});

function listTestFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}
