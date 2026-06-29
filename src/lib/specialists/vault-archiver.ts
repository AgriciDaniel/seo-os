/**
 * Vault Archiver — Phase 4.2 safety net.
 *
 * Snapshots the entire client vault to `.seo-office/archives/<slug>-<ts>.tar.gz`
 * (or a plain folder copy if `tar` isn't on PATH). Provides a one-button
 * rollback target before any destructive action — rescaffolds, mass
 * prunes, schema migrations.
 *
 * The deliverable note records the archive path so future runs can find
 * the most recent snapshot via the SQLite mirror.
 *
 * Cross-platform: `tar` ships on every Unix and on Windows 10+. If
 * spawning fails the archiver falls back to a directory copy, which is
 * still a valid snapshot — just not packaged.
 */
import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  registerSpecialist,
  type Specialist,
} from "@/lib/orchestrator/registry";
import { readManifest } from "@/lib/orchestrator/client-context";
import { dataRoot, vaultRoot } from "@/lib/brain/paths";
import { writeArtifact } from "./_lib/artifact";

const InputSchema = z.object({
  /** Optional human-readable label appended to the archive filename. */
  label: z.string().min(1).max(60).optional(),
});
type Input = z.infer<typeof InputSchema>;

const archivesDir = () => path.join(dataRoot(), "archives");

interface ArchiveOutcome {
  archivePath: string;
  format: "tar.gz" | "copy";
}

const vaultArchiver: Specialist<Input> = {
  id: "vault-archiver",
  name: "Vault Archiver",
  description:
    "Snapshots the entire vault to .seo-office/archives/ before destructive operations. Use this immediately before rescaffolds, mass prunes, or schema migrations.",
  desk: "desk.vault-archiver",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) {
      throw new Error(`no manifest for client "${ctx.clientSlug}"`);
    }

    ctx.emit("progress", "Creating snapshot directory…", { progress: 0.1 });
    await fsp.mkdir(archivesDir(), { recursive: true });

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const labelSuffix = input.label ? `-${slug(input.label)}` : "";
    const baseName = `${ctx.clientSlug}-${timestamp}${labelSuffix}`;

    ctx.emit("progress", "Archiving vault…", { progress: 0.4 });
    const outcome = await archiveVault(ctx.clientSlug, baseName);

    ctx.emit(
      "log",
      `Snapshot written to ${outcome.archivePath} (${outcome.format})`,
    );

    ctx.emit("progress", "Writing deliverable…", { progress: 0.85 });
    const archivePathRelative = path.relative(
      process.cwd(),
      outcome.archivePath,
    );

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "deliverables",
        type: "vault-archive",
        frontmatterType: "deliverable",
        title: `Vault Snapshot — ${timestamp}${input.label ? ` · ${input.label}` : ""}`,
        body: [
          `Snapshot created **${timestamp}** before any destructive operation. Use it as a safe restore point.`,
          "",
          `**Archive location**: \`${archivePathRelative}\``,
          `**Format**: ${outcome.format === "tar.gz" ? "gzipped tarball" : "directory copy"}`,
          "",
          "## How to restore",
          "",
          outcome.format === "tar.gz"
            ? `\`\`\`bash\ncd .seo-office/vaults\nrm -rf ${ctx.clientSlug}\ntar -xzf ../archives/${baseName}.tar.gz\nmv ${baseName} ${ctx.clientSlug}\n\`\`\``
            : `\`\`\`bash\ncd .seo-office/vaults\nrm -rf ${ctx.clientSlug}\ncp -R ../archives/${baseName} ${ctx.clientSlug}\n\`\`\``,
        ].join("\n"),
        tags: ["deliverable", "vault-archive", "claude-generated"],
        risk: "low",
        confidence: "high",
        rollback: { kind: "delete-file", path: outcome.archivePath },
      },
      {
        facts: [
          `Vault snapshot saved at ${archivePathRelative}.`,
        ],
        threadTitle: "Vault snapshot taken",
        threadRationale:
          "safe restore point captured — review before any destructive operation",
        statusNote: `Snapshot at ${archivePathRelative}.`,
      },
    );

    return {
      summary: `Vault snapshot at ${archivePathRelative}`,
      resultPath: relativePath,
      executionResult,
      data: { archivePath: outcome.archivePath, format: outcome.format },
    };
  },
};

registerSpecialist(vaultArchiver);
export default vaultArchiver;

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function archiveVault(
  clientSlug: string,
  baseName: string,
): Promise<ArchiveOutcome> {
  const vaultDir = vaultRoot(clientSlug);
  if (!fs.existsSync(vaultDir)) {
    throw new Error(`vault directory missing: ${vaultDir}`);
  }
  const tarPath = path.join(archivesDir(), `${baseName}.tar.gz`);
  const tarOk = await tryTarGz(vaultDir, tarPath, baseName);
  if (tarOk) return { archivePath: tarPath, format: "tar.gz" };

  // Fallback: recursive directory copy. Always works, never throws.
  const copyDest = path.join(archivesDir(), baseName);
  await fsp.cp(vaultDir, copyDest, { recursive: true });
  return { archivePath: copyDest, format: "copy" };
}

/**
 * Spawn `tar -czf <out> -C <parent> <leaf>` and resolve to true on
 * success. Any failure (binary missing, exit non-zero) → false, and the
 * caller falls back to a copy.
 */
function tryTarGz(
  vaultDir: string,
  outPath: string,
  baseName: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const parent = path.dirname(vaultDir);
      const leaf = path.basename(vaultDir);
      const child = spawn(
        "tar",
        ["-czf", outPath, "-C", parent, "--transform", `s|^${leaf}|${baseName}|`, leaf],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", () => resolve(false));
      child.on("close", (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          // Some `tar` builds (macOS BSD tar) don't support `--transform`.
          // Retry without that flag — the archive ends up containing the
          // raw leaf name, which is still a valid snapshot.
          retryWithoutTransform(vaultDir, outPath).then(resolve);
          void stderr; // captured for debugging if we ever want to surface it
        }
      });
    } catch {
      resolve(false);
    }
  });
}

function retryWithoutTransform(
  vaultDir: string,
  outPath: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const parent = path.dirname(vaultDir);
      const leaf = path.basename(vaultDir);
      const child = spawn("tar", ["-czf", outPath, "-C", parent, leaf], {
        stdio: ["ignore", "ignore", "ignore"],
      });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
