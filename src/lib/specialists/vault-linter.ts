/**
 * Vault Linter — programmatic health check for a client vault.
 *
 * Faithful TS port of `vendored/marketing-brain/scripts/lint_vault.py`
 * plus three SEO-Office-specific rules (Zod `Frontmatter` validation,
 * filename placeholders, legacy `.manifest.json` location).
 *
 * Two entry points:
 *
 *  - `lintVault(slug)` — pure function returning a structured report.
 *    Used by the linter API route and by tests.
 *
 *  - The registered specialist (default export, side-effect register) —
 *    callable from the orchestrator. Writes `wiki/deliverables/Vault Lint
 *    Report.md` with the human-readable summary.
 *
 * The linter exists because the Phase 0 schema fidelity bugs (overview
 * type, slot path-substitution, manifest location, missing slot tokens)
 * would have surfaced immediately if a lint pass ran during scaffold or
 * dev. Without it, drift becomes invisible.
 */
import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import matter from "gray-matter";
import {
  registerSpecialist,
  type Specialist,
} from "@/lib/orchestrator/registry";
import { readManifest } from "@/lib/orchestrator/client-context";
import { RAW_MANIFEST_RELATIVE, vaultRoot } from "@/lib/brain/paths";
import { Frontmatter } from "@/lib/brain/types";
import { writeArtifact } from "./_lib/artifact";

/* -------------------------------------------------------------------------- */
/* types                                                                      */
/* -------------------------------------------------------------------------- */

export type LintSeverity = "error" | "warn" | "info";

export interface LintFinding {
  severity: LintSeverity;
  rule: string;
  /** Vault-relative path the finding is about. Empty string for vault-wide. */
  file: string;
  message: string;
}

export interface LintReport {
  vault: string;
  generatedAt: string;
  findings: LintFinding[];
  counts: Record<LintSeverity, number>;
  /** 0-100 health score. Errors are severe, warnings are repairable debt. */
  score: number;
  /** Convenience: `counts.error + counts.warn === 0`. */
  clean: boolean;
}

export interface LintOptions {
  /**
   * `scaffold` allows seeded onboarding gaps like TBD/open questions as
   * informational debt. `ready` is the production/readiness gate after
   * specialists have run, where placeholder prose means the brain is not
   * complete.
   */
  stage?: "scaffold" | "ready";
}

/* -------------------------------------------------------------------------- */
/* rule constants — match canonical Python                                    */
/* -------------------------------------------------------------------------- */

const REQUIRED_FILES = [
  "CODEX.md",
  "README.md",
  "shipping-rules.md",
  "wiki/hot.md",
  "wiki/index.md",
  "wiki/overview.md",
  "wiki/log.md",
  "wiki/meta/Start Here.md",
  RAW_MANIFEST_RELATIVE,
];

const REQUIRED_FRONTMATTER_KEYS = [
  "brain_schema",
  "type",
  "title",
  "created",
  "updated",
  "status",
  "owner",
  "confidence",
  "approval_status",
  "risk_level",
] as const;

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
const PENDING_TEXT_RE = /\b(TODO|TBD|FILL\s+IN|Lorem ipsum)\b/i;
const BANNED_VAULT_PATTERNS: Array<{
  id: string;
  pattern: RegExp;
  description: string;
}> = [
  {
    id: "developm-ent-slug-typo",
    pattern: /\b[a-z0-9][a-z0-9-]*developm-ent[a-z0-9-]*\b/i,
    description: "legacy split-word slug typo",
  },
];

/* -------------------------------------------------------------------------- */
/* public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Lint a single client vault. Pure: never throws, never writes to disk.
 * Returns a structured report a caller can pretty-print or persist.
 */
