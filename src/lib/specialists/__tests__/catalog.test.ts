import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { SPECIALISTS } from "../catalog.ts";

test("R9 every specialist has canonical integration declarations", () => {
  for (const specialist of SPECIALISTS) {
    assert.ok(Array.isArray(specialist.requiredIntegrations), specialist.id);
    assert.ok(Array.isArray(specialist.optionalIntegrations), specialist.id);
    assert.deepEqual(
      specialist.requiredIntegrations,
      specialist.requires ?? [],
      `${specialist.id} requiredIntegrations must preserve legacy requires`,
    );
    assert.deepEqual(
      specialist.optionalIntegrations,
      (specialist.uses ?? []).filter(
        (id) => !(specialist.requires ?? []).includes(id),
      ),
      `${specialist.id} optionalIntegrations must be uses minus required`,
    );
  }
});

test("R9 keyword researcher cannot silently run as high-confidence live data without DataForSEO", () => {
  const keyword = SPECIALISTS.find((specialist) => specialist.id === "keyword-researcher");
  assert.ok(keyword);
  assert.deepEqual(keyword.requiredIntegrations, ["dataforseo"]);
  assert.equal(keyword.optionalIntegrations.includes("dataforseo"), false);
});

test("R5 ready artifact-writing specialists return native execution envelopes", () => {
  const specialistsDir = path.resolve(process.cwd(), "src/lib/specialists");
  for (const specialist of SPECIALISTS.filter((entry) => entry.status === "ready")) {
    const sourcePath = path.join(specialistsDir, `${specialist.id}.ts`);
    assert.ok(fs.existsSync(sourcePath), `${specialist.id} source file must exist`);
    const source = fs.readFileSync(sourcePath, "utf8");
    if (!source.includes("writeArtifact(")) continue;
    assert.match(
      source,
      /executionResult/,
      `${specialist.id} writes artifacts and must return a native R5 executionResult`,
    );
  }
});
