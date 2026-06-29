import "server-only";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { closeDb } from "@/lib/brain/index-db.ts";
import { scaffoldClient } from "@/lib/brain/scaffold.ts";
import { vaultRoot } from "@/lib/brain/paths.ts";
import {
  MARKETING_BRAIN_SCRIPTS,
  runMarketingBrainScript,
  type MarketingBrainScriptId,
} from "@/lib/marketing-brain/scripts.ts";

const DEFAULT_CLIENT_SLUG = "marketing-brain-script-smoke";
const SMOKE_DATE = new Date().toISOString().slice(0, 10);
const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

export interface MarketingBrainScriptSmokeOptions {
  dataRoot?: string;
  clientSlug?: string;
  keywordRows?: number;
  keepDataRoot?: boolean;
  timeoutMs?: number;
}

export interface MarketingBrainScriptSmokeReport {
  ok: boolean;
  dataRoot: string;
  vault: string;
  clientSlug: string;
  cleanedUp: boolean;
  steps: MarketingBrainScriptSmokeStep[];
  outputs: {
    keywordCsv?: string;
    keywordXlsx?: string;
    beastPlan?: string;
    beastHtml?: string;
    visualManifest?: string;
    visualNote?: string;
  };
}

export interface MarketingBrainScriptSmokeStep {
  id: MarketingBrainScriptId | "fixtures";
  status: "passed" | "failed";
  detail: string;
}