export async function lintVault(
  slug: string,
  options: LintOptions = {},
): Promise<LintReport> {
  const findings: LintFinding[] = [];
  const root = vaultRoot(slug);
  const generatedAt = new Date().toISOString();
  const stage = options.stage ?? "ready";

  if (!fs.existsSync(root)) {
    findings.push({
      severity: "error",
      rule: "vault-missing",
      file: "",
      message: `vault directory does not exist at ${root}`,
    });
    return finalize(slug, generatedAt, findings);
  }

  // 1. required-files
  for (const rel of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(root, rel))) {
      findings.push({
        severity: "error",
        rule: "required-files",
        file: rel,
        message: `missing required file: ${rel}`,
      });
    }
  }

  // 2. manifest-location — legacy `<vault>/.manifest.json` still present
  if (fs.existsSync(path.join(root, ".manifest.json"))) {
    findings.push({
      severity: "warn",
      rule: "manifest-location",
      file: ".manifest.json",
      message:
        "legacy <vault>/.manifest.json exists; canonical path is .raw/.manifest.json (will auto-migrate on next manifest read)",
    });
  }

  // 3. community Obsidian plugins must be disabled by default.
  const pluginFile = path.join(root, ".obsidian", "community-plugins.json");
  if (fs.existsSync(pluginFile)) {
    try {
      const raw = await fsp.readFile(pluginFile, "utf8");
      const plugins = JSON.parse(raw) as unknown;
      if (Array.isArray(plugins) && plugins.length > 0) {
        findings.push({
          severity: "warn",
          rule: "community-plugins",
          file: ".obsidian/community-plugins.json",
          message:
            "community Obsidian plugins are enabled by default; the marketing-brain template ships with none",
        });
      }
    } catch {
      findings.push({
        severity: "warn",
        rule: "community-plugins",
        file: ".obsidian/community-plugins.json",
        message: "invalid .obsidian/community-plugins.json (not parseable as JSON)",
      });
    }
  }

  // Walk vault for the file-level rules. Skip `.raw/` per canonical
  // semantics — raw sources are immutable and not subject to wiki linting.
  const files = await collectFiles(root);
  const notes = files.filter((f) => f.endsWith(".md"));

  // Build wikilink resolution indexes.
  const lowercaseFileSet = new Set(files.map((f) => f.toLowerCase()));
  const noteByStem = new Map<string, string[]>(); // stem.lower -> [rel]
  const noteByRelStem = new Map<string, string>(); // (path/without/ext).lower -> rel
  for (const rel of notes) {
    const stem = path.basename(rel, ".md").toLowerCase();
    if (!noteByStem.has(stem)) noteByStem.set(stem, []);
    noteByStem.get(stem)!.push(rel);

    const relStem = rel.slice(0, -3).toLowerCase().replace(/\\/g, "/");
    noteByRelStem.set(relStem, rel);
  }

  // 4. duplicate-stem
  for (const [stem, paths] of noteByStem) {
    if (stem === "_index") continue;
    const realDuplicates = paths.filter(
      (p) => !/^wiki\/specialists\/[^/]+\/hot\.md$/i.test(p),
    );
    if (realDuplicates.length <= 1) continue;
    if (paths.length > 1) {
      findings.push({
        severity: "warn",
        rule: "duplicate-stem",
        file: realDuplicates[0],
        message: `duplicate note stem "${stem}": ${realDuplicates.join(", ")}`,
      });
    }
  }

  // 5. per-note rules — frontmatter, placeholders, wikilinks
  for (const rel of notes) {
    // 5a. unresolved-placeholder-filename
    if (PLACEHOLDER_RE.test(rel)) {
      findings.push({
        severity: "error",
        rule: "unresolved-placeholder-filename",
        file: rel,
        message: `literal {{token}} survived into filename: ${rel}`,
      });
    }
    // .test() advances lastIndex on global regexes — reset before any
    // other use of PLACEHOLDER_RE in this iteration.
    PLACEHOLDER_RE.lastIndex = 0;

    let body: string;
    try {
      body = await fsp.readFile(path.join(root, rel), "utf8");
    } catch (err) {
      findings.push({
        severity: "error",
        rule: "file-read",
        file: rel,
        message: `cannot read ${rel}: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    // 5b. frontmatter rules (wiki/* only, mirroring canonical Python).
    const isWikiNote = rel.startsWith("wiki/") || rel.startsWith("wiki\\");
    let parsed: ReturnType<typeof matter>;
    try {
      parsed = matter(body);
    } catch (err) {
      findings.push({
        severity: "error",
        rule: "frontmatter-parse",
        file: rel,
        message: `unreadable frontmatter: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    if (isWikiNote) {
      const data = parsed.data as Record<string, unknown>;
      if (!data || Object.keys(data).length === 0) {
        findings.push({
          severity: "error",
          rule: "frontmatter-missing",
          file: rel,
          message: "missing frontmatter block",
        });
      } else {
        for (const key of REQUIRED_FRONTMATTER_KEYS) {
          if (!(key in data)) {
            findings.push({
              severity: "error",
              rule: "frontmatter-required",
              file: rel,
              message: `missing required frontmatter field "${key}"`,
            });
          }
        }
        if (!("rollback_note" in data) && !("rollback" in data)) {
          findings.push({
            severity: "error",
            rule: "frontmatter-required",
            file: rel,
            message: 'missing required frontmatter field "rollback_note" or "rollback"',
          });
        }
        // SEO-Office-specific: full Zod validation. Catches enum drift
        // (e.g., `type: overview` rejected pre-Commit-1) and bad shapes.
        const fm = Frontmatter.safeParse(data);
        if (!fm.success) {
          findings.push({
            severity: "error",
            rule: "frontmatter-valid",
            file: rel,
            message: zodSummary(fm.error),
          });
        }
        if (Array.isArray(data.sources)) {
          for (const source of data.sources) {
            if (typeof source !== "string" || !source.includes("[[")) continue;
            WIKILINK_RE.lastIndex = 0;
            let sourceLink: RegExpExecArray | null;
            while ((sourceLink = WIKILINK_RE.exec(source)) !== null) {
              const raw = sourceLink[1];
              const target = raw.split("|", 1)[0].split("#", 1)[0].trim();
              if (!target) continue;
              if (
                !resolvesWikilink(
                  target,
                  noteByStem,
                  noteByRelStem,
                  lowercaseFileSet,
                )
              ) {
                findings.push({
                  severity: "warn",
                  rule: "dead-source-wikilink",
                  file: rel,
                  message: `dead source wikilink: [[${raw}]]`,
                });
              }
            }
          }
        }
      }
    }

    // 5c. banned-pattern — configurable typo/pattern denylist.
    for (const banned of BANNED_VAULT_PATTERNS) {
      const pathMatch = rel.match(banned.pattern);
      if (pathMatch) {
        findings.push({
          severity: "error",
          rule: "banned-pattern",
          file: rel,
          message: `${banned.id} (${banned.description}) in path: ${pathMatch[0]}`,
        });
      }
      const bodyMatch = parsed.content.match(banned.pattern);
      if (bodyMatch) {
        findings.push({
          severity: "error",
          rule: "banned-pattern",
          file: rel,
          message: `${banned.id} (${banned.description}) in body: ${bodyMatch[0]}`,
        });
      }
    }

    // 5d. unresolved-placeholder-body
    const unresolved: string[] = [];
    let m: RegExpExecArray | null;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((m = PLACEHOLDER_RE.exec(parsed.content)) !== null) {
      unresolved.push(m[1]);
    }
    if (unresolved.length > 0) {
      const unique = Array.from(new Set(unresolved)).slice(0, 6);
      findings.push({
        severity: "error",
        rule: "unresolved-placeholder-body",
        file: rel,
        message: `literal {{token}} in body: ${unique.join(", ")}${unresolved.length > unique.length ? " …" : ""}`,
      });
    }

    if (isWikiNote && PENDING_TEXT_RE.test(parsed.content)) {
      findings.push({
        severity: stage === "ready" ? "error" : "info",
        rule: "pending-placeholder-text",
        file: rel,
        message:
          stage === "ready"
            ? "body still contains TODO/TBD/FILL IN placeholder prose"
            : "seed placeholder prose remains for later specialist/onboarding completion",
      });
    }

    // 5e. dead-wikilink
    WIKILINK_RE.lastIndex = 0;
    let link: RegExpExecArray | null;
    while ((link = WIKILINK_RE.exec(parsed.content)) !== null) {
      const raw = link[1];
      const target = raw.split("|", 1)[0].split("#", 1)[0].trim();
      if (!target) continue;
      if (!resolvesWikilink(target, noteByStem, noteByRelStem, lowercaseFileSet)) {
        findings.push({
          severity: "warn",
          rule: "dead-wikilink",
          file: rel,
          message: `dead wikilink: [[${raw}]]`,
        });
      }
    }
  }

  return finalize(slug, generatedAt, findings);
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

function finalize(
  vault: string,
  generatedAt: string,
  findings: LintFinding[],
): LintReport {
  const counts: Record<LintSeverity, number> = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  const score = Math.max(0, 100 - counts.error * 20 - counts.warn * 5);
  return {
    vault,
    generatedAt,
    findings,
    counts,
    score,
    clean: counts.error + counts.warn === 0,
  };
}

/** Best-effort error summary that fits on one line. */
function zodSummary(err: z.ZodError): string {
  const head = err.issues.slice(0, 3).map((issue) => {
    const at = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `${at}: ${issue.message}`;
  });
  const tail = err.issues.length > 3 ? ` (+${err.issues.length - 3} more)` : "";
  return `frontmatter failed Zod validation — ${head.join("; ")}${tail}`;
}

/**
 * Resolve a wikilink target against the vault. Mirrors canonical Python:
 *  - case-insensitive
 *  - `.md` suffix is optional
 *  - paths with `/` try both bare and `wiki/`-prefixed candidates
 *  - bare names match by stem
 */
function resolvesWikilink(
  target: string,
  noteByStem: Map<string, string[]>,
  noteByRelStem: Map<string, string>,
  fileSet: Set<string>,
): boolean {
  let normalized = target.toLowerCase();
  if (normalized.endsWith(".md")) normalized = normalized.slice(0, -3);

  if (normalized.includes("/")) {
    const candidates = [normalized];
    if (normalized.startsWith("wiki/")) candidates.push(normalized.slice(5));
    else candidates.push(`wiki/${normalized}`);
    for (const c of candidates) {
      if (noteByRelStem.has(c)) return true;
      if (fileSet.has(`${c}.md`)) return true;
      if (fileSet.has(c)) return true;
    }
    return false;
  }

  if (noteByStem.has(normalized)) return true;
  // Allow links to non-`.md` files (e.g., `.canvas`, `.base`) by exact
  // basename match against the file set.
  for (const f of fileSet) {
    if (path.basename(f) === `${normalized}.md`) return true;
    if (path.basename(f) === normalized) return true;
  }
  return false;
}

/**
 * Walk the vault and return every file, vault-relative (posix-style),
 * skipping `.raw/`. Match canonical semantics: raw sources are immutable
 * and not subject to wiki linting.
 */
async function collectFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  await walk(root, root, out);
  return out.sort();
}

async function walk(
  root: string,
  dir: string,
  out: string[],
): Promise<void> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".raw") continue;
    if (entry.name === ".git") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, abs, out);
    } else if (entry.isFile()) {
      out.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  }
}

