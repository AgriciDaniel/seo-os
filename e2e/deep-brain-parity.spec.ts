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
      skipped: boolean;
      result_summary: string | null;
    }>;
  };
}

interface ChatHistoryResponse {
  ok: boolean;
  turns: Array<{ id: string; role: string; content: string }>;
}

const EXPECTED_DEEP_BRAIN_CHILDREN = 34;

test.describe("Deep Brain parity fixture", () => {
  test("fills a Rituaria-style brain and proves deep-ready handoff", async ({
    page,
    request,
  }) => {
    const slug = await createFixtureClient(request);
    await page.goto(`/office?client=${slug}`);
    await expect(page.locator("canvas").first()).toBeVisible();

    await page.evaluate((clientSlug) => {
      void fetch(`/api/clients/${clientSlug}/sweeps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: "build-brain",
          permission_mode: "auto",
          from: "button",
        }),
      });
    }, slug);
    await expect(page.getByText(/live agents/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("complementary")).toContainText(
      /Spawning agents|Agent sweep complete/i,
    );

    const terminal = await waitForTerminalSweep(request, slug);
    expect(terminal.status).toBe("succeeded");
    expect(terminal.totals).toMatchObject({
      all: EXPECTED_DEEP_BRAIN_CHILDREN,
      succeeded: EXPECTED_DEEP_BRAIN_CHILDREN,
      failed: 0,
      cancelled: 0,
      skipped: 0,
      running: 0,
      queued: 0,
    });
    for (const specialistId of new Set(
      terminal.children.map((child) => child.specialist_id).filter(Boolean),
    )) {
      const hot = await readNote(
        request,
        slug,
        `wiki/specialists/${specialistId}/hot.md`,
      );
      expect(hot.body).toContain("**Terminal status**: `succeeded`");
      expect(hot.body).toContain("**Completed at**:");
      expect(hot.body).toContain("**Artifact path**:");
    }
    const driftBaseline = readDriftBaseline(slug);
    expect(driftBaseline.url).toBe("https://rituaria.example.com");
    expect(driftBaseline.capturedAt).toBeTruthy();
    expect(driftBaseline.title).toBeTruthy();

    const chat = await waitForChatText(request, slug, [
      "Your SEO brain is ready for review",
      "Readiness: **deep ready**",
      "```seo-suggestions",
      "Review the completed brain",
    ]);
    expect(chat).not.toContain("(empty)");
    expect(chat).not.toMatch(/^\s*wiki\/reviews\/.+brain-sweep-.+\.md\s*$/m);

    // Regression: the final orchestrator summary is written server-side
    // after the sweep terminal state. The mounted chat must pick it up
    // through live polling; no reload should be required.
    await expect(page.getByText(/Your SEO brain is ready for review/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Review the completed brain/i).first()).toBeVisible();
    await expect(page.getByText("(empty)")).toHaveCount(0);

    const reviewPath = extractReviewPath(chat);
    const reviewJson = await readNote(request, slug, reviewPath);
    expect(reviewJson.frontmatter?.approval_status).toBe("approved");
    expect(reviewJson.body).toContain("**Status:** deep_ready");
    expect(reviewJson.body).toContain("## Orchestrator handoff");
    expect(reviewJson.body).toContain("Top opportunities");
    expect(reviewJson.body).toContain("First action");
    expect(reviewJson.body).toContain("Acceptance");
    expect(reviewJson.body).toContain("Rollback");

    const clientSnapshot = await readClientSnapshot(request, slug);
    const manifestPaths = new Set(
      Object.values(clientSnapshot.manifest?.sources ?? {})
        .map((source) => source.path)
        .filter((sourcePath): sourcePath is string => Boolean(sourcePath)),
    );
    const artifactPaths = extractSweepArtifactPaths(terminal.children);
    expect(artifactPaths.length).toBeGreaterThanOrEqual(EXPECTED_DEEP_BRAIN_CHILDREN);
    for (const artifactPath of artifactPaths) {
      expect(
        manifestPaths.has(artifactPath),
        `expected manifest source for ${artifactPath}`,
      ).toBeTruthy();
    }

    const index = await readNote(request, slug, "wiki/index.md");
    for (const artifactPath of artifactPaths.filter((artifactPath) =>
      artifactPath.startsWith("wiki/") && artifactPath.endsWith(".md"),
    )) {
      expect(
        index.body.includes(wikilinkTarget(artifactPath)),
        `expected wiki/index.md to reference ${artifactPath}`,
      ).toBeTruthy();
    }

    await page.getByRole("button", { name: /review suggestions/i }).first().click();
    const reviewDialog = page.getByRole("dialog", { name: /Brain sweep review/i });
    await expect(reviewDialog).toBeVisible({ timeout: 30_000 });
    await expect(reviewDialog.getByText(/Human summary/i)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(reviewDialog).toHaveCount(0);

    const evidenceLines = readEvidenceLedgerLines(slug);
    expect(evidenceLines.length).toBeGreaterThanOrEqual(10);
    const families = new Set(
      evidenceLines.flatMap((line) =>
        JSON.parse(line).source_paths.map((sourcePath: string) =>
          sourcePath.replace(/^wiki\//, "").split("/").slice(0, 2).join("/"),
        ),
      ),
    );
    expect(families.size).toBeGreaterThanOrEqual(4);

    for (const notePath of [
      "wiki/keywords/Keyword Targets and Page Map.md",
      "wiki/decisions/Keyword to URL Map.md",
      "wiki/sources/Competitor Landscape Cache.md",
      "wiki/sources/DataForSEO Keyword Exports.md",
      "wiki/sources/PAA Mining Digest.md",
      "wiki/deliverables/ULTIMATE BEAST Plan.md",
    ]) {
      const note = await readNote(request, slug, notePath);
      expect(note.body).toContain("seo-office:");
      expect(note.body.split(/\s+/).length).toBeGreaterThan(180);
    }

    const sidePanel = page.getByRole("complementary");
    await sidePanel.getByRole("button", { name: /^Vault$/i }).click();
    await sidePanel.getByPlaceholder(/search title/i).fill("Keyword Targets");
    await sidePanel
      .getByRole("button", { name: /Keyword Targets and Page Map/i })
      .first()
      .click();
    const keywordDialog = page.getByRole("dialog", {
      name: /Keyword Targets and Page Map/i,
    });
    await expect(keywordDialog).toBeVisible();
    await expect(keywordDialog.getByText(/Deterministic fixture keyword map/i)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(keywordDialog).toHaveCount(0);

    await sidePanel.getByPlaceholder(/search title/i).fill("ULTIMATE BEAST Plan");
    await sidePanel.getByRole("button", { name: /ULTIMATE BEAST Plan/i }).first().click();
    const noteDialog = page.getByRole("dialog", { name: /ULTIMATE BEAST Plan/i });
    await expect(noteDialog).toBeVisible();
    await expect(noteDialog.getByText(/Top opportunities/i).first()).toBeVisible();
    await page.keyboard.press("Escape");

    const reportPath = await firstReportPath(request, slug);
    const report = await request.get(
      `/api/clients/${slug}/reports/${reportPath.replace(/^reports\//, "")}`,
    );
    expect(report.ok()).toBeTruthy();
    const reportHtml = await report.text();
    expect(reportHtml).toContain("SEO Office · Local Report");
    expect(reportHtml).toContain("<table");
    expect(reportHtml).toContain("<svg");
  });

  test("does not call a no-integration fixture brain deep-ready", async ({
    page,
    request,
  }) => {
    const slug = await createFixtureClient(request, {
      namePrefix: "Rituaria No Data",
      measurementAccess: [],
    });
    await page.goto(`/office?client=${slug}`);
    await expect(page.locator("canvas").first()).toBeVisible();

    await page.evaluate((clientSlug) => {
      void fetch(`/api/clients/${clientSlug}/sweeps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: "build-brain",
          permission_mode: "auto",
          from: "button",
        }),
      });
    }, slug);

    const terminal = await waitForTerminalSweep(request, slug);
    expect(terminal.status).toBe("succeeded");
    expect(terminal.totals).toMatchObject({
      all: EXPECTED_DEEP_BRAIN_CHILDREN,
      succeeded: EXPECTED_DEEP_BRAIN_CHILDREN,
      failed: 0,
      cancelled: 0,
      skipped: 0,
    });

    const chat = await waitForChatText(request, slug, [
      "Your SEO brain is useful, but it still needs live data",
      "Readiness: **needs data**",
      "Search Console",
      "GA4",
      "DataForSEO",
      "```seo-suggestions",
    ]);
    expect(chat).not.toContain("Readiness: **deep ready**");
    await expect(page.getByText(/still needs live data/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/deep ready/i)).toHaveCount(0);

    const reviewPath = extractReviewPath(chat);
    const reviewJson = await readNote(request, slug, reviewPath);
    expect(reviewJson.frontmatter?.approval_status).toBe("needs-review");
    expect(reviewJson.body).toContain("**Status:** needs_data");
    expect(reviewJson.body).toContain("live measurement data");
  });
});

async function createFixtureClient(
  request: APIRequestContext,
  options: {
    namePrefix?: string;
    measurementAccess?: string[];
  } = {},
): Promise<string> {
  const clientName = `${options.namePrefix ?? "Rituaria Fixture"} ${Date.now()}`;
  const response = await request.post("/api/clients", {
    data: {
      clientName,
      siteUrl: "https://rituaria.example.com",
      owner: "QA Editorial Team",
      businessType: "professional-services",
      niche: "ritual design and brand experience strategy",
      siteBrand: "Rituaria",
      authorByline: "QA Editorial Team",
      monetizationModel: "Booked strategy calls and consulting retainers",
      targetPersona:
        "Founders and marketing leaders who need a ritual design system for brand communities.",
      primaryCompetitors: [
        "ritualdesign.co",
        "brandexperience.io",
        "communitybrand.com",
      ],
      measurementAccess:
        options.measurementAccess ?? ["search-console", "ga4", "dataforseo"],
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

async function waitForChatText(
  request: APIRequestContext,
  slug: string,
  needles: string[],
): Promise<string> {
  let combined = "";
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `/api/chat/history?slug=${slug}&target=orchestrator`,
        );
        if (!response.ok()) return "";
        const json = (await response.json()) as ChatHistoryResponse;
        combined = json.turns.map((turn) => turn.content).join("\n\n");
        return needles.every((needle) => combined.includes(needle)) ? "ready" : "";
      },
      { timeout: 45_000, intervals: [250, 500, 1_000] },
    )
    .toBe("ready");
  return combined;
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

function extractReviewPath(chat: string): string {
  const matches = chat.match(/wiki\/reviews\/[^\s`)]*brain-sweep-[^\s`)]*\.md/g);
  if (!matches?.length) throw new Error("missing brain sweep review path in chat");
  return matches[matches.length - 1];
}

function readEvidenceLedgerLines(slug: string): string[] {
  const dataDir =
    process.env.SEO_OFFICE_E2E_DATA_DIR ??
    path.join(os.tmpdir(), "seo-office-playwright-e2e");
  const ledger = path.join(
    dataDir,
    "vaults",
    slug,
    "wiki",
    "meta",
    "evidence-ledger.jsonl",
  );
  return fs
    .readFileSync(ledger, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readDriftBaseline(slug: string): {
  capturedAt?: string;
  url?: string;
  title?: string | null;
} {
  const dataDir =
    process.env.SEO_OFFICE_E2E_DATA_DIR ??
    path.join(os.tmpdir(), "seo-office-playwright-e2e");
  const baseline = path.join(
    dataDir,
    "vaults",
    slug,
    ".drift",
    "baseline.json",
  );
  return JSON.parse(fs.readFileSync(baseline, "utf8")) as {
    capturedAt?: string;
    url?: string;
    title?: string | null;
  };
}

async function firstReportPath(
  request: APIRequestContext,
  slug: string,
): Promise<string> {
  const json = await readClientSnapshot(request, slug);
  const report = Object.values(json.manifest?.sources ?? {}).find((source) =>
    source.path?.startsWith("reports/"),
  );
  if (!report?.path) throw new Error("missing report path in manifest sources");
  return report.path;
}

async function readClientSnapshot(
  request: APIRequestContext,
  slug: string,
): Promise<{ manifest?: { sources?: Record<string, { path?: string }> } }> {
  const response = await request.get(`/api/clients/${slug}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as {
    manifest?: { sources?: Record<string, { path?: string }> };
  };
}

function extractSweepArtifactPaths(children: NonNullable<SweepResponse["sweep"]>["children"]): string[] {
  const paths = new Set<string>();
  for (const child of children) {
    const summary = child.result_summary ?? "";
    for (const match of summary.matchAll(/(?:written to|report:)\s+([^\s)]+)/gi)) {
      const candidate = match[1]?.replace(/[.,;:]+$/, "");
      if (candidate?.startsWith("wiki/") || candidate?.startsWith("reports/")) {
        paths.add(candidate);
      }
    }
  }
  return [...paths].sort();
}

function wikilinkTarget(artifactPath: string): string {
  const target = artifactPath.replace(/^wiki\//, "").replace(/\.md$/i, "");
  return `[[${target}`;
}
