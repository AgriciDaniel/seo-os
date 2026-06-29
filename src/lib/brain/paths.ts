/**
 * Single source of truth for where the brain lives on disk.
 *
 * Override the root via SEO_OFFICE_DATA_DIR env var; defaults to ./.seo-office
 * resolved against the Next.js process cwd.
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * The canonical on-disk location for `.manifest.json` is `<vault>/.raw/.manifest.json`,
 * per the vendored marketing-brain template (`CODEX.md` line 91: "Update
 * `.raw/.manifest.json` whenever raw sources are added or refreshed.") and
 * the `.raw/.manifest.json` file shipped in `template-brain/`. The pre-fix
 * port wrote this to `<vault>/.manifest.json` (vault root); legacy vaults
 * on disk still have it there. `ensureManifestMigrated()` (below) handles
 * the one-time move.
 *
 * Kept as a posix-joined string because (a) it's used as a path-equality
 * check inside `vault-renderer.ts` during template walk, and (b) consumers
 * resolve against the vault root via `path.join`, which is platform-aware.
 */
export const RAW_MANIFEST_RELATIVE = path.posix.join(".raw", ".manifest.json");
const LEGACY_MANIFEST_RELATIVE = ".manifest.json";

export function dataRoot(): string {
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.SEO_OFFICE_DATA_DIR ?? ".seo-office",
  );
}

export function vaultsRoot(): string {
  return path.join(dataRoot(), "vaults");
}

export function vaultRoot(clientSlug: string): string {
  return path.join(vaultsRoot(), clientSlug);
}

export function resolveVaultRelative(
  clientSlug: string,
  relativePath: string,
): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`absolute vault paths are not allowed: ${relativePath}`);
  }
  const root = path.resolve(vaultRoot(clientSlug));
  const absolute = path.resolve(root, relativePath);
  const rel = path.relative(root, absolute);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`vault path escapes client root: ${relativePath}`);
  }
  return absolute;
}

export function indexDbPath(): string {
  return path.join(dataRoot(), "index.db");
}

export function cacheDir(): string {
  return path.join(dataRoot(), "cache");
}

/**
 * Absolute path to the canonical manifest location. Pure — never touches disk.
 * Callers that need to handle legacy `<vault>/.manifest.json` should invoke
 * `ensureManifestMigrated()` BEFORE reading.
 */
export function manifestPath(clientSlug: string): string {
  return path.join(vaultRoot(clientSlug), RAW_MANIFEST_RELATIVE);
}

/**
 * Absolute path to the legacy manifest location at the vault root. Internal —
 * only used by the migration helper.
 */
function legacyManifestPath(clientSlug: string): string {
  return path.join(vaultRoot(clientSlug), LEGACY_MANIFEST_RELATIVE);
}

/**
 * One-time migration from `<vault>/.manifest.json` (legacy) to
 * `<vault>/.raw/.manifest.json` (canonical).
 *
 * Idempotent and side-effect-free in the steady state — once a vault has
 * the new path, subsequent calls do nothing. `fs.renameSync` is atomic on
 * the same filesystem, so a concurrent reader either sees the old file
 * (returns its valid contents) or the new file (returns its valid contents),
 * never a half-moved state.
 *
 * Errors are swallowed: if the legacy file vanishes between exists-check
 * and rename (concurrent migration on another worker), we no-op. If the
 * `.raw/` dir can't be created (permissions), we leave the legacy file
 * alone — the next call will retry.
 */
export function ensureManifestMigrated(clientSlug: string): void {
  const canonical = manifestPath(clientSlug);
  if (fs.existsSync(canonical)) return;
  const legacy = legacyManifestPath(clientSlug);
  if (!fs.existsSync(legacy)) return;
  try {
    fs.mkdirSync(path.dirname(canonical), { recursive: true });
    fs.renameSync(legacy, canonical);
  } catch {
    /* concurrent move or permissions; non-fatal */
  }
}

export function wikiPath(clientSlug: string, relative = ""): string {
  return path.join(vaultRoot(clientSlug), "wiki", relative);
}

export function hotPath(clientSlug: string): string {
  return wikiPath(clientSlug, "hot.md");
}

export function logPath(clientSlug: string): string {
  return wikiPath(clientSlug, "log.md");
}

export function indexMdPath(clientSlug: string): string {
  return wikiPath(clientSlug, "index.md");
}

/**
 * Per-specialist hot file. Overwritten in place every time the Orchestrator
 * dispatches a new Assignment to this specialist (CLAUDE.md rule #4). Lives
 * inside `wiki/` so the SQLite reindex picks it up like any other note.
 */
export function specialistHotPath(clientSlug: string, specialistId: string): string {
  return wikiPath(clientSlug, `specialists/${specialistId}/hot.md`);
}

/** Same as above but returns the path relative to the vault root, suitable
 *  for the vault-fs helpers which all take a `relative` argument. */
export function specialistHotRelative(specialistId: string): string {
  return `wiki/specialists/${specialistId}/hot.md`;
}
