/**
 * The actual loader hook. See `test-resolve-hook.mjs` for context.
 *
 * `resolve()` is called for every import. We rewrite specifiers in two
 * cases (mapping `@/foo` → `src/foo`, appending `.ts`/`.tsx` for files
 * that exist) and delegate everything else to the default resolver.
 *
 * `nextResolve` calls back into Node's chain — never throws on the happy
 * path; we let Node surface the canonical errors when a path genuinely
 * doesn't exist.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = path.join(REPO_ROOT, "src");

const TS_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

export async function resolve(specifier, context, nextResolve) {
  let next = specifier;

  // 1. Path alias: @/foo/bar → <repo>/src/foo/bar (no extension).
  if (next.startsWith("@/")) {
    next = pathToFileURL(path.join(SRC_ROOT, next.slice(2))).href;
  }

  // 2. Relative or absolute file that may be missing its `.ts`/`.tsx`
  //    extension. Try `<spec>.ts`, then `<spec>.tsx`, then bare. If the
  //    spec already has an extension, leave it alone — that path is the
  //    user's intent.
  const looksLikeFile =
    next.startsWith("./") ||
    next.startsWith("../") ||
    next.startsWith("file://") ||
    next.startsWith("/");
  if (looksLikeFile) {
    const candidate = next.startsWith("file://") ? fileURLToPath(next) : next;
    const absolute = path.isAbsolute(candidate)
      ? candidate
      : path.resolve(path.dirname(fileURLToPath(context.parentURL ?? pathToFileURL(REPO_ROOT).href)), candidate);
    const hasKnownExt = TS_EXTENSIONS.some((ext) => absolute.endsWith(ext)) ||
      path.extname(absolute) !== "";
    if (!hasKnownExt) {
      for (const ext of TS_EXTENSIONS) {
        const tryPath = absolute + ext;
        if (fs.existsSync(tryPath)) {
          next = pathToFileURL(tryPath).href;
          break;
        }
      }
    }
  }

  return nextResolve(next, context);
}
