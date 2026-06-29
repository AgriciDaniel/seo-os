/**
 * `.manifest.json` reader / writer — canonical client metadata + source ledger.
 *
 * Every time we pull data from an external source (DataForSEO, GSC, Bing),
 * we record it here with a hash, retrieval timestamp, and cost so the user
 * has a complete audit trail of where every claim came from.
 */
import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { withFileMutex } from "@/lib/brain/file-mutex";
import { ensureManifestMigrated, manifestPath, RAW_MANIFEST_RELATIVE } from "@/lib/brain/paths";
import { ClientManifest, type ManifestSource } from "@/lib/brain/types";
import { writeRaw } from "@/lib/brain/vault-fs";

export async function readManifest(
  clientSlug: string,
): Promise<ClientManifest | null> {
  // Legacy vaults stored .manifest.json at the vault root; canonical is
  // .raw/.manifest.json. Idempotent — no-op once the move has happened.
  ensureManifestMigrated(clientSlug);
  const p = manifestPath(clientSlug);
  if (!fs.existsSync(p)) return null;
  const raw = await fsp.readFile(p, "utf8");
  return ClientManifest.parse(JSON.parse(raw));
}

export async function writeManifest(
  clientSlug: string,
  manifest: ClientManifest,
): Promise<void> {
  return withFileMutex(clientSlug, RAW_MANIFEST_RELATIVE, () =>
    writeManifestUnlocked(clientSlug, manifest),
  );
}

async function writeManifestUnlocked(
  clientSlug: string,
  manifest: ClientManifest,
): Promise<void> {
  ClientManifest.parse(manifest);
  ensureManifestMigrated(clientSlug);
  const p = manifestPath(clientSlug);
  // The canonical location lives inside `.raw/`. Create it if the vault was
  // scaffolded before this directory was guaranteed.
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await writeRaw(clientSlug, RAW_MANIFEST_RELATIVE, JSON.stringify(manifest, null, 2) + "\n");
}

/**
 * Record a fetched source (file we wrote to disk) in the manifest with its
 * hash + cost. Mutates the manifest in place on disk.
 */
export async function recordSource(
  clientSlug: string,
  name: string,
  source: Omit<ManifestSource, "hash"> & { hash?: string },
): Promise<void> {
  return withFileMutex(clientSlug, RAW_MANIFEST_RELATIVE, async () => {
    const manifest = await readManifest(clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${clientSlug}"`);
    const hash = source.hash ?? (await hashFile(source.path));
    manifest.sources[name] = {
      path: source.path,
      hash,
      retrieved_at: source.retrieved_at,
      cost_usd: source.cost_usd,
    };
    manifest.last_updated = new Date().toISOString().slice(0, 10);
    await writeManifestUnlocked(clientSlug, manifest);
  });
}

async function hashFile(absolutePath: string): Promise<string> {
  if (!fs.existsSync(absolutePath)) return "";
  const data = await fsp.readFile(absolutePath);
  return createHash("sha256").update(data).digest("hex");
}
