/**
 * GET /api/brain/note-data?slug=<client>&path=<wiki-relative json path>
 *
 * Reads a structured `.data.json` sidecar emitted by an upgraded
 * specialist. Returns `{ ok, data }` with `Content-Type: application/json`.
 *
 * Path safety: `path` must be relative to the client's vault root and
 * must resolve inside it. Only `.json` files are served from this
 * endpoint — the HTML report counterpart lives at
 * `/api/clients/[slug]/reports/[...path]`.
 */
import { NextRequest, NextResponse } from "next/server";
import fsp from "node:fs/promises";
import path from "node:path";

import { getClient } from "@/lib/brain/index-db";
import { vaultRoot } from "@/lib/brain/paths";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const relative = url.searchParams.get("path");
  if (!slug || !relative) {
    return NextResponse.json(
      { ok: false, error: "missing slug or path" },
      { status: 400 },
    );
  }
  if (!getClient(slug)) {
    return NextResponse.json(
      { ok: false, error: "client not found" },
      { status: 404 },
    );
  }
  if (!relative.endsWith(".json")) {
    return NextResponse.json(
      { ok: false, error: "only .json sidecars are served here" },
      { status: 400 },
    );
  }

  const root = path.resolve(vaultRoot(slug));
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(root + path.sep)) {
    return NextResponse.json(
      { ok: false, error: "path escapes vault" },
      { status: 400 },
    );
  }

  let raw: string;
  try {
    raw = await fsp.readFile(target, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json(
        { ok: false, error: "sidecar not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "read failed" },
      { status: 500 },
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 422 },
    );
  }

  return NextResponse.json(
    { ok: true, path: relative, data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
