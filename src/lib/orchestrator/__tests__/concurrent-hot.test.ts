/**
 * Concurrency test for `writeHot()` — Phase 1.4.
 *
 * The pre-Phase-1 design had a subtle race: callers pre-merged hot.md
 * content OUTSIDE the mutex, so two parallel specialists both read the
 * same baseline and the second writer silently dropped the first
 * writer's facts. Phase 1.4 moves the read-merge inside the mutex.
 *
 * This test fires two parallel `writeHot` calls and asserts that both
 * specialists' `newFacts` survive the merge — proving the RMW is now
 * race-free.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "orchestrator-hot-"));
  originalEnv = process.env.SEO_OFFICE_DATA_DIR;
  process.env.SEO_OFFICE_DATA_DIR = tmpRoot;
});

after(async () => {
  if (originalEnv !== undefined) {
    process.env.SEO_OFFICE_DATA_DIR = originalEnv;
  } else {
    delete process.env.SEO_OFFICE_DATA_DIR;
  }
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  const vaults = path.join(tmpRoot, "vaults");
  if (fs.existsSync(vaults)) await fsp.rm(vaults, { recursive: true });
  await fsp.mkdir(vaults, { recursive: true });
});

test("writeHot: two parallel updates both contribute their facts to the merged file", async () => {
  const { writeHot, readHot } = await import("../working-memory.ts");
  const slug = "race-vault";
  await fsp.mkdir(path.join(tmpRoot, "vaults", slug, "wiki"), {
    recursive: true,
  });

  // Two parallel updates. With the pre-Phase-1 design caller B's read
  // sees no facts (the file doesn't exist yet) → its writer overwrites
  // A's freshly written facts. With Phase-1's in-mutex merge, B's read
  // sees A's contribution and prepends its own.
  await Promise.all([
    writeHot(slug, {
      lastUpdated: "2026-05-13",
      newFacts: ["fact-from-specialist-A"],
      newChange: "specialist A change",
      newThread: {
        title: "thread-A",
        rationale: "A reason",
        target: "wiki/audits/thread-a.md",
      },
      statusNote: "A status",
    }),
    writeHot(slug, {
      lastUpdated: "2026-05-13",
      newFacts: ["fact-from-specialist-B"],
      newChange: "specialist B change",
      newThread: { title: "thread-B", rationale: "B reason" },
      statusNote: "B status",
    }),
  ]);

  const hot = await readHot(slug);
  assert.ok(hot, "expected hot.md to be populated");
  const factTexts = hot.keyRecentFacts;
  assert.equal(
    factTexts.includes("fact-from-specialist-A"),
    true,
    `expected A's fact to survive — got: ${JSON.stringify(factTexts)}`,
  );
  assert.equal(
    factTexts.includes("fact-from-specialist-B"),
    true,
    `expected B's fact to survive — got: ${JSON.stringify(factTexts)}`,
  );
  // Both threads should also have landed.
  const threadTitles = hot.activeThreads.map((t) => t.title);
  assert.equal(threadTitles.includes("thread-A"), true);
  assert.equal(threadTitles.includes("thread-B"), true);
  assert.equal(
    hot.activeThreads.some(
      (t) => t.title === "thread-A" && t.target === "audits/thread-a",
    ),
    true,
  );
});
