/**
 * Filesystem layer for the brain.
 *
 * Reads/writes markdown notes with YAML frontmatter via gray-matter.
 * Never touches anything outside the vault root for a given client.
 *
 * All I/O is server-only — these helpers must not end up in client bundles.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { BrainNoteSchema, type Note } from "./types";
import { resolveVaultRelative, vaultRoot } from "./paths";
import { withFileMutex } from "./file-mutex";
import { migrateFrontmatter } from "./migrations";

/* -------------------------------------------------------------------------- */
/* read                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Read a single note. Returns null if the file is missing.
 * Throws if the file exists but the frontmatter is unparseable / invalid.
 */
export async function readNote(
  clientSlug: string,
  relativePath: string,
): Promise<Note | null> {
  const absolute = resolveVaultRelative(clientSlug, relativePath);
  let raw: string;
  try {
    raw = await fsp.readFile(absolute, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const parsed = matter(raw);
  // Phase-4.1: walk the migration ladder before Zod validation so notes
  // written under an older schema parse correctly. No-op when the ladder
  // is empty (v1 head); future schema bumps land here.
  const migrated = migrateFrontmatter(
    parsed.data as Record<string, unknown>,
  );
  return BrainNoteSchema.parse({
    path: relativePath,
    frontmatter: migrated,
    body: parsed.content,
  });
}

/**
 * Read a note's raw body without validating frontmatter. Useful for templates
 * and `_templates/` files where the frontmatter contains `{{placeholder}}`
 * tokens that wouldn't parse.
 */
export async function readRaw(
  clientSlug: string,
  relativePath: string,
): Promise<string | null> {
  const absolute = resolveVaultRelative(clientSlug, relativePath);
  try {
    return await fsp.readFile(absolute, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* write                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Write a note to disk, creating parent directories as needed.
 * Frontmatter is validated; body is written verbatim.
 *
 * Atomic on crash: writes go to `<file>.tmp.<pid>` first and only rename
 * over the target once the bytes are durably on disk. A SIGKILL halfway
 * through can leave a .tmp file behind but never a half-written note —
 * critical for hot.md which other code paths reindex from frontmatter.
 */
export async function writeNote(
  clientSlug: string,
  relativePath: string,
  note: Omit<Note, "path">,
): Promise<void> {
  BrainNoteSchema.parse({
    path: relativePath,
    frontmatter: note.frontmatter,
    body: note.body,
  }); // throws if invalid
  const absolute = resolveVaultRelative(clientSlug, relativePath);
  await fsp.mkdir(path.dirname(absolute), { recursive: true });
  const serialised = matter.stringify(note.body, note.frontmatter);
  await atomicWriteFile(absolute, serialised);
}

/**
 * Write raw text (no frontmatter validation). Use for templates, JSON, etc.
 * Atomic like `writeNote()` — temp file + rename.
 */
export async function writeRaw(
  clientSlug: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const absolute = resolveVaultRelative(clientSlug, relativePath);
  await fsp.mkdir(path.dirname(absolute), { recursive: true });
  await atomicWriteFile(absolute, content);
}

/**
 * Write a file atomically: temp file with the same parent dir, then rename
 * over the target. The rename is atomic on POSIX (same filesystem) — readers
 * either see the old contents or the new, never a truncated half-write.
 */
async function atomicWriteFile(absolute: string, content: string): Promise<void> {
  const dir = path.dirname(absolute);
  const tmp = path.join(
    dir,
    `.${path.basename(absolute)}.tmp.${process.pid}.${randomUUID()}`,
  );
  try {
    await fsp.writeFile(tmp, content, { encoding: "utf8", flag: "wx" });
    await fsp.rename(tmp, absolute);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

/**
 * Append a section to a markdown file (creates if missing).
 * Used by log.md — newest entries at the TOP per marketing-brain convention.
 *
 * Atomicity: the final write goes through `atomicWriteFile` (temp + rename)
 * so a kill mid-write can never leave a torn file. The earlier
 * implementation called `fsp.writeFile` directly, which truncated the
 * target before writing — under SIGKILL that exposed an empty `log.md`
 * to the next reader. Callers that perform read-modify-write must still
 * serialise themselves (see `withFileMutex` in
 * `src/lib/orchestrator/file-mutex.ts`) to avoid lost-update races.
 */
export async function prependToNote(
  clientSlug: string,
  relativePath: string,
  section: string,
): Promise<void> {
  // Hold the per-(client, path) lock across the read AND the write so a
  // parallel prepend can't read the same baseline and clobber us.
  return withFileMutex(clientSlug, relativePath, async () => {
    const absolute = resolveVaultRelative(clientSlug, relativePath);
    const existing = (await readRaw(clientSlug, relativePath)) ?? "";
    // split frontmatter from body so we insert at the top of the body, not
    // the top of the file (which would corrupt the frontmatter)
    const parsed = matter(existing || "---\n---\n");
    const newBody = `${section.trimEnd()}\n\n${parsed.content.trimStart()}`;
    await fsp.mkdir(path.dirname(absolute), { recursive: true });
    await atomicWriteFile(absolute, matter.stringify(newBody, parsed.data));
  });
}

/* -------------------------------------------------------------------------- */
/* enumerate                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * List every `.md` file in a client's vault, returning relative paths.
 * Skips dotdirs (`.obsidian/`, `.raw/`) and `_attachments/`.
 */
export async function listNotes(clientSlug: string): Promise<string[]> {
  const root = vaultRoot(clientSlug);
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  await walk(root, root, out);
  return out.sort();
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "_attachments") continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, absolute, out);
    } else if (entry.name.endsWith(".md")) {
      out.push(path.relative(root, absolute));
    }
  }
}

/* -------------------------------------------------------------------------- */
/* existence checks                                                            */
/* -------------------------------------------------------------------------- */

export function vaultExists(clientSlug: string): boolean {
  return fs.existsSync(vaultRoot(clientSlug));
}

export async function fileExists(
  clientSlug: string,
  relativePath: string,
): Promise<boolean> {
  try {
    await fsp.access(resolveVaultRelative(clientSlug, relativePath));
    return true;
  } catch {
    return false;
  }
}
