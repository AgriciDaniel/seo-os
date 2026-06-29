import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "cost-preflight-"));
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

test("build-brain dispatch is blocked when the monthly cost cap would be exceeded", async () => {
  const { scaffoldClient } = await import("@/lib/brain/scaffold.ts");
  const { readManifest, writeManifest } = await import(
    "@/lib/orchestrator/client-context.ts"
  );
  const { BUILD_BRAIN_SWEEP } = await import("../task-templates.ts");
  const { estimateTemplateCost } = await import("@/lib/specialists/_lib/cost.ts");
  const { dispatchPlanTree } = await import("../dispatch.ts");
  const { getCurrentSweep } = await import("../sweeps.ts");

  const client = await scaffoldClient({
    slug: "cost-cap-client",
    clientName: "Cost Cap Client",
    siteUrl: "https://cost-cap.example.com",
    owner: "tester",
    businessType: "saas",
    niche: "SEO cost controls",
    siteBrand: "Cost Cap",
    authorByline: "QA",
    monetizationModel: "subscriptions",
    targetPersona: "operators controlling API spend",
    primaryCompetitors: ["competitor.example"],
    measurementAccess: ["search-console", "ga4", "dataforseo"],
  });
  const manifest = await readManifest(client.slug);
  assert.ok(manifest);
  manifest.monthly_cost_cap_usd = 0.1;
  await writeManifest(client.slug, manifest);

  const preflight = estimateTemplateCost({
    template: BUILD_BRAIN_SWEEP,
    manifest,
  });
  assert.equal(preflight.over_cap, true);
  assert.ok(preflight.total_usd > 0.5);

  await assert.rejects(
    () =>
      dispatchPlanTree({
        clientSlug: client.slug,
        permissionMode: "auto",
        toolInput: { template_id: "build-brain", permission_mode: "auto" },
      }),
    /cost_cap_exceeded:.*monthly cap \$0\.10/,
  );

  assert.equal(await getCurrentSweep(client.slug), null);
});
