import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";

type SweepStatus =
  | "planned"
  | "blocked"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

interface SweepResponse {
  ok: boolean;
  sweep: null | {
    root_task_id: string;
    status: SweepStatus;
    totals: {
      all: number;
      succeeded: number;
      failed: number;
      cancelled: number;
      skipped: number;
      running: number;
      queued: number;
      planned_or_blocked: number;
    };
    children: Array<{
      specialist_id: string;
      status: SweepStatus;
      result_summary: string | null;
    }>;
  };
}

const EXPECTED_DEEP_BRAIN_CHILDREN = 34;
const TODAY = new Date().toISOString().slice(0, 10);

test.describe("Build-brain same-day reruns", () => {
  test("preserve first-run artifacts and index the latest run", async ({ request }) => {
    const slug = await createFixtureClient(request);

    await startSweep(request, slug);
    const first = await waitForTerminalSweep(request, slug);
    expect(first.status).toBe("succeeded");
    const firstTechnical = artifactPathFor(first, "technical-auditor");
    expect(firstTechnical).toBe(`wiki/audits/${TODAY}-technical.md`);
    expect(readVaultFile(slug, ".drift/baseline.json")).toContain(
      "https://rerun.example.com",
    );

    await startSweep(request, slug);
    const second = await waitForNewTerminalSweep(request, slug, first.root_task_id);
    expect(second.status).toBe("succeeded");
    expect(second.root_task_id).not.toBe(first.root_task_id);
    const secondTechnical = artifactPathFor(second, "technical-auditor");
    expect(secondTechnical).toMatch(
      new RegExp(`^wiki/audits/${TODAY}-technical\\.[a-f0-9]{8}\\.md$`),
    );

    const firstNote = await readNote(request, slug, firstTechnical);
    const secondNote = await readNote(request, slug, secondTechnical);
    expect(firstNote.body).toContain("Deterministic e2e specialist fixture");
    expect(secondNote.body).toContain("Deterministic e2e specialist fixture");

    const index = await readNote(request, slug, "wiki/index.md");
    expect(index.body).toContain(`[[audits/${TODAY}-technical|Technical SEO audit`);
    expect(index.body).toContain(
      `[[${secondTechnical.replace(/^wiki\//, "").replace(/\.md$/, "")}|Technical SEO audit`,
    );

    const log = await readNote(request, slug, "wiki/log.md");
    expect((log.body.match(/brain sweep review/g) ?? []).length).toBeGreaterThanOrEqual(
      2,
    );
  });
});

async function createFixtureClient(request: APIRequestContext): Promise<string> {
  const response = await request.post("/api/clients", {
    data: {
      clientName: `Rerun Fixture ${Date.now()}`,
      siteUrl: "https://rerun.example.com",
      owner: "QA Editorial Team",
      businessType: "professional-services",
      niche: "same day rerun quality assurance",
      siteBrand: "Rerun QA",
      authorByline: "QA Editorial Team",
      monetizationModel: "Consulting retainers",
      targetPersona: "Operators validating repeatable Deep Brain sweeps.",
      primaryCompetitors: ["competitor.example"],
      measurementAccess: ["search-console", "ga4", "dataforseo"],
      locale: {
        location_name: "United States",
        language_name: "English",
        timezone: "America/New_York",
      },
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { slug: string };
  return body.slug;
}

async function startSweep(request: APIRequestContext, slug: string): Promise<void> {
  const response = await request.post(`/api/clients/${slug}/sweeps`, {
    data: {
      template_id: "build-brain",
      permission_mode: "auto",
      from: "api",
    },
  });
  expect(response.status()).toBe(202);
  const body = await response.json();
  expect(body.existing ?? false).toBe(false);
}

async function getSweep(
  request: APIRequestContext,
  slug: string,
): Promise<SweepResponse["sweep"]> {
  const response = await request.get(`/api/clients/${slug}/sweeps/current`);
  if (!response.ok()) return null;
  return ((await response.json()) as SweepResponse).sweep;
}

async function waitForTerminalSweep(
  request: APIRequestContext,
  slug: string,
): Promise<NonNullable<SweepResponse["sweep"]>> {
  let latest: SweepResponse["sweep"] = null;
  await expect
    .poll(
      async () => {
        latest = await getSweep(request, slug);
        if (!latest) return "missing";
        return `${latest.status}:${latest.totals.succeeded}/${latest.totals.all}:${latest.totals.running}:${latest.totals.queued}`;
      },
      { timeout: 90_000, intervals: [250, 500, 1_000] },
    )
    .toBe(`succeeded:${EXPECTED_DEEP_BRAIN_CHILDREN}/${EXPECTED_DEEP_BRAIN_CHILDREN}:0:0`);
  return latest!;
}

async function waitForNewTerminalSweep(
  request: APIRequestContext,
  slug: string,
  previousRootTaskId: string,
): Promise<NonNullable<SweepResponse["sweep"]>> {
  let latest: SweepResponse["sweep"] = null;
  await expect
    .poll(
      async () => {
        latest = await getSweep(request, slug);
        if (!latest || latest.root_task_id === previousRootTaskId) return "old";
        return `${latest.status}:${latest.totals.succeeded}/${latest.totals.all}:${latest.totals.running}:${latest.totals.queued}`;
      },
      { timeout: 90_000, intervals: [250, 500, 1_000] },
    )
    .toBe(`succeeded:${EXPECTED_DEEP_BRAIN_CHILDREN}/${EXPECTED_DEEP_BRAIN_CHILDREN}:0:0`);
  return latest!;
}

function artifactPathFor(
  sweep: NonNullable<SweepResponse["sweep"]>,
  specialistId: string,
): string {
  const child = sweep.children.find((entry) => entry.specialist_id === specialistId);
  const summary = child?.result_summary ?? "";
  const match = summary.match(/written to\s+([^\s)]+)/i);
  if (!match?.[1]) throw new Error(`missing artifact path for ${specialistId}`);
  return match[1].replace(/[.,;:]+$/, "");
}

async function readNote(
  request: APIRequestContext,
  slug: string,
  notePath: string,
): Promise<{ frontmatter?: Record<string, unknown>; body: string }> {
  const response = await request.get(
    `/api/brain/note?slug=${slug}&path=${encodeURIComponent(notePath)}`,
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { frontmatter?: Record<string, unknown>; body: string };
}

function readVaultFile(slug: string, relativePath: string): string {
  const dataDir =
    process.env.SEO_OFFICE_E2E_DATA_DIR ??
    path.join(os.tmpdir(), "seo-office-playwright-e2e");
  return fs.readFileSync(path.join(dataDir, "vaults", slug, relativePath), "utf8");
}
