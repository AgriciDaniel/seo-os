/**
 * Tests for src/lib/brain/vault-renderer.ts.
 *
 * Covers the Phase 0 fidelity changes:
 *  - `substituteSlots` known/unknown token handling.
 *  - `substitutePath` substitutes tokens in path segments and sanitises
 *    filesystem-unsafe characters.
 *  - `renderTemplate` end-to-end: tokens in body AND filename land
 *    correctly, binary files are copied verbatim, the template's
 *    `.raw/.manifest.json` is skipped, and mtime preservation works.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  renderTemplate,
  substitutePath,
  substituteSlots,
} from "../vault-renderer.ts";

test("substituteSlots fills known tokens, leaves unknown ones literal", () => {
  const out = substituteSlots("hi {{name}} from {{niche}} and {{unknown}}", {
    name: "daniel",
    niche: "fly fishing",
  });
  assert.equal(out, "hi daniel from fly fishing and {{unknown}}");
});

test("substitutePath replaces tokens in path segments", () => {
  const out = substitutePath("wiki/entities/{{client_name}}.md", {
    client_name: "Acme Outdoors",
  });
  assert.equal(out, "wiki/entities/Acme Outdoors.md");
});

test("substitutePath sanitises filesystem-unsafe characters", () => {
  // Slot value contains slash + colon + asterisk. Each must collapse to `-`
  // so a malicious slot can't escape the vault root or break the layout.
  const out = substitutePath("wiki/entities/{{client_name}}.md", {
    client_name: "evil/escape:attempt*here",
  });
  assert.equal(out, "wiki/entities/evil-escape-attempt-here.md");
});

test("substitutePath leaves the path alone when there are no tokens", () => {
  const out = substitutePath("wiki/concepts/Information Gain.md", {
    name: "ignored",
  });
  assert.equal(out, "wiki/concepts/Information Gain.md");
});

test("renderTemplate substitutes body, filename, and skips RAW_MANIFEST", async () => {
  const sourceRoot = await fsp.mkdtemp(
    path.join(os.tmpdir(), "vault-renderer-src-"),
  );
  const targetRoot = await fsp.mkdtemp(
    path.join(os.tmpdir(), "vault-renderer-tgt-"),
  );

  try {
    // Lay down a minimal template tree:
    //   <src>/wiki/hot.md                  — body has a token
    //   <src>/wiki/entities/{{c}}.md       — filename has a token
    //   <src>/_attachments/diagram.svg     — binary, copied verbatim
    //   <src>/.raw/.manifest.json          — must be SKIPPED by walker
    await fsp.mkdir(path.join(sourceRoot, "wiki", "entities"), {
      recursive: true,
    });
    await fsp.mkdir(path.join(sourceRoot, "_attachments"), { recursive: true });
    await fsp.mkdir(path.join(sourceRoot, ".raw"), { recursive: true });

    await fsp.writeFile(
      path.join(sourceRoot, "wiki", "hot.md"),
      "hi {{client_name}} working on {{niche}}",
      "utf8",
    );
    await fsp.writeFile(
      path.join(sourceRoot, "wiki", "entities", "{{c}}.md"),
      "Entity body",
      "utf8",
    );
    await fsp.writeFile(
      path.join(sourceRoot, "_attachments", "diagram.svg"),
      "<svg/>",
      "utf8",
    );
    await fsp.writeFile(
      path.join(sourceRoot, ".raw", ".manifest.json"),
      '{"templated": "{{date}}"}',
      "utf8",
    );

    await renderTemplate(sourceRoot, targetRoot, {
      slots: {
        client_name: "Acme Outdoors",
        niche: "fly fishing",
        c: "Primary Competitor",
        date: "2026-05-13",
      },
    });

    // body substitution
    const hot = await fsp.readFile(
      path.join(targetRoot, "wiki", "hot.md"),
      "utf8",
    );
    assert.equal(hot, "hi Acme Outdoors working on fly fishing");

    // filename substitution
    assert.equal(
      fs.existsSync(
        path.join(targetRoot, "wiki", "entities", "Primary Competitor.md"),
      ),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(targetRoot, "wiki", "entities", "{{c}}.md")),
      false,
    );

    // binary copy
    assert.equal(
      fs.existsSync(path.join(targetRoot, "_attachments", "diagram.svg")),
      true,
    );

    // .raw/.manifest.json must be SKIPPED so writeInitialManifest() can
    // own the canonical path without being clobbered by the template.
    assert.equal(
      fs.existsSync(path.join(targetRoot, ".raw", ".manifest.json")),
      false,
    );
  } finally {
    await fsp.rm(sourceRoot, { recursive: true, force: true });
    await fsp.rm(targetRoot, { recursive: true, force: true });
  }
});

test("renderTemplate preserves locally-modified files (mtime newer than source)", async () => {
  const sourceRoot = await fsp.mkdtemp(
    path.join(os.tmpdir(), "vault-renderer-src2-"),
  );
  const targetRoot = await fsp.mkdtemp(
    path.join(os.tmpdir(), "vault-renderer-tgt2-"),
  );

  try {
    await fsp.mkdir(path.join(sourceRoot, "wiki"), { recursive: true });
    await fsp.writeFile(
      path.join(sourceRoot, "wiki", "hot.md"),
      "template body",
      "utf8",
    );

    // First render: writes the file.
    await renderTemplate(sourceRoot, targetRoot, { slots: {} });
    const dest = path.join(targetRoot, "wiki", "hot.md");
    assert.equal(await fsp.readFile(dest, "utf8"), "template body");

    // User edits the file; touch mtime forward.
    await fsp.writeFile(dest, "user edit", "utf8");
    const future = new Date(Date.now() + 60_000);
    await fsp.utimes(dest, future, future);

    // Second render with the same template: must NOT clobber the edit.
    const second = await renderTemplate(sourceRoot, targetRoot, { slots: {} });
    assert.equal(await fsp.readFile(dest, "utf8"), "user edit");
    assert.equal(second.preserved.includes(path.join("wiki", "hot.md")), true);
  } finally {
    await fsp.rm(sourceRoot, { recursive: true, force: true });
    await fsp.rm(targetRoot, { recursive: true, force: true });
  }
});
