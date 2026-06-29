/**
 * Tests for the pure side of `index-render.ts`. The rebuildIndex()
 * end-to-end is exercised through the manual e2e checklist — here we
 * only assert the pure render groups notes correctly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { renderIndex } from "../index-render.ts";
import type { NoteRow } from "../index-db.ts";

function note(partial: Partial<NoteRow>): NoteRow {
  return {
    client_slug: "acme",
    path: "wiki/test.md",
    type: "audit",
    title: "Untitled",
    status: "active",
    confidence: null,
    approval_status: null,
    risk_level: null,
    owner: null,
    business_type: null,
    created: "2026-05-13",
    updated: "2026-05-13",
    expires_on: null,
    tags: [],
    ...partial,
  };
}

test("renderIndex groups notes by section and sorts titles", () => {
  const out = renderIndex([
    note({ type: "audit", title: "Schema Audit", path: "wiki/audits/x.md" }),
    note({ type: "audit", title: "Technical Audit", path: "wiki/audits/y.md" }),
    note({ type: "concept", title: "FLOW Framework", path: "wiki/concepts/f.md" }),
    note({ type: "decision", title: "Pruning Framework", path: "wiki/decisions/p.md" }),
  ]);
  // Sections appear in canonical order
  const auditIdx = out.indexOf("## Audits");
  const conceptIdx = out.indexOf("## Concepts");
  const decisionIdx = out.indexOf("## Decisions");
  assert.ok(auditIdx > 0);
  assert.ok(conceptIdx > auditIdx);
  assert.ok(decisionIdx > conceptIdx);

  // Audits are alphabetised
  const schemaIdx = out.indexOf("[[audits/x|Schema Audit]]");
  const techIdx = out.indexOf("[[audits/y|Technical Audit]]");
  assert.ok(schemaIdx > 0);
  assert.ok(techIdx > schemaIdx);
});

test("renderIndex omits empty sections", () => {
  const out = renderIndex([
    note({ type: "concept", title: "A", path: "wiki/concepts/a.md" }),
  ]);
  assert.equal(out.includes("## Concepts"), true);
  assert.equal(out.includes("## Audits"), false);
});

test("renderIndex includes the static Start Here block", () => {
  const out = renderIndex([]);
  assert.equal(out.includes("## Start Here"), true);
  assert.equal(out.includes("[[Hot]]"), true);
  assert.equal(out.includes("[[Log]]"), true);
});

test("renderIndex excludes hot/log/index/overview from the Meta section", () => {
  const out = renderIndex([
    note({ type: "meta", title: "Hot", path: "wiki/hot.md" }),
    note({ type: "meta", title: "Log", path: "wiki/log.md" }),
    note({ type: "meta", title: "Start Here", path: "wiki/meta/Start Here.md" }),
    note({ type: "overview", title: "Overview", path: "wiki/overview.md" }),
  ]);
  // Start Here block contains [[Hot]] [[Log]] [[Overview]] statically.
  // The dynamic Meta section should ONLY contain "Start Here".
  const metaIdx = out.indexOf("## Meta");
  if (metaIdx >= 0) {
    const metaBlock = out.slice(metaIdx);
    assert.equal(
      metaBlock.includes("[[meta/Start Here]]"),
      true,
      "expected Start Here in Meta",
    );
    // Hot/Log/Overview should NOT appear inside the dynamic Meta block.
    // (They already appear in Start Here, so the wikilink existing
    // somewhere in the doc isn't the test — duplication inside Meta is.)
    const startOfMetaItems = metaBlock.indexOf("\n- ");
    const metaItemsBlock = metaBlock.slice(startOfMetaItems);
    assert.equal(metaItemsBlock.includes("[[Hot]]"), false);
    assert.equal(metaItemsBlock.includes("[[Log]]"), false);
    assert.equal(metaItemsBlock.includes("[[Overview]]"), false);
  }
});
