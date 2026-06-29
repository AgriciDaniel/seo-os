/**
 * GET    /api/clients/[slug]                         → snapshot of one client
 * DELETE /api/clients/[slug]?confirm=1               → archive + purge client
 *
 * Deletion is destructive: it removes the on-disk vault directory AND every
 * row scoped to this client (notes / jobs / assignments / tasks all cascade
 * via FK ON DELETE). Before removing the vault, we copy it to
 * `.seo-office/backups/clients/<slug>-<timestamp>/`. The `?confirm=1` query
 * param is still required to make the intent explicit.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import {
  deleteClient,
  getClient,
} from "@/lib/brain/index-db";
import { dataRoot, vaultRoot } from "@/lib/brain/paths";
import { nextActionForWithRegistry } from "@/lib/orchestrator/next-action";
import { readManifest } from "@/lib/orchestrator/client-context";
import { readHot } from "@/lib/orchestrator/working-memory";
import { officeOperationalStatus } from "@/lib/office/operational-status";
import { sameOriginWriteAllowed } from "@/lib/http/same-origin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const client = getClient(slug);
  if (!client) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  const [manifest, hot, nextAction] = await Promise.all([
    readManifest(slug),
    readHot(slug),
    nextActionForWithRegistry(slug),
  ]);
  const operationalStatus = await officeOperationalStatus(slug, manifest);
  return NextResponse.json({ client, manifest, hot, nextAction, operationalStatus });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const allowed = sameOriginWriteAllowed(req);
  if (allowed !== true) return allowed;
  if (url.searchParams.get("confirm") !== "1") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "destructive — re-issue with ?confirm=1 to purge this client and its vault",
      },
      { status: 400 },
    );
  }

  const client = getClient(slug);
  if (!client) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const dir = vaultRoot(slug);
  let backupPath: string | null = null;
  if (fs.existsSync(dir)) {
    backupPath = await archiveVaultBeforeDelete(slug, dir);
  }

  // 1. Remove DB rows. The FK CASCADE on notes/jobs/assignments/tasks removes
  //    everything scoped to this slug atomically. The vault has already been
  //    archived above, so disk cleanup failure still leaves a recovery copy.
  deleteClient(slug);

  // 2. Wipe the vault directory. `force: true` ignores ENOENT; `recursive`
  //    descends into subdirs. We resolved this path through the trusted
  //    `vaultRoot()` helper, so there's no path-traversal risk.
  let removedVault = false;
  if (fs.existsSync(dir)) {
    await fsp.rm(dir, { recursive: true, force: true });
    removedVault = true;
  }

  return NextResponse.json({
    ok: true,
    slug,
    removed: { db: true, vault: removedVault, vaultPath: dir },
    backup: backupPath ? { path: backupPath } : null,
  });
}

async function archiveVaultBeforeDelete(slug: string, sourceDir: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = path.join(dataRoot(), "backups", "clients");
  const target = path.join(backupRoot, `${slug}-${stamp}`);
  await fsp.mkdir(backupRoot, { recursive: true });
  await fsp.cp(sourceDir, target, {
    recursive: true,
    errorOnExist: true,
    force: false,
    verbatimSymlinks: true,
  });
  return target;
}
