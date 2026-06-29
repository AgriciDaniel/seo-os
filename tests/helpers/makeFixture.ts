import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const FIXTURE_NAMES = [
  "clean-scaffolded",
  "clean-post-sweep",
  "partial-placeholders",
  "dead-wikilinks",
  "missing-source-note",
  "degraded-keywords",
  "expired-artifacts",
  "partial-sweep-failure",
] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];

export interface VaultDir {
  name: FixtureName;
  root: string;
  wiki: string;
  manifest: string;
}

export function loadFixture(name: FixtureName): VaultDir {
  const root = path.join(process.cwd(), "tests", "fixtures", "vaults", name);
  if (!fs.existsSync(root)) {
    throw new Error(`fixture vault not found: ${name}`);
  }
  return {
    name,
    root,
    wiki: path.join(root, "wiki"),
    manifest: path.join(root, ".raw", ".manifest.json"),
  };
}

export function cloneFixtureToTmp(
  name: FixtureName,
  options: { tmpRoot?: string; slug?: string } = {},
): string {
  const fixture = loadFixture(name);
  const tmpRoot =
    options.tmpRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), "seo-office-fixture-"));
  const slug = options.slug ?? name;
  const dest = path.join(tmpRoot, "vaults", slug);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(fixture.root, dest, { recursive: true });
  return dest;
}