export async function runMarketingBrainScriptSmoke(
  options: MarketingBrainScriptSmokeOptions = {},
): Promise<MarketingBrainScriptSmokeReport> {
  const dataRoot =
    options.dataRoot ?? (await fsp.mkdtemp(path.join(os.tmpdir(), "seo-office-mb-scripts-")));
  const clientSlug = options.clientSlug ?? DEFAULT_CLIENT_SLUG;
  const keywordRows = options.keywordRows ?? 180;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const cleanedUpByDefault = !options.keepDataRoot && !options.dataRoot;
  const steps: MarketingBrainScriptSmokeStep[] = [];
  const outputs: MarketingBrainScriptSmokeReport["outputs"] = {};
  const originalDataRoot = process.env.SEO_OFFICE_DATA_DIR;

  process.env.SEO_OFFICE_DATA_DIR = dataRoot;

  try {
    await scaffoldClient({
      slug: clientSlug,
      clientName: "Marketing Brain Script Smoke",
      siteUrl: "https://example.com",
      owner: "SEO Office Smoke",
      businessType: "local-services",
      niche: "emergency plumbing",
      siteBrand: "Smoke Plumbing",
      authorByline: "SEO Office",
      monetizationModel: "Lead generation",
      targetPersona: "Homeowners comparing emergency plumbing services",
      primaryCompetitors: ["alpha-plumbing.example", "beta-plumbing.example"],
      measurementAccess: ["dataforseo", "google-search-console"],
      locale: {
        location_name: "United States",
        language_name: "English",
        timezone: "America/New_York",
      },
    });

    const vault = vaultRoot(clientSlug);
    const projectDir = path.join(dataRoot, "visual-fixture-project");
    await writeSmokeFixtures(vault, projectDir, keywordRows);
    steps.push({
      id: "fixtures",
      status: "passed",
      detail: `created ${keywordRows} keyword rows plus competitor, PAA, and visual fixtures`,
    });

    await runStep(clientSlug, "build-keyword-xlsx", steps, timeoutMs);
    outputs.keywordCsv = path.join(vault, `keywords-${SMOKE_DATE}.csv`);
    outputs.keywordXlsx = path.join(vault, `keywords-${SMOKE_DATE}.xlsx`);
    await assertFile(outputs.keywordCsv, "keyword CSV");
    await assertFile(outputs.keywordXlsx, "keyword workbook");
    const csvRows = await countCsvRows(outputs.keywordCsv);
    if (csvRows < Math.floor(keywordRows * 0.75)) {
      throw new Error(`keyword CSV only had ${csvRows} rows`);
    }

    await runStep(clientSlug, "capture-visual-references", steps, timeoutMs, [
      "--project-dir",
      projectDir,
      "--name",
      "script-smoke-brand",
      "--date",
      SMOKE_DATE,
      "--max-project-images",
      "10",
      "--max-images",
      "0",
      "--no-screenshot",
    ]);
    outputs.visualManifest = path.join(
      vault,
      ".raw",
      "sources",
      "visuals",
      `${SMOKE_DATE}-script-smoke-brand`,
      "manifest.json",
    );
    outputs.visualNote = path.join(
      vault,
      "wiki",
      "sources",
      "Visual Reference Capture - script-smoke-brand.md",
    );
    await assertJsonFile(outputs.visualManifest, "visual manifest");
    await assertFile(outputs.visualNote, "visual source note");

    await runStep(clientSlug, "synthesize-beast-plan", steps, timeoutMs, [
      "--business-type",
      "local-services",
    ]);
    outputs.beastPlan = path.join(vault, "wiki", "deliverables", "ULTIMATE BEAST Plan.md");
    const plan = await assertFile(outputs.beastPlan, "BEAST plan");
    for (const expected of ["brain_schema: marketing-brain.v1", "## Executive Summary", "## Source Manifest"]) {
      if (!plan.includes(expected)) throw new Error(`BEAST plan missing ${expected}`);
    }

    const beastPdf = path.join(vault, `${clientSlug}-Beast-Plan.pdf`);
    await runStep(clientSlug, "render-beast-pdf", steps, timeoutMs, [
      "--html-only",
      "--out",
      beastPdf,
      "--client-name",
      "Marketing Brain Script Smoke",
      "--site-url",
      "https://example.com",
    ]);
    outputs.beastHtml = path.join(vault, `${clientSlug}-Beast-Plan.html`);
    const html = await assertFile(outputs.beastHtml, "BEAST HTML report");
    if (!html.includes("Marketing Brain Script Smoke")) {
      throw new Error("BEAST HTML did not include the client name");
    }

    const dataforseoIds = MARKETING_BRAIN_SCRIPTS.filter((script) =>
      (script.requirements as readonly string[]).includes("dataforseo"),
    ).map((script) => script.id);
    steps.push({
      id: "fixtures",
      status: "passed",
      detail: `skipped live DataForSEO scripts in offline smoke: ${dataforseoIds.join(", ")}`,
    });

    return {
      ok: steps.every((step) => step.status === "passed"),
      dataRoot,
      vault,
      clientSlug,
      cleanedUp: cleanedUpByDefault,
      steps,
      outputs,
    };
  } catch (error) {
    steps.push({
      id: "fixtures",
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      dataRoot,
      vault: vaultRoot(clientSlug),
      clientSlug,
      cleanedUp: cleanedUpByDefault,
      steps,
      outputs,
    };
  } finally {
    closeDb();
    if (originalDataRoot !== undefined) {
      process.env.SEO_OFFICE_DATA_DIR = originalDataRoot;
    } else {
      delete process.env.SEO_OFFICE_DATA_DIR;
    }
    if (!options.keepDataRoot && !options.dataRoot) {
      await fsp.rm(dataRoot, { recursive: true, force: true });
    }
  }
}

async function runStep(
  clientSlug: string,
  id: MarketingBrainScriptId,
  steps: MarketingBrainScriptSmokeStep[],
  timeoutMs: number,
  args: string[] = [],
): Promise<void> {
  const result = await runMarketingBrainScript(clientSlug, id, {
    args,
    timeoutMs,
  });
  if (result.status !== "succeeded") {
    throw new Error(`${id} did not run: ${result.message}`);
  }
  steps.push({
    id,
    status: "passed",
    detail: result.result.stdout.trim().split("\n").at(-1) ?? "completed",
  });
}

async function writeSmokeFixtures(
  vault: string,
  projectDir: string,
  keywordRows: number,
): Promise<void> {
  const rawDir = path.join(vault, ".raw", "sources", "dataforseo");
  await fsp.mkdir(rawDir, { recursive: true });
  await fsp.mkdir(path.join(vault, "wiki", "deliverables"), { recursive: true });
  await fsp.mkdir(path.join(vault, "wiki", "meta"), { recursive: true });
  await fsp.writeFile(
    path.join(vault, "wiki", "meta", "keywords.base"),
    "filters: []\nsource: keywords-placeholder.csv\n",
    "utf8",
  );

  const domains = ["alpha-plumbing.example", "beta-plumbing.example", "gamma-plumbing.example"];
  for (const [domainIndex, domain] of domains.entries()) {
    const items = Array.from({ length: keywordRows }, (_, index) =>
      keywordItem({
        index,
        domain,
        rank: 1 + ((index + domainIndex * 3) % 30),
        volume: 80 + ((index * 37 + domainIndex * 41) % 4_500),
      }),
    );
    await fsp.writeFile(
      path.join(rawDir, `competitor-kw-${domain}.json`),
      JSON.stringify({ domain, pages: [{ items }] }, null, 2) + "\n",
      "utf8",
    );
  }

  const siteItems = Array.from({ length: Math.floor(keywordRows * 0.35) }, (_, index) =>
    keywordItem({
      index,
      domain: "example.com",
      rank: 8 + ((index * 5) % 65),
      volume: 90 + ((index * 29) % 3_000),
      site: true,
    }),
  );
  await fsp.writeFile(
    path.join(rawDir, `site-ranked-keywords-${SMOKE_DATE}.json`),
    JSON.stringify({ domain: "example.com", pages: [{ items: siteItems }] }, null, 2) + "\n",
    "utf8",
  );

  await fsp.writeFile(
    path.join(rawDir, `competitors-${SMOKE_DATE}.json`),
    JSON.stringify(
      {
        competitors: domains.map((domain, index) => ({
          domain,
          score: 92 - index * 7,
          appearances: 45 - index * 8,
          avg_position: 3.4 + index,
        })),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  await fsp.writeFile(
    path.join(rawDir, `paa-digest-${SMOKE_DATE}.md`),
    [
      "# PAA Digest",
      "",
      "- How much does emergency plumbing cost?",
      "- What should I do before a plumber arrives?",
      "- Are 24 hour plumbing services more expensive?",
      "",
    ].join("\n"),
    "utf8",
  );

  await fsp.mkdir(path.join(projectDir, "assets"), { recursive: true });
  await fsp.writeFile(path.join(projectDir, "assets", "hero.png"), ONE_BY_ONE_PNG);
  await fsp.writeFile(
    path.join(projectDir, "assets", "brand.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#0f766e"/></svg>\n',
    "utf8",
  );
}

function keywordItem(input: {
  index: number;
  domain: string;
  rank: number;
  volume: number;
  site?: boolean;
}) {
  const keyword = `${input.site ? "our " : ""}emergency plumbing service ${input.index}`;
  return {
    keyword_data: {
      keyword,
      keyword_info: {
        search_volume: input.volume,
        cpc: Number((3 + (input.index % 20) * 0.35).toFixed(2)),
        competition: Number((0.25 + (input.index % 50) / 100).toFixed(2)),
        competition_level: input.index % 3 === 0 ? "HIGH" : "MEDIUM",
      },
      keyword_properties: {
        keyword_difficulty: 12 + (input.index % 55),
      },
      search_intent_info: {
        main_intent: input.index % 4 === 0 ? "commercial" : "informational",
      },
      serp_info: {
        serp_item_types: input.index % 5 === 0 ? ["organic", "people_also_ask"] : ["organic"],
      },
    },
    ranked_serp_element: {
      serp_item: {
        rank_group: input.rank,
        url: `https://${input.domain}/services/${input.index}`,
      },
    },
  };
}

async function assertFile(filePath: string, label: string): Promise<string> {
  const text = await fsp.readFile(filePath, "utf8");
  const stat = await fsp.stat(filePath);
  if (!stat.isFile() || stat.size === 0) throw new Error(`${label} was empty: ${filePath}`);
  return text;
}

async function assertJsonFile(filePath: string, label: string): Promise<unknown> {
  const text = await assertFile(filePath, label);
  return JSON.parse(text);
}

async function countCsvRows(filePath: string): Promise<number> {
  const text = await fsp.readFile(filePath, "utf8");
  return Math.max(0, text.trim().split(/\r?\n/).length - 1);
}
