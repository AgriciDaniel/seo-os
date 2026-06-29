/**
 * Scaffold a new client vault from the marketing-brain template.
 *
 * Port of marketing-brain's `scripts/scaffold_vault.py`. Adapted for our paths:
 * the template lives at `vendored/marketing-brain/template-brain/` (relative to
 * the project root), client vaults land at `${dataRoot}/vaults/<slug>/`.
 */
import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { renderTemplate } from "./vault-renderer";
import { ensureManifestMigrated, manifestPath, vaultRoot } from "./paths";
import { rebuildOverview } from "./overview-render";
import { rebuildIndex } from "./index-render";
import { reindexClient } from "./index-db";
import { writeNote } from "./vault-fs";
import { writeVaultMetadataSourceNote } from "./source-note";
import { repairBrainReadinessDebt } from "./readiness-repair";
import { lintVault } from "@/lib/specialists/vault-linter";
import {
  ClientInputSchema,
  ClientSlug,
  type Frontmatter,
  type ClientInput,
  type ClientManifest,
  toClientSlug,
} from "./types";

const TEMPLATE_RELATIVE = path.join(
  "vendored",
  "marketing-brain",
  "template-brain",
);

const BUSINESS_TYPE_OVERLAY_RELATIVE = path.join(
  "vendored",
  "marketing-brain",
  "references",
  "business-types",
);

/** Path to the marketing-brain template root, resolved against project cwd. */
export function templateRoot(): string {
  return path.resolve(process.cwd(), TEMPLATE_RELATIVE);
}

export type ScaffoldInput = ClientInput;

export interface ScaffoldResult {
  slug: string;
  vaultPath: string;
  written: number;
  preserved: number;
  manifest: ClientManifest;
}

/**
 * Create a fresh client vault. Throws if the vault already exists; pass the
 * existing slug to `rescaffold()` if you want to refresh templates idempotently.
 */
export async function scaffoldClient(
  input: ScaffoldInput,
): Promise<ScaffoldResult> {
  const parsed = ClientInputSchema.parse(input);
  const slug = ClientSlug.parse(parsed.slug ?? toClientSlug(parsed.clientName));
  const dest = vaultRoot(slug);
  if (fs.existsSync(dest)) {
    throw new Error(
      `vault already exists for "${slug}" at ${dest} — use rescaffold() to refresh`,
    );
  }
  return doScaffold(slug, dest, parsed, { force: false });
}

/** Refresh templates over an existing vault. User-modified files are preserved. */
export async function rescaffoldClient(
  slug: string,
  input: Omit<ScaffoldInput, "slug">,
): Promise<ScaffoldResult> {
  const validSlug = ClientSlug.parse(slug);
  const parsed = ClientInputSchema.parse({ ...input, slug: validSlug });
  const dest = vaultRoot(validSlug);
  if (!fs.existsSync(dest)) {
    throw new Error(`no vault to rescaffold for "${validSlug}"`);
  }
  return doScaffold(validSlug, dest, parsed, {
    force: false,
  });
}

async function doScaffold(
  slug: string,
  dest: string,
  input: ScaffoldInput,
  { force }: { force: boolean },
): Promise<ScaffoldResult> {
  const today = new Date().toISOString().slice(0, 10);
  const slots = buildSlots(slug, input, today);
  await assertAllTemplateSlotsCovered(templateRoot(), slots);

  const result = await renderTemplate(templateRoot(), dest, {
    slots,
    force,
  });

  await applyBusinessTypeOverlay(slug, input.businessType, slots);

  const manifest = await writeInitialManifest(slug, input, slots);
  await writeVaultMetadataSourceNote(slug, manifest);

  // Phase-2: regenerate wiki/overview.md from the just-written manifest
  // so niche / site_brand / business_type are reflected immediately. The
  // template renderer earlier wrote a slot-filled placeholder copy; this
  // overwrites with the live manifest data.
  await rebuildOverview(slug, manifest);

  // The vendored marketing-brain template intentionally contains seed
  // unknowns, but the app linter reserves literal TODO/TBD/FILL IN tokens
  // for real readiness failures. Normalize those seed unknowns during
  // scaffold so a fresh client starts with a reviewable brain, not a wall
  // of placeholder-token errors.
  await repairBrainReadinessDebt(slug);

  // Phase-2 + "everything covered from first run": index the freshly
  // rendered template into SQLite, then regenerate wiki/index.md from
  // that index. Without this, a fresh vault ships the template's static
  // index.md (which lists notes that may or may not exist after slot
  // substitution) — the rebuild aligns it with what's actually on disk
  // from day zero, so the user never sees stale navigation.
  await reindexClient(slug);
  await rebuildIndex(slug);

  const lint = await lintVault(slug, { stage: "scaffold" });
  // Default 95. Override with SEO_OFFICE_SCAFFOLD_LINT_MIN=80 (etc.) when a
  // legitimate template edge case trips the gate during early-adopter rollout.
  const envMin = Number(process.env.SEO_OFFICE_SCAFFOLD_LINT_MIN);
  const minScore =
    Number.isFinite(envMin) && envMin >= 0 && envMin <= 100 ? envMin : 95;
  if (lint.counts.error > 0 || lint.score < minScore) {
    const head = lint.findings
      .slice(0, 6)
      .map((f) => `${f.severity} ${f.rule} ${f.file}: ${f.message}`)
      .join("; ");
    throw new Error(
      `scaffold failed vault health gate: score ${lint.score}/${minScore} (set SEO_OFFICE_SCAFFOLD_LINT_MIN to lower), ${lint.counts.error} errors, ${lint.counts.warn} warnings. ${head}`,
    );
  }

  return {
    slug,
    vaultPath: dest,
    written: result.written.length,
    preserved: result.preserved.length,
    manifest,
  };
}

