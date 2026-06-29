#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("usage: prepare-data-dir.mjs <SEO_OFFICE_E2E_DATA_DIR>");
  process.exit(2);
}

const target = path.resolve(input);
const cwd = path.resolve(process.cwd());
const home = path.resolve(os.homedir());
const repoData = path.resolve(cwd, ".seo-office");
const tmp = path.resolve(os.tmpdir());

function isSameOrInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

const unsafe =
  target === path.parse(target).root ||
  target === cwd ||
  target === home ||
  target === repoData ||
  isSameOrInside(target, repoData) ||
  (!isSameOrInside(target, tmp) && !target.includes(`${path.sep}seo-office-e2e`));

if (unsafe) {
  console.error(`Refusing to reset unsafe e2e data directory: ${target}`);
  process.exit(2);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
