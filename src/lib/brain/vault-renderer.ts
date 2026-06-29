/**
 * Template slot-filling engine. Port of marketing-brain's `_vault_renderer.py`.
 *
 * Walks a template tree, substitutes `{{placeholder}}` tokens in text files,
 * copies binary files verbatim, and writes everything to the target directory.
 *
 * Idempotence: on re-run, files that were modified on disk after the template
 * was rendered are NOT overwritten (we compare mtimes). `force: true` bypasses.
 */
import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { RAW_MANIFEST_RELATIVE } from "./paths";

/** Module-level placeholder regex. Shared between body and path substitution
 *  so a single edit touches both. Matches `{{ name }}` or `{{name}}` with any
 *  `[a-zA-Z0-9_.-]` slot name. */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Characters that would let a malicious slot value escape its directory or
 *  break filesystem layout. Stripped to `-` in path substitution. */
const PATH_UNSAFE_RE = /[/\\:*?"<>|]/g;

/** Files we'll never slot-fill (treat as binary / leave alone). */
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".pdf",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".zip",
  ".tar",
  ".gz",
  ".xlsx",
  ".db",
]);

/** Files where we'll slot-fill `{{placeholder}}` tokens. */
const TEXT_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".html",
  ".css",
  ".base",
  ".canvas",
]);

export interface RenderOptions {
  /** Slot-fill replacements for `{{token}}` tokens. */
  slots: Record<string, string>;
  /** Overwrite locally-modified files. Defaults to false. */
  force?: boolean;
}

export interface RenderResult {
  /** Files written this run (relative to `targetRoot`). */
  written: string[];
  /** Files we left alone because the local copy was newer than the template. */
  preserved: string[];
}

/**
 * Render a template tree into a target directory.
 *
 * @param sourceRoot  absolute path to the template root (e.g. vendored/marketing-brain/template-brain)
 * @param targetRoot  absolute path where the rendered tree should land
 * @param options     slot values + force flag
 */
export async function renderTemplate(
  sourceRoot: string,
  targetRoot: string,
  options: RenderOptions,
): Promise<RenderResult> {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`template not found: ${sourceRoot}`);
  }
  const written: string[] = [];
  const preserved: string[] = [];
  await fsp.mkdir(targetRoot, { recursive: true });
  await walkAndRender(sourceRoot, sourceRoot, targetRoot, options, {
    written,
    preserved,
  });
  return { written, preserved };
}

async function walkAndRender(
  templateRoot: string,
  currentDir: string,
  targetRoot: string,
  options: RenderOptions,
  result: { written: string[]; preserved: string[] },
): Promise<void> {
  const entries = await fsp.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(currentDir, entry.name);
    const relativeRaw = path.relative(templateRoot, source);
    // Substitute `{{tokens}}` in the rendered RELATIVE PATH so a template
    // file like `wiki/entities/{{client_name}}.md` lands at
    // `wiki/entities/Acme Outdoors.md` rather than keeping the literal token
    // in the filename. Canonical marketing-brain renderer behaviour — see
    // vendored/marketing-brain/scripts/_vault_renderer.py
    // (search for "CRITICAL: substitute {{placeholders}} in the filename").
    const relative = substitutePath(relativeRaw, options.slots);
    const destination = path.join(targetRoot, relative);

    if (entry.isDirectory()) {
      await fsp.mkdir(destination, { recursive: true });
      await walkAndRender(templateRoot, source, targetRoot, options, result);
      continue;
    }

    if (!entry.isFile()) continue;

    // Skip the template's `.raw/.manifest.json`. It contains `{{date}}`
    // (which IS slot-filled correctly) but it's about to be overwritten by
    // `writeInitialManifest()` with the live client metadata. Letting the
    // renderer write it first wastes a write; more importantly, on a
    // rescaffold it would clobber the user's accumulated `sources:` ledger
    // because the template's `sources` field is empty.
    if (relative === RAW_MANIFEST_RELATIVE) continue;

    // mtime-based preservation
    if (!options.force && fs.existsSync(destination)) {
      const [srcStat, dstStat] = await Promise.all([
        fsp.stat(source),
        fsp.stat(destination),
      ]);
      if (dstStat.mtimeMs > srcStat.mtimeMs) {
        result.preserved.push(relative);
        continue;
      }
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      await fsp.copyFile(source, destination);
      result.written.push(relative);
      continue;
    }

    if (TEXT_EXTENSIONS.has(ext) || ext === "") {
      const raw = await fsp.readFile(source, "utf8");
      const rendered = substituteSlots(raw, options.slots);
      await fsp.writeFile(destination, rendered, "utf8");
      result.written.push(relative);
      continue;
    }

    // unknown extension — copy verbatim
    await fsp.copyFile(source, destination);
    result.written.push(relative);
  }
}

/**
 * Substitute `{{token}}` placeholders. Unknown tokens are left unchanged
 * (we don't crash on them — marketing-brain uses some tokens that are filled
 * later by synthesizer agents).
 */
export function substituteSlots(
  text: string,
  slots: Record<string, string>,
): string {
  return text.replace(PLACEHOLDER_RE, (match, name) => {
    return Object.prototype.hasOwnProperty.call(slots, name)
      ? slots[name]
      : match;
  });
}

/**
 * Substitute `{{token}}` placeholders in a path segment, sanitising any
 * filesystem-unsafe characters in the substituted value to `-`. Unknown
 * tokens are left unchanged. Returns the substituted POSIX-style path.
 *
 * Why path-unsafe sanitisation matters: a slot value of `"a/b"` would let a
 * template filename like `{{client_name}}.md` resolve to a different
 * directory than the renderer expected. Stripping path separators keeps
 * every rendered file inside the intended folder.
 */
export function substitutePath(
  relPath: string,
  slots: Record<string, string>,
): string {
  return relPath.replace(PLACEHOLDER_RE, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(slots, name)) return match;
    return slots[name].replace(PATH_UNSAFE_RE, "-").trim();
  });
}
