/**
 * Concurrency tests for the brain's mutex-guarded writers.
 *
 * Covers Phase 1.1 (`prependToNote` atomicity) and 1.2 (per-path mutex).
 * The smoking-gun assertion: fire N parallel `prependToNote` calls and
 * verify every single prepend survives in the final file. Without the
 * mutex this race-loses entries; with it, the file contains all N
 * sections.
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
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "brain-concurrent-"));
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

test("prependToNote: 10 parallel prepends all survive (no lost updates)", async () => {
  const { prependToNote, writeRaw } = await import("../vault-fs.ts");
  const slug = "race-vault";
  await fsp.mkdir(path.join(tmpRoot, "vaults", slug, "wiki"), {
    recursive: true,
  });
  // Seed the file with a frontmatter block so the prepend has something
  // structurally valid to insert into.
  const initial = `---\nbrain_schema: marketing-brain.v1\ntype: meta\ntitle: Log\ncreated: 2026-05-13\nupdated: 2026-05-13\ntags: []\nstatus: active\n---\n\nbaseline body\n`;
  await writeRaw(slug, "wiki/log.md", initial);

  const N = 10;
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      prependToNote(slug, "wiki/log.md", `## entry-${i}\n\nbody ${i}`),
    ),
  );

  const final = await fsp.readFile(
    path.join(tmpRoot, "vaults", slug, "wiki", "log.md"),
    "utf8",
  );
  for (let i = 0; i < N; i++) {
    assert.equal(
      final.includes(`## entry-${i}`),
      true,
      `expected entry-${i} to survive parallel prepend`,
    );
    assert.equal(
      final.includes(`body ${i}`),
      true,
      `expected body-${i} to survive parallel prepend`,
    );
  }
  // The baseline body must still be present at the bottom.
  assert.equal(final.includes("baseline body"), true);
});

test("prependToNote: writes atomically (no half-files under concurrent reads)", async () => {
  // We can't easily SIGKILL Node mid-write inside a test, so this is a
  // structural check: assert that no `.tmp.*` files leak after a normal
  // run. The atomic rename should leave only the final file on disk.
  const { prependToNote, writeRaw } = await import("../vault-fs.ts");
  const slug = "atomic-vault";
  await fsp.mkdir(path.join(tmpRoot, "vaults", slug, "wiki"), {
    recursive: true,
  });
  await writeRaw(
    slug,
    "wiki/log.md",
    `---\nbrain_schema: marketing-brain.v1\ntype: meta\ntitle: Log\ncreated: 2026-05-13\nupdated: 2026-05-13\ntags: []\nstatus: active\n---\n\nseed\n`,
  );

  await prependToNote(slug, "wiki/log.md", "## prepended\n\nbody");

  const dirEntries = await fsp.readdir(
    path.join(tmpRoot, "vaults", slug, "wiki"),
  );
  const leftover = dirEntries.filter((e) => e.includes(".tmp."));
  assert.equal(
    leftover.length,
    0,
    `unexpected temp files remain: ${leftover.join(", ")}`,
  );
});

test("withFileMutex serialises overlapping critical sections", async () => {
  const { withFileMutex } = await import("../file-mutex.ts");
  const order: number[] = [];
  // Three contenders for the same (slug, path). Each holds the lock for
  // 25ms before releasing. Without the mutex they would interleave; with
  // it they finish in strict 1-2-3 order.
  const ops = [1, 2, 3].map((n) =>
    withFileMutex("acme", "wiki/log.md", async () => {
      order.push(n);
      await new Promise((r) => setTimeout(r, 25));
      order.push(-n);
    }),
  );
  await Promise.all(ops);
  // Expected: 1, -1, 2, -2, 3, -3 (or starting from whichever scheduler
  // race won; the key invariant is that each `-n` immediately follows its
  // matching `n`, never interleaved with another job).
  for (let i = 0; i < order.length; i += 2) {
    assert.equal(order[i], -order[i + 1], `critical section ${i / 2} was interleaved`);
  }
});

test("recordSource: parallel manifest updates all survive", async () => {
  const { writeManifest, recordSource, readManifest } = await import(
    "@/lib/orchestrator/client-context.ts"
  );
  const slug = "manifest-race";
  await fsp.mkdir(path.join(tmpRoot, "vaults", slug, ".raw"), { recursive: true });
  await writeManifest(slug, {
    schema_version: "1.0",
    vault: "Manifest Race marketing-brain",
    site_under_audit: "https://manifest-race.example.com",
    manifest_owner: "tester",
    last_updated: "2026-05-18",
    sources: {},
    measurement_access: [],
    primary_competitors: [],
  });

  const N = 12;
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      recordSource(slug, `source-${i}`, {
        path: path.join(tmpRoot, `source-${i}.json`),
        hash: `hash-${i}`,
        retrieved_at: "2026-05-18T00:00:00.000Z",
        cost_usd: i / 100,
      }),
    ),
  );

  const manifest = await readManifest(slug);
  assert.ok(manifest);
  assert.equal(Object.keys(manifest.sources).length, N);
  for (let i = 0; i < N; i++) {
    assert.equal(manifest.sources[`source-${i}`]?.hash, `hash-${i}`);
  }

  const rawDirEntries = await fsp.readdir(path.join(tmpRoot, "vaults", slug, ".raw"));
  const leftover = rawDirEntries.filter((e) => e.includes(".tmp."));
  assert.equal(
    leftover.length,
    0,
    `unexpected manifest temp files remain: ${leftover.join(", ")}`,
  );
});
