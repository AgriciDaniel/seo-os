import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "sweep-lock-test-"));
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

test("sweep lock permits only one active sweep per client and template", async () => {
  const {
    acquireSweepLock,
    getSweepLock,
    releaseSweepLock,
    upsertClient,
  } = await import("../index-db.ts");

  upsertClient({
    slug: "acme",
    name: "Acme",
    site_url: "https://example.com",
    owner: "tester",
  });

  const first = acquireSweepLock("acme", "build-brain", "token-1");
  assert.equal(first.acquired, true);
  assert.equal(first.lock.holder_pid, process.pid);
  assert.equal(first.lock.acquired_at, first.lock.created_at);

  const second = acquireSweepLock("acme", "build-brain", "token-2");
  assert.equal(second.acquired, false);
  assert.equal(second.lock.token, "token-1");
  assert.equal(second.lock.holder_pid, process.pid);

  releaseSweepLock("acme", "build-brain", "wrong-token");
  assert.equal(getSweepLock("acme", "build-brain")?.token, "token-1");

  releaseSweepLock("acme", "build-brain", "token-1");
  const third = acquireSweepLock("acme", "build-brain", "token-3");
  assert.equal(third.acquired, true);
});

test("expired sweep locks are ignored on the next acquire", async () => {
  const { acquireSweepLock, upsertClient } = await import("../index-db.ts");

  upsertClient({
    slug: "beta",
    name: "Beta",
    site_url: "https://beta.example.com",
    owner: "tester",
  });

  const expired = acquireSweepLock("beta", "build-brain", "old", -1);
  assert.equal(expired.acquired, true);

  const fresh = acquireSweepLock("beta", "build-brain", "new");
  assert.equal(fresh.acquired, true);
  assert.equal(fresh.lock.token, "new");
  assert.equal(fresh.lock.holder_pid, process.pid);
});