/* -------------------------------------------------------------------------- */
/* specialist registration                                                    */
/* -------------------------------------------------------------------------- */

const InputSchema = z.object({});
type Input = z.infer<typeof InputSchema>;

const vaultLinter: Specialist<Input> = {
  id: "vault-linter",
  name: "Vault Linter",
  description:
    "Audits a client vault for schema drift, dead wikilinks, unresolved placeholders, manifest location, and duplicate stems.",
  desk: "desk.vault-linter",
  inputSchema: InputSchema,
  async execute(ctx) {
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) {
      throw new Error(`no manifest for client "${ctx.clientSlug}"`);
    }

    ctx.emit("progress", "Walking vault…", { progress: 0.1 });
    const report = await lintVault(ctx.clientSlug);

    ctx.emit(
      "log",
      `${report.findings.length} findings (${report.counts.error} error, ${report.counts.warn} warn, ${report.counts.info} info)`,
    );

    ctx.emit("progress", "Writing lint report…", { progress: 0.8 });
    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "deliverables",
        type: "vault-lint",
        frontmatterType: "deliverable",
        title: `Vault Lint Report — ${manifest.vault.replace(/ marketing-brain$/, "")}`,
        body: renderLintMarkdown(report),
        tags: ["deliverable", "vault-lint", "claude-generated"],
        risk: report.counts.error > 0 ? "medium" : "low",
        confidence: report.clean ? "high" : "medium",
        url: manifest.site_under_audit,
        reportSubtitle: `${report.counts.error} errors · ${report.counts.warn} warnings`,
      },
      {
        facts: [
          `Vault lint: ${report.counts.error} error${report.counts.error === 1 ? "" : "s"}, ${report.counts.warn} warning${report.counts.warn === 1 ? "" : "s"}.`,
        ],
        threadTitle: report.clean ? "Vault lint clean" : "Vault lint findings",
        threadRationale: report.clean
          ? "no schema drift detected — keep linting on a cadence"
          : "review findings below; rescaffold or hand-edit affected files",
        statusNote: report.clean
          ? "Vault passed linter checks."
          : `Vault linter found ${report.counts.error} errors and ${report.counts.warn} warnings. See the latest vault-lint deliverable.`,
      },
    );

    return {
      summary: report.clean
        ? "Vault lint clean — no findings"
        : `Vault lint: ${report.counts.error} errors, ${report.counts.warn} warnings`,
      resultPath: relativePath,
      executionResult,
      data: report,
    };
  },
};

