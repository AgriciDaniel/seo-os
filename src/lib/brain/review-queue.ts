import "server-only";

import { getDb } from "@/lib/brain/index-db";

export interface ReviewQueueItem {
  path: string;
  type: string;
  title: string;
  confidence: string | null;
  approval_status: string | null;
  risk_level: string | null;
  owner: string | null;
  updated: string;
}

export function listHighRiskReviewQueue(
  clientSlug: string,
  limit = 20,
): ReviewQueueItem[] {
  return getDb()
    .prepare(
      `SELECT path, type, title, confidence, approval_status, risk_level, owner, updated
       FROM notes
       WHERE client_slug = ?
         AND approval_status = 'needs-review'
         AND risk_level = 'high'
       ORDER BY updated DESC, title ASC
       LIMIT ?`,
    )
    .all(clientSlug, Math.max(1, Math.min(100, limit))) as ReviewQueueItem[];
}

export function countHighRiskReviewQueue(clientSlug: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM notes
       WHERE client_slug = ?
         AND approval_status = 'needs-review'
         AND risk_level = 'high'`,
    )
    .get(clientSlug) as { count: number } | undefined;
  return row?.count ?? 0;
}
