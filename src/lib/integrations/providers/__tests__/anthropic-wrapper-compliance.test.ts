import { test } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";

const ALLOWED_SDK_CALLSITE = path.join(
  "src",
  "lib",
  "integrations",
  "providers",
  "anthropic-api.ts",
);

test("Anthropic SDK usage stays behind the instrumented provider wrapper", async () => {
  const offenders: string[] = [];
  for (const file of await listSourceFiles(path.join(process.cwd(), "src"))) {
    const rel = path.relative(process.cwd(), file);
    if (rel === ALLOWED_SDK_CALLSITE) continue;
    if (rel.includes(`${path.sep}__tests__${path.sep}`)) continue;
    const text = await fsp.readFile(file, "utf8");
    if (
      /from\s+["']@anthropic-ai\/sdk["']/.test(text) ||
      /\bnew\s+Anthropic\b/.test(text) ||
      /\.messages\.create\s*\(/.test(text)
    ) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, []);
});

async function listSourceFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out.sort();
}