registerSpecialist(vaultLinter);
export default vaultLinter;

/** Render a `LintReport` to markdown for the deliverable note body. */
function renderLintMarkdown(report: LintReport): string {
  const lines: string[] = [];
  lines.push(
    `**Generated:** ${report.generatedAt.slice(0, 10)}`,
    "",
    `**Status:** ${report.clean ? "clean" : "findings"} — score ${report.score}/100; ${report.counts.error} errors, ${report.counts.warn} warnings, ${report.counts.info} info`,
    "",
  );

  if (report.findings.length === 0) {
    lines.push(
      "No findings. The vault passes every linter rule. Run again after any structural change (rescaffold, manual file additions, schema bump).",
    );
    return lines.join("\n");
  }

  for (const severity of ["error", "warn", "info"] as const) {
    const bucket = report.findings.filter((f) => f.severity === severity);
    if (bucket.length === 0) continue;
    lines.push(`## ${severity.toUpperCase()} (${bucket.length})`);
    lines.push("");
    for (const f of bucket) {
      const location = f.file ? `\`${f.file}\` ` : "";
      lines.push(`- **${f.rule}** ${location}— ${f.message}`);
    }
    lines.push("");
  }

  lines.push(
    "## Next steps",
    "",
    "- For `frontmatter-valid` failures, edit the note's YAML to match `src/lib/brain/types.ts::Frontmatter`.",
    "- For `dead-wikilink` warnings, either fix the link target or create the missing note.",
    "- For `unresolved-placeholder-*` errors, run `rescaffoldClient(slug, …)` with the right slot values — the renderer now substitutes `{{tokens}}` in both file contents and filenames.",
    "- For `manifest-location` warnings, hit any manifest-read API once — the migration helper auto-moves the file.",
  );

  return lines.join("\n");
}
