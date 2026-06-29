import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "review-queue-"));
  originalEnv = process.env.SEO_OFFICE_DATA_DIR;
  process.env.SEO_OFFICE_DATA_DIR = tmpRoot;
});

after(async () => {
  const { closeDb } = await import("@/lib/brain/index-db.ts");
  closeDb();
  if (originalEnv !== undefined) {
    process.env.SEO_OFFICE_DATA_DIR = originalEnv;
  } else {
    delete process.env.SEO_OFFICE_DATA_DIR;
  }
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

test("high-risk review queue includes only needs-review high-risk notes", async () => {
  const { getDb, reindexNoteRow } = await import("@/lib/brain/index-db.ts");
  const { writeNote } = await import("@/lib/brain/vault-fs.ts");
  const { countHighRiskReviewQueue, listHighRiskReviewQueue } = await import(
    "../review-queue.ts"
  );
  const slug = "review-client";
  await fsp.mkdir(path.join(tmpRoot, "vaults", slug, "wiki", "audits"), {
    recursive: true,
  });
  getDb()
    .prepare(
      `INSERT INTO clients (slug, name, site_url, owner)
       VALUES (?, ?, ?, ?)`,
    )
    .run(slug, "Review Client", "https://review.example.com", "tester");

  await writeNote(slug, "wiki/audits/high.md", {
    frontmatter: fm("High-risk deliverable", "needs-review", "high"),
    body: "# High-risk deliverable\n\nNeeds human review.\n",
  });
  await writeNote(slug, "wiki/audits/low.md", {
    frontmatter: fm("Low-risk deliverable", "needs-review", "low"),
    body: "# Low-risk deliverable\n\nReviewable, but not high risk.\n",
  });
  await writeNote(slug, "wiki/audits/approved-high.md", {
    frontmatter: fm("Approved high-risk deliverable", "approved", "high"),
    body: "# Approved high-risk deliverable\n\nAlready approved.\n",
  });
  await reindexNoteRow(slug, "wiki/audits/high.md");
  await reindexNoteRow(slug, "wiki/audits/low.md");
  await reindexNoteRow(slug, "wiki/audits/approved-high.md");

  const queue = listHighRiskReviewQueue(slug);
  assert.equal(countHighRiskReviewQueue(slug), 1);
  assert.deepEqual(queue.map((item) => item.path), ["wiki/audits/high.md"]);
  assert.equal(queue[0]?.title, "High-risk deliverable");
});

function fm(
  title: string,
  approval_status: "needs-review" | "approved",
  risk_level: "low" | "high",
) {
  return {
    brain_schema: "marketing-brain.v1" as const,
    type: "audit" as const,
    title,
    created: "2026-05-18",
    updated: "2026-05-18",
    tags: ["audit"],
    status: "active" as const,
    owner: "tester",
    confidence: "medium" as const,
    approval_status,
    risk_level,
    rollback_note: "Delete this test note.",
  };
}
