import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type SweepStatus = "planned" | "blocked" | "queued" | "running" | "succeeded" | "failed" | "cancelled";

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
  };
}

interface ChatHistoryResponse {
  ok: boolean;
  turns: Array<{ id: string; role: string; content: string }>;
}

const EXPECTED_DEEP_BRAIN_CHILDREN = 34;

test.describe("Build-brain sweep", () => {
  test("runs a deterministic build-brain sweep end to end", async ({
    page,
    request,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.stack ?? err.message));

    const clientName = `Playwright Brain ${Date.now()}`;
    await createVaultFromUi(page, clientName);

    const created = await findClient(request, clientName);
    expect(created.slug).toMatch(/^playwright-brain-/);

    await page.getByRole("button", { name: /^build the brain$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/office\\?client=${created.slug}`));

    await expect(page.locator("canvas").first()).toBeVisible();
    await expect(page.getByRole("complementary")).toContainText(/chat/i);
    await expect(page.getByText(/^health$/i)).toBeVisible();
    await expect(page.getByText(/^cost$/i)).toBeVisible();
    await expect(page.getByText(/cache hits/i)).toBeVisible();
    await expect(page.getByText(/^integrations$/i)).toBeVisible();
    await expect(page.getByText(/^last sweep$/i)).toBeVisible();
    await expect(page.getByText(/^review$/i)).toBeVisible();
    await expect(page.getByText(/live agents/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("complementary")).toContainText(
      /Spawning agents|Agent sweep complete/i,
    );

    const terminal = await waitForTerminalSweep(request, created.slug);
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

    await expect(page.getByText(/deep brain reviewed/i)).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(`${EXPECTED_DEEP_BRAIN_CHILDREN} of ${EXPECTED_DEEP_BRAIN_CHILDREN} specialists done`),
    ).toBeVisible();

    const chat = await waitForChatText(request, created.slug, [
      "Spawning agents",
      "Your SEO brain",
      "```seo-suggestions",
    ]);
    const reviewPath = extractReviewPath(chat);
    expect(reviewPath).toMatch(/^wiki\/reviews\/.+brain-sweep-.+\.md$/);
    expect(chat).toContain(`"path": "${reviewPath}"`);

    const review = await request.get(
      `/api/brain/note?slug=${created.slug}&path=${encodeURIComponent(reviewPath)}`,
    );
    expect(review.ok()).toBeTruthy();
    const reviewJson = await review.json();
    expect(["approved", "needs-review"]).toContain(reviewJson.frontmatter?.approval_status);
    expect(reviewJson.body).toContain("Human summary");

    const consoleErrorsBeforeSuggestionCta = consoleErrors.length;
    await page.getByRole("button", { name: /review suggestions/i }).first().click();
    await expect(page).toHaveURL(/\/setup#integrations$/, { timeout: 30_000 });
    await page.goto(`/office?client=${created.slug}`);
    await expect(page.locator("canvas").first()).toBeVisible();
    const suggestionCtaConsoleErrors = consoleErrors
      .slice(consoleErrorsBeforeSuggestionCta)
      .filter((message) => !message.includes("403 (Forbidden)"));
    consoleErrors.splice(
      consoleErrorsBeforeSuggestionCta,
      consoleErrors.length - consoleErrorsBeforeSuggestionCta,
      ...suggestionCtaConsoleErrors,
    );

    const lint = await request.get(`/api/clients/${created.slug}/lint`);
    expect(lint.ok()).toBeTruthy();
    const lintJson = await lint.json();
    expect(lintJson.report).toMatchObject({
      clean: true,
      counts: { error: 0, warn: 0, info: 0 },
    });
    expect(lintJson.report.score).toBeGreaterThanOrEqual(95);

    const structuredLog = JSON.parse(
      readVaultFile(created.slug, "wiki/log.json"),
    ) as Array<{
      specialist_id?: string;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
      duration_ms?: number;
    }>;
    expect(structuredLog).toHaveLength(EXPECTED_DEEP_BRAIN_CHILDREN);
    for (const row of structuredLog) {
      expect(row.specialist_id).toBeTruthy();
      expect(row.cache_read_input_tokens).toBeGreaterThan(0);
      expect(row.cache_creation_input_tokens).toBeGreaterThan(0);
      expect(row.input_tokens).toBeGreaterThan(0);
      expect(row.output_tokens).toBeGreaterThan(0);
      expect(row.duration_ms).toBeGreaterThan(0);
    }

    const clientSnapshot = await request.get(`/api/clients/${created.slug}`);
    expect(clientSnapshot.ok()).toBeTruthy();
    const snapshot = await clientSnapshot.json();
    expect(snapshot.operationalStatus?.brainHealth?.score).toBeGreaterThanOrEqual(95);
    expect(snapshot.operationalStatus?.lastSweep?.updatedAt).toBeTruthy();
    expect(snapshot.operationalStatus?.lastSweep?.costUsd).toBeGreaterThanOrEqual(0);
    const reportPath = firstReportPath(snapshot.manifest?.sources);
    expect(reportPath).toMatch(/^reports\/.+\.html$/);

    const report = await request.get(
      `/api/clients/${created.slug}/reports/${reportPath.replace(/^reports\//, "")}`,
    );
    expect(report.ok()).toBeTruthy();
    const reportHtml = await report.text();
    expect(reportHtml).toContain("SEO Office · Local Report");
    expect(reportHtml).toContain("Back to chat");
    expect(reportHtml).toContain("<table");

    const sidePanel = page.getByRole("complementary");
    await sidePanel.getByRole("button", { name: "technical-auditor" }).first().click();
    await expect(sidePanel.getByText(/specialist/i).first()).toBeVisible();
    await expect(sidePanel.getByText(/technical seo auditor/i).first()).toBeVisible();
    await sidePanel.getByRole("button", { name: /technical seo audit/i }).click();
    await expect(sidePanel.getByText(/^confidence$/i).first()).toBeVisible();
    await expect(sidePanel.getByText(/^source$/i).first()).toBeVisible();
    await expect(sidePanel.getByText(/^risk$/i).first()).toBeVisible();
    await sidePanel.getByRole("button", { name: /open report/i }).click();
    const reportFrame = page.locator("iframe").filter({
      hasNot: page.locator("[data-never-matches]"),
    });
    await expect(reportFrame.last()).toBeVisible();
    await expect(reportFrame.last()).toHaveAttribute(
      "src",
      new RegExp(`/api/clients/${created.slug}/reports/.+\\.html`),
    );
    const reportFrameHandle = await reportFrame.last().elementHandle();
    const reportContentFrame = await reportFrameHandle?.contentFrame();
    expect(reportContentFrame).toBeTruthy();
    await expect(reportContentFrame!.locator("svg text").first()).toBeVisible();
    const minSvgTextSize = await reportContentFrame!
      .locator("svg text")
      .evaluateAll((nodes) =>
        Math.min(
          ...nodes.map((node) =>
            Number.parseFloat(window.getComputedStyle(node).fontSize),
          ),
        ),
      );
    expect(minSvgTextSize).toBeGreaterThanOrEqual(12);
    await page.getByRole("button", { name: /back to office/i }).last().click();
    await expect(reportFrame).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

async function createVaultFromUi(page: Page, clientName: string): Promise<void> {
  await page.goto("/clients/new");
  await expect(page.getByText("new client")).toBeVisible();

  const inputs = page.locator("form input:not([type=checkbox])");
  const textareas = page.locator("form textarea");
  const selects = page.locator("form select");

  await inputs.nth(0).fill(clientName);
  await inputs.nth(1).fill("https://playwright-brain.example.com");
  await inputs.nth(2).fill("Playwright Brain");
  await inputs.nth(3).fill("Automation QA");
  await inputs.nth(4).fill("QA Editorial Team");
  await selects.nth(0).selectOption("SaaS subscriptions");
  await textareas
    .nth(0)
    .fill("Automation operators who need auditable SEO execution.");
  await inputs.nth(5).fill("QA");
  await selects.nth(1).selectOption("saas");
  await selects.nth(2).selectOption("United States");
  await selects.nth(3).selectOption("English");
  await selects.nth(4).selectOption("America/New_York");
  await textareas.nth(1).fill("zapier.com\nmake.com");
  const form = page.locator("form");
  // Playwright 1.60 can hang on the "stable" actionability check for these
  // labels after the form auto-scrolls to the GitHub field, even though the
  // label is visible, topmost, and static. Force only the click; keep the
  // checked assertions below so the interaction is still verified.
  await form.getByText("Search Console", { exact: true }).click({ force: true });
  await form.getByText("GA4", { exact: true }).click({ force: true });
  await expect(form.getByRole("checkbox", { name: "Search Console" })).toBeChecked();
  await expect(form.getByRole("checkbox", { name: "GA4" })).toBeChecked();

  await page.getByRole("button", { name: /create vault/i }).click({ force: true });
  await expect(page.getByText("Vault ready")).toBeVisible();
}

async function findClient(
  request: APIRequestContext,
  name: string,
): Promise<{ name: string; slug: string }> {
  const list = await request.get("/api/clients");
  expect(list.ok()).toBeTruthy();
  const clients = (await list.json()).clients as Array<{ name: string; slug: string }>;
  const created = clients.find((client) => client.name === name);
  expect(created).toBeTruthy();
  return created!;
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
      { timeout: 60_000, intervals: [250, 500, 1_000] },
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
      { timeout: 30_000, intervals: [250, 500, 1_000] },
    )
    .toBe("ready");
  return combined;
}

function extractReviewPath(chat: string): string {
  const match = chat.match(/wiki\/reviews\/[^\s`)]*brain-sweep-[^\s`)]*\.md/);
  if (!match) throw new Error("missing brain sweep review path in chat");
  return match[0];
}

function firstReportPath(
  sources: Record<string, { path?: string }> | undefined,
): string {
  const values = Object.values(sources ?? {});
  const report = values.find((source) => source.path?.startsWith("reports/"));
  if (!report?.path) throw new Error("missing report path in manifest sources");
  return report.path;
}

function readVaultFile(slug: string, relativePath: string): string {
  const dataDir =
    process.env.SEO_OFFICE_E2E_DATA_DIR ??
    path.join(os.tmpdir(), "seo-office-playwright-e2e");
  return fs.readFileSync(path.join(dataDir, "vaults", slug, relativePath), "utf8");
}
