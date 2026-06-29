/**
 * Tests for src/lib/brain/paths.ts.
 *
 * Covers:
 *  - `manifestPath()` is the canonical `.raw/.manifest.json` location.
 *  - `ensureManifestMigrated()` moves legacy `<vault>/.manifest.json` →
 *    `<vault>/.raw/.manifest.json` exactly once and is idempotent on
 *    repeat calls.
 *  - `RAW_MANIFEST_RELATIVE` matches the canonical posix path used by the
 *    renderer's skip-list.
 */
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "seo-office-paths-"));
  originalEnv = process.env.SEO_OFFICE_DATA_DIR;
  // Point dataRoot() at the tmp dir for every test in this file.
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
  // Each test gets a clean `vaults/` subtree.
  const vaults = path.join(tmpRoot, "vaults");
  if (fs.existsSync(vaults)) await fsp.rm(vaults, { recursive: true });
  await fsp.mkdir(vaults, { recursive: true });
});

test("manifestPath returns .raw/.manifest.json under the vault", async () => {
  const { manifestPath, RAW_MANIFEST_RELATIVE } = await import("../paths.ts");
  const got = manifestPath("acme");
  assert.equal(got.endsWith(`${path.sep}.raw${path.sep}.manifest.json`), true);
  assert.equal(RAW_MANIFEST_RELATIVE, ".raw/.manifest.json");
});

test("resolveVaultRelative rejects absolute and escaping paths", async () => {
  const { resolveVaultRelative, vaultRoot } = await import("../paths.ts");
  const root = path.resolve(vaultRoot("acme"));

  assert.equal(
    resolveVaultRelative("acme", "wiki/index.md"),
    path.join(root, "wiki", "index.md"),
  );
  assert.throws(
    () => resolveVaultRelative("acme", "../outside.md"),
    /escapes client root/,
  );
  assert.throws(
    () => resolveVaultRelative("acme", "/tmp/outside.md"),
    /absolute vault paths/,
  );
});

test("ensureManifestMigrated moves legacy manifest exactly once", async () => {
  const { manifestPath, ensureManifestMigrated, vaultRoot } = await import(
    "../paths.ts"
  );
  const slug = "legacy-vault";
  const vault = vaultRoot(slug);
  await fsp.mkdir(vault, { recursive: true });
  const legacy = path.join(vault, ".manifest.json");
  await fsp.writeFile(legacy, '{"a":1}\n', "utf8");

  // pre-state
  assert.equal(fs.existsSync(legacy), true);
  assert.equal(fs.existsSync(manifestPath(slug)), false);

  ensureManifestMigrated(slug);

  // post-state
  assert.equal(fs.existsSync(legacy), false);
  assert.equal(fs.existsSync(manifestPath(slug)), true);
  const moved = await fsp.readFile(manifestPath(slug), "utf8");
  assert.equal(moved, '{"a":1}\n');

  // idempotent: second call is a no-op.
  ensureManifestMigrated(slug);
  assert.equal(fs.existsSync(manifestPath(slug)), true);
});

test("ensureManifestMigrated is a no-op when nothing to migrate", async () => {
  const { ensureManifestMigrated, vaultRoot, manifestPath } = await import(
    "../paths.ts"
  );
  const slug = "fresh-vault";
  await fsp.mkdir(vaultRoot(slug), { recursive: true });
  // No legacy file, no canonical file. Must not throw.
  ensureManifestMigrated(slug);
  assert.equal(fs.existsSync(manifestPath(slug)), false);
});

test("ensureManifestMigrated leaves canonical alone when it already exists", async () => {
  const { ensureManifestMigrated, vaultRoot, manifestPath } = await import(
    "../paths.ts"
  );
  const slug = "already-migrated";
  const vault = vaultRoot(slug);
  await fsp.mkdir(path.join(vault, ".raw"), { recursive: true });
  await fsp.writeFile(manifestPath(slug), '{"canonical":true}\n', "utf8");
  // Even if a legacy file is also present, the canonical one wins.
  await fsp.writeFile(
    path.join(vault, ".manifest.json"),
    '{"legacy":true}\n',
    "utf8",
  );
  ensureManifestMigrated(slug);
  const got = await fsp.readFile(manifestPath(slug), "utf8");
  assert.equal(got, '{"canonical":true}\n');
});