/**
 * Build the full slot dictionary for vault rendering. Mirrors the canonical
 * Python `scaffold_vault.py` which provides 11 slots covering every
 * placeholder in the template tree.
 *
 * Aliases (`client`, `site`, `site_under_audit`, `today`, `business_type` ==
 * `site_type`) keep template authors free to choose the most readable token
 * without diverging the slot table.
 *
 * The setup UI/API is responsible for collecting every required value.
 * Scaffold should not invent "general" fallbacks — missing setup context
 * creates a weak brain even if the renderer can hide the placeholder.
 */
function buildSlots(
  slug: string,
  input: ScaffoldInput,
  today: string,
): Record<string, string> {
  return {
    client_slug: slug,
    client: slug,
    client_name: sanitizeClientName(input.clientName),
    site_url: input.siteUrl,
    site: input.siteUrl,
    site_under_audit: input.siteUrl,
    site_brand: input.siteBrand,
    site_type: input.businessType,
    business_type: input.businessType,
    niche: input.niche,
    owner: input.owner,
    date: today,
    today,
  };
}

/**
 * Clean a user-typed client name so it's safe for wikilink resolution.
 *
 * The name is substituted into `[[Open Questions for {{client_name}}]]`
 * and similar links across the template. Obsidian-style wikilink
 * resolvers strip a trailing `.md` from the target — so a name like
 * "claude-blog.md" produces a wikilink that resolves to "claude-blog"
 * while the actual file on disk is "Open Questions for claude-blog.md.md"
 * (the renderer appends .md to the rendered filename). The wikilink
 * becomes dead.
 *
 * Strip the common file-extension suffixes that no human means to type
 * as part of a company name. Also strip the wikilink delimiters
 * `[[` and `]]` if somehow pasted in.
 */
function sanitizeClientName(raw: string): string {
  let cleaned = raw.replace(/\[\[|\]\]/g, "");
  cleaned = cleaned.replace(/\.(md|markdown|mdx|txt)$/i, "");
  return cleaned.trim();
}

async function assertAllTemplateSlotsCovered(
  root: string,
  slots: Record<string, string>,
): Promise<void> {
  const missing = new Map<string, Set<string>>();
  const used = new Map<string, Set<string>>();
  await walkTemplate(root, root, async (absolute, relative) => {
    collectMissingSlots(relative, relative, slots, missing, used);
    const ext = path.extname(relative).toLowerCase();
    if (!TEXT_EXTENSIONS_FOR_SLOT_CHECK.has(ext) && ext !== "") return;
    const raw = await fsp.readFile(absolute, "utf8");
    collectMissingSlots(raw, relative, slots, missing, used);
  });

  const failures: string[] = [];
  if (missing.size > 0) {
    failures.push(
      ...Array.from(missing.entries())
        .slice(0, 12)
        .map(
          ([token, files]) =>
            `${token}: ${Array.from(files).slice(0, 4).join(", ")}`,
        ),
    );
  }
  const empty = Array.from(used.entries()).filter(
    ([token]) =>
      Object.prototype.hasOwnProperty.call(slots, token) &&
      !slotHasUsableValue(slots[token]),
  );
  if (empty.length > 0) {
    failures.push(
      ...empty
        .slice(0, 12)
        .map(
          ([token, files]) =>
            `${token}: empty value for ${Array.from(files).slice(0, 4).join(", ")}`,
        ),
    );
  }
  if (failures.length === 0) return;
  throw new Error(
    `marketing-brain template has placeholders without scaffold values: ${failures.join("; ")}`,
  );
}

const TEMPLATE_SLOT_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const TEXT_EXTENSIONS_FOR_SLOT_CHECK = new Set([
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

function collectMissingSlots(
  text: string,
  relative: string,
  slots: Record<string, string>,
  missing: Map<string, Set<string>>,
  used: Map<string, Set<string>>,
): void {
  TEMPLATE_SLOT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TEMPLATE_SLOT_RE.exec(text)) !== null) {
    const token = match[1];
    if (!used.has(token)) used.set(token, new Set());
    used.get(token)!.add(relative);
    if (Object.prototype.hasOwnProperty.call(slots, token)) continue;
    if (!missing.has(token)) missing.set(token, new Set());
    missing.get(token)!.add(relative);
  }
}

function slotHasUsableValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function walkTemplate(
  root: string,
  dir: string,
  visit: (absolute: string, relative: string) => Promise<void>,
): Promise<void> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (entry.isDirectory()) {
      await walkTemplate(root, absolute, visit);
    } else if (entry.isFile()) {
      await visit(absolute, relative);
    }
  }
}

async function applyBusinessTypeOverlay(
  slug: string,
  businessType: string,
  slots: Record<string, string>,
): Promise<void> {
  const overlaySource = path.resolve(
    process.cwd(),
    BUSINESS_TYPE_OVERLAY_RELATIVE,
    `${businessType}.md`,
  );
  if (!fs.existsSync(overlaySource)) return; // unknown vertical — silently skip
  const raw = await fsp.readFile(overlaySource, "utf8");
  const slotFilled = raw.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (match, name) =>
      Object.prototype.hasOwnProperty.call(slots, name) ? slots[name] : match,
  );
  // The vendored references/business-types/*.md files ship with only a
  // partial frontmatter set (no `brain_schema`, sometimes no `status`).
  // When rendered into the vault those holes cause Zod validation to
  // reject the note and the indexer to drop it. Inject the missing
  // required fields here so the rendered overlay is always valid.
  const rendered = ensureRequiredFrontmatter(slotFilled, slots);
  const parsed = matter(rendered);
  await writeNote(slug, "wiki/concepts/Business Type Overlay.md", {
    frontmatter: parsed.data as Frontmatter,
    body: parsed.content,
  });
}

/**
 * Patch a markdown string's frontmatter to ensure the marketing-brain
 * required fields (`brain_schema`, `status`) are present. Idempotent:
 * leaves existing values alone, only adds what's missing.
 */
function ensureRequiredFrontmatter(
  raw: string,
  slots: Record<string, string>,
): string {
  const today = slots.date;
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    // No frontmatter at all — synthesise a minimal block.
    return `---\nbrain_schema: marketing-brain.v1\nowner: "${slots.owner}"\nconfidence: seed\napproval_status: needs-review\nrollback_note: "Review source evidence before implementation."\nrisk_level: medium\nbusiness_type: ${slots.business_type}\ntype: business-type-overlay\ntitle: "Business Type Overlay"\ncreated: ${today}\nupdated: ${today}\ntags: []\nstatus: active\n---\n\n${raw}`;
  }
  const fmBlock = match[1];
  const additions: string[] = [];
  if (!/^brain_schema:/m.test(fmBlock)) {
    additions.push("brain_schema: marketing-brain.v1");
  }
  if (!/^status:/m.test(fmBlock)) {
    additions.push("status: active");
  }
  if (!/^owner:/m.test(fmBlock)) {
    additions.push(`owner: "${slots.owner}"`);
  }
  if (!/^confidence:/m.test(fmBlock)) {
    additions.push("confidence: seed");
  }
  if (!/^approval_status:/m.test(fmBlock)) {
    additions.push("approval_status: needs-review");
  }
  if (!/^rollback_note:/m.test(fmBlock) && !/^rollback:/m.test(fmBlock)) {
    additions.push('rollback_note: "Review source evidence before implementation."');
  }
  if (!/^risk_level:/m.test(fmBlock)) {
    additions.push("risk_level: medium");
  }
  if (!/^business_type:/m.test(fmBlock)) {
    additions.push(`business_type: ${slots.business_type}`);
  }
  if (additions.length === 0) return raw;
  const newFm = `${fmBlock}\n${additions.join("\n")}`;
  return raw.replace(match[0], `---\n${newFm}\n---\n`);
}

async function writeInitialManifest(
  slug: string,
  input: ScaffoldInput,
  slots: Record<string, string>,
): Promise<ClientManifest> {
  // Rescaffold over a legacy vault: migrate the manifest first so we don't
  // accidentally orphan the legacy `<vault>/.manifest.json` next to the
  // canonical one we're about to write.
  ensureManifestMigrated(slug);
  const manifest: ClientManifest = {
    schema_version: "1.0",
    vault: `${input.clientName} marketing-brain`,
    site_under_audit: input.siteUrl,
    manifest_owner: input.owner,
    last_updated: new Date().toISOString().slice(0, 10),
    sources: {},
    niche: slots.niche,
    site_brand: slots.site_brand,
    business_type: input.businessType,
    author_byline: input.authorByline,
    monetization_model: input.monetizationModel,
    target_persona: input.targetPersona,
    primary_competitors: input.primaryCompetitors,
    measurement_access: input.measurementAccess,
    ...(input.locale ? { locale: input.locale } : {}),
    ...(input.githubUrl ? { github_url: input.githubUrl } : {}),
    // Phase-4.1 — pin the marketing-brain template version this vault
    // was scaffolded against, so a future schema migration knows where
    // to start the ladder from.
    marketing_brain_version: "0.1.5",
  };
  const target = manifestPath(slug);
  // The canonical path lives inside `.raw/`. The renderer skips the
  // template's `.raw/.manifest.json` (so its literal `{{date}}` doesn't
  // clobber us) but the directory itself still needs to exist.
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}
