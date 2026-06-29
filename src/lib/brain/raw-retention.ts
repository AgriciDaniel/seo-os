import "server-only";

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { vaultRoot } from "@/lib/brain/paths";

export interface RawRetentionResult {
  removedFiles: string[];
  removedDirs: string[];
}

export async function purgeRawCache(
  clientSlug: string,
  options: { retentionDays?: number; now?: Date } = {},
): Promise<RawRetentionResult> {
  const retentionDays = options.retentionDays ?? 30;
  const now = options.now ?? new Date();
  const rawRoot = path.join(vaultRoot(clientSlug), ".raw");
  const result: RawRetentionResult = { removedFiles: [], removedDirs: [] };
  if (!fs.existsSync(rawRoot)) return result;

  const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  await walkAndRemoveOldFiles(rawRoot, rawRoot, cutoffMs, result);
  await removeEmptyDirs(rawRoot, rawRoot, result);
  return result;
}

async function walkAndRemoveOldFiles(
  rawRoot: string,
  dir: string,
  cutoffMs: number,
  result: RawRetentionResult,
): Promise<void> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkAndRemoveOldFiles(rawRoot, abs, cutoffMs, result);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = toRawRelative(rawRoot, abs);
    if (rel === ".manifest.json") continue;
    const stat = await fsp.stat(abs);
    if (stat.mtimeMs >= cutoffMs) continue;
    await fsp.rm(abs, { force: true });
    result.removedFiles.push(`.raw/${rel}`);
  }
}

async function removeEmptyDirs(
  rawRoot: string,
  dir: string,
  result: RawRetentionResult,
): Promise<boolean> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    await removeEmptyDirs(rawRoot, path.join(dir, entry.name), result);
  }

  if (dir === rawRoot) return false;
  const remaining = await fsp.readdir(dir);
  if (remaining.length > 0) return false;
  await fsp.rmdir(dir);
  result.removedDirs.push(`.raw/${toRawRelative(rawRoot, dir)}`);
  return true;
}

function toRawRelative(rawRoot: string, abs: string): string {
  return path.relative(rawRoot, abs).split(path.sep).join("/");
}
