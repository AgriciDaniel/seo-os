/**
 * GET /api/brain?slug=<client>
 *
 * Returns every indexed note for a client grouped by type, plus a small
 * summary header (total notes, by-status counts, recent activity). Powers
 * the right-pane Vault tab in the office workspace.
 */
import { NextResponse } from "next/server";
import { getDb, getClient } from "@/lib/brain/index-db";
import { listHighRiskReviewQueue } from "@/lib/brain/review-queue";

export const dynamic = "force-dynamic";

interface NoteRow {
  client_slug: string;
  path: string;
  type: string;
  title: string;
  status: string;
  confidence: string | null;
  approval_status: string | null;
  risk_level: string | null;
  owner: string | null;
  business_type: string | null;
  created: string;
  updated: string;
  tags: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ ok: false, error: "slug is required" }, { status: 400 });
  }
  const client = getClient(slug);
  if (!client) {
    return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  }

  const rows = getDb()
    .prepare(
      `SELECT client_slug, path, type, title, status, confidence, approval_status,
              risk_level, owner, business_type, created, updated, tags
       FROM notes
       WHERE client_slug = ?
       ORDER BY type, updated DESC, title`,
    )
    .all(slug) as NoteRow[];

  const notes = rows.map((r) => ({
    ...r,
    tags: safeParseTags(r.tags),
  }));

  const grouped: Record<string, typeof notes> = {};
  for (const n of notes) {
    grouped[n.type] = grouped[n.type] ?? [];
    grouped[n.type].push(n);
  }

  const summary = {
    total: notes.length,
    byStatus: {
      seed: notes.filter((n) => n.confidence === "seed").length,
      low: notes.filter((n) => n.confidence === "low").length,
      medium: notes.filter((n) => n.confidence === "medium").length,
      high: notes.filter((n) => n.confidence === "high").length,
    },
    pendingReview: notes.filter((n) => n.approval_status === "needs-review").length,
    highRiskReview: notes.filter(
      (n) => n.approval_status === "needs-review" && n.risk_level === "high",
    ).length,
    recentUpdates: notes
      .slice()
      .sort((a, b) => (a.updated < b.updated ? 1 : -1))
      .slice(0, 5)
      .map((n) => ({ title: n.title, path: n.path, updated: n.updated })),
  };

  return NextResponse.json({
    ok: true,
    client,
    summary,
    grouped,
    notes,
    reviewQueue: listHighRiskReviewQueue(slug),
  });
}

function safeParseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
