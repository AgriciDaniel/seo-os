/**
 * GET /api/clients/[slug]/sweeps/current
 *   → { ok, sweep | null }
 *
 * Read-side endpoint powering the SweepCard's 3s poll. Returns the most
 * recent sweep (running or terminal) with per-phase rollup. `null` when
 * the client has never run a sweep — the office falls back to the
 * NextActionCard in that case.
 */
import { NextResponse } from "next/server";

import { getClient } from "@/lib/brain/index-db";
import { getCurrentSweep } from "@/lib/orchestrator/sweeps";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!getClient(slug)) {
    return NextResponse.json(
      { ok: false, error: "client not found" },
      { status: 404 },
    );
  }
  const sweep = await getCurrentSweep(slug);
  return NextResponse.json({ ok: true, sweep });
}
